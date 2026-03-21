"""
知识库文档生命周期
================
上传、预览、处理入队、任务轮询、详情、删除、批量删除、临时文件清理。
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import time
from datetime import datetime, timedelta
from io import BytesIO
from typing import Any, Dict, List, Literal

from fastapi import BackgroundTasks, HTTPException, UploadFile
from minio.error import MinioException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import BadRequestError, ResourceNotFoundError
from app.core.minio import get_minio_client
from app.models.base import BEIJING_TZ
from app.models.knowledge import Document, DocumentUpload, ProcessingTask
from app.modules.knowledge.repository import KnowledgeRepository
from app.schemas.ai_runtime import AiRuntimeSettings
from app.schemas.knowledge import DocumentResponse, PreviewRequest
from app.shared.ai_runtime_loader import AiRuntimeNotConfigured
from app.shared.ai_runtime_scope import ai_runtime_scope
from app.modules.knowledge.document_processor import (
    PreviewResult,
    preview_document,
    process_document_background,
)
from app.shared.embedding.embedding_factory import EmbeddingsFactory
from app.shared.vector_store import VectorStoreFactory

logger = logging.getLogger(__name__)

BATCH_DELETE_DOCS_MAX = 100


def delete_document_core(
    db: Session,
    kb_id: int,
    doc_id: int,
    user_id: int,
) -> Literal["ok", "not_found"]:
    """
    删除单个文档（向量、MinIO、ProcessingTask、Document）。
    成功则 commit；失败则 rollback 并抛出异常；未找到返回 not_found。
    """
    repo = KnowledgeRepository(db)
    document = repo.get_document_for_delete(kb_id, doc_id, user_id)
    if not document:
        return "not_found"

    try:
        chunk_ids = repo.list_chunk_id_strings(doc_id)
        if chunk_ids:
            try:
                with ai_runtime_scope(db, user_id):
                    embeddings = EmbeddingsFactory.create()
                    vector_store = VectorStoreFactory.create(
                        collection_name=f"kb_{kb_id}",
                        embedding_function=embeddings,
                    )
                    try:
                        vector_store.delete(chunk_ids)
                        logger.info(
                            "已从向量库删除文档 %s 的 %s 个分块",
                            doc_id,
                            len(chunk_ids),
                        )
                    except Exception as e:
                        logger.warning("向量库删除分块失败（继续删除其他资源）: %s", e)
            except AiRuntimeNotConfigured as e:
                logger.warning("未配置模型，跳过向量删除: %s", e.detail)

        minio_client = get_minio_client()
        try:
            minio_client.remove_object(settings.MINIO_BUCKET_NAME, document.file_path)
            logger.info("已从 MinIO 删除文件: %s", document.file_path)
        except MinioException as e:
            logger.warning("MinIO 删除文件失败（继续删除数据库记录）: %s", e)

        repo.delete_processing_tasks_for_document(doc_id)
        db.delete(document)
        db.commit()
        return "ok"
    except Exception as e:
        db.rollback()
        logger.error("删除文档 %s 失败: %s", doc_id, e)
        raise


async def upload_kb_documents(
    db: Session,
    user_id: int,
    kb_id: int,
    files: List[UploadFile],
    _rt: AiRuntimeSettings,
) -> List[dict]:
    repo = KnowledgeRepository(db)
    if not repo.get_owned_kb(kb_id, user_id):
        raise ResourceNotFoundError("未找到知识库")

    results: List[dict] = []
    minio_client = get_minio_client()

    for file in files:
        file_content = await file.read()
        file_hash = hashlib.sha256(file_content).hexdigest()

        existing = repo.find_document_by_name_and_hash(
            kb_id, file.filename or "", file_hash
        )
        if existing:
            results.append(
                {
                    "document_id": existing.id,
                    "file_name": existing.file_name,
                    "status": "exists",
                    "message": "文件已存在且已处理完成",
                    "skip_processing": True,
                }
            )
            continue

        temp_path = f"kb_{kb_id}/temp/{file.filename}"
        try:
            file_size = len(file_content)
            minio_client.put_object(
                bucket_name=settings.MINIO_BUCKET_NAME,
                object_name=temp_path,
                data=BytesIO(file_content),
                length=file_size,
                content_type=file.content_type or "application/octet-stream",
            )
        except MinioException as e:
            logger.error("上传文件到MinIO失败：%s", e)
            raise HTTPException(status_code=500, detail="上传文件失败") from e

        upload = DocumentUpload(
            knowledge_base_id=kb_id,
            file_name=file.filename,
            file_hash=file_hash,
            file_size=len(file_content),
            content_type=file.content_type,
            temp_path=temp_path,
        )
        db.add(upload)
        db.commit()
        db.refresh(upload)

        results.append(
            {
                "upload_id": upload.id,
                "file_name": file.filename,
                "temp_path": temp_path,
                "status": "pending",
                "skip_processing": False,
            }
        )

    return results


async def preview_kb_documents(
    db: Session,
    user_id: int,
    kb_id: int,
    preview_request: PreviewRequest,
) -> Dict[int, PreviewResult]:
    """按文档 ID 校验归属（含 kb_id）；document_ids 为空时直接返回空字典。"""
    repo = KnowledgeRepository(db)
    results: Dict[int, PreviewResult] = {}
    for doc_id in preview_request.document_ids:
        document = repo.get_document_owned(kb_id, doc_id, user_id)
        if document:
            file_path = document.file_path
        else:
            upload = repo.get_upload_owned(kb_id, doc_id, user_id)
            if not upload:
                raise ResourceNotFoundError(f"未找到文档{doc_id}")
            file_path = upload.temp_path

        preview = await preview_document(
            file_path,
            chunk_size=preview_request.chunk_size,
            chunk_overlap=preview_request.chunk_overlap,
        )
        results[doc_id] = preview

    return results


def submit_document_processing(
    db: Session,
    user_id: int,
    kb_id: int,
    upload_results: List[dict],
    background_tasks: BackgroundTasks,
    _rt: AiRuntimeSettings,
) -> dict:
    start_time = time.time()
    repo = KnowledgeRepository(db)
    if not repo.get_owned_kb(kb_id, user_id):
        raise ResourceNotFoundError("未找到知识库")

    task_info: List[dict] = []
    upload_ids: List[int] = []
    for result in upload_results:
        if result.get("skip_processing"):
            continue
        upload_ids.append(result["upload_id"])

    if not upload_ids:
        return {"tasks": []}

    uploads_dict = {u.id: u for u in repo.get_uploads_by_ids(upload_ids)}

    all_tasks: List[ProcessingTask] = []
    for upload_id in upload_ids:
        upload = uploads_dict.get(upload_id)
        if not upload:
            continue
        all_tasks.append(
            ProcessingTask(
                document_upload_id=upload_id,
                knowledge_base_id=kb_id,
                status="pending",
            )
        )

    repo.add_processing_tasks(all_tasks)
    db.commit()
    for task in all_tasks:
        db.refresh(task)

    task_data: List[dict] = []
    for i, upload_id in enumerate(upload_ids):
        if i >= len(all_tasks):
            break
        task = all_tasks[i]
        upload = uploads_dict.get(upload_id)
        task_info.append({"upload_id": upload_id, "task_id": task.id})
        if upload:
            task_data.append(
                {
                    "task_id": task.id,
                    "upload_id": upload_id,
                    "temp_path": upload.temp_path,
                    "file_name": upload.file_name,
                }
            )

    background_tasks.add_task(add_processing_tasks_to_queue, task_data, kb_id, user_id)
    elapsed = round(time.time() - start_time, 2)
    logger.info("已提交 %s 个文档处理任务，耗时 %ss", len(task_info), elapsed)
    return {"tasks": task_info}


async def add_processing_tasks_to_queue(task_data: List[dict], kb_id: int, user_id: int):
    """响应返回后并发执行各文档处理。"""
    if not task_data:
        return
    results = await asyncio.gather(
        *[
            process_document_background(
                data["temp_path"],
                data["file_name"],
                kb_id,
                data["task_id"],
                None,
                user_id=user_id,
            )
            for data in task_data
        ],
        return_exceptions=True,
    )
    for data, res in zip(task_data, results):
        if isinstance(res, Exception):
            logger.error(
                "文档处理失败 task_id=%s file=%s: %s",
                data.get("task_id"),
                data.get("file_name"),
                res,
                exc_info=res if res.__traceback__ else None,
            )
    logger.info(
        "文档处理批次结束：共 %s 个任务（失败见上方 error 日志）",
        len(task_data),
    )


def cleanup_temp_files(db: Session) -> dict:
    repo = KnowledgeRepository(db)
    running_subq = repo.list_running_upload_ids_subquery()
    cutoff = datetime.now(BEIJING_TZ) - timedelta(hours=24)
    uploads_to_delete = repo.list_stale_uploads(cutoff, running_subq)
    upload_ids_to_delete = [u.id for u in uploads_to_delete]

    deleted_tasks = 0
    if upload_ids_to_delete:
        deleted_tasks = repo.delete_tasks_for_upload_ids(upload_ids_to_delete)

    orphan_tasks_deleted = repo.delete_orphan_processing_tasks()
    deleted_tasks += orphan_tasks_deleted

    minio_client = get_minio_client()
    for upload in uploads_to_delete:
        try:
            minio_client.remove_object(
                bucket_name=settings.MINIO_BUCKET_NAME, object_name=upload.temp_path
            )
        except MinioException as e:
            logger.error("无法删除临时文件 %s: %s", upload.temp_path, e)
        repo.delete_upload_row(upload)

    db.commit()
    msg = f"已清理{len(uploads_to_delete)}条上传记录、{deleted_tasks}条任务处理记录"
    if orphan_tasks_deleted:
        msg += f"（含{orphan_tasks_deleted}条孤立任务）"
    return {"message": msg}


def get_processing_tasks_status(
    db: Session, user_id: int, kb_id: int, task_ids_csv: str
) -> dict:
    repo = KnowledgeRepository(db)
    if not repo.get_owned_kb(kb_id, user_id):
        raise ResourceNotFoundError("Knowledge base not found")

    task_id_list = [int(x.strip()) for x in task_ids_csv.split(",")]
    tasks = repo.get_processing_tasks_for_kb(kb_id, task_id_list)
    return {
        task.id: {
            "document_id": task.document_id,
            "status": task.status,
            "error_message": task.error_message,
            "upload_id": task.document_upload_id,
            "file_name": (
                task.document_upload.file_name if task.document_upload else None
            ),
        }
        for task in tasks
    }


def get_document_detail(
    db: Session, user_id: int, kb_id: int, doc_id: int
) -> DocumentResponse:
    repo = KnowledgeRepository(db)
    document = repo.get_document_owned(kb_id, doc_id, user_id)
    if not document:
        raise ResourceNotFoundError("文件未找到")

    chunk_count = repo.count_chunks(doc_id)
    return DocumentResponse(
        id=document.id,
        file_name=document.file_name,
        file_path=document.file_path,
        file_hash=document.file_hash,
        file_size=document.file_size,
        content_type=document.content_type,
        knowledge_base_id=document.knowledge_base_id,
        created_at=document.created_at,
        updated_at=document.updated_at,
        processing_tasks=document.processing_tasks,
        chunk_count=chunk_count,
    )


def delete_one_document(
    db: Session,
    user_id: int,
    kb_id: int,
    doc_id: int,
    _rt: AiRuntimeSettings,
) -> dict:
    result = delete_document_core(db, kb_id, doc_id, user_id)
    if result == "not_found":
        raise ResourceNotFoundError("文件未找到")
    return {"message": "文档已删除", "doc_id": doc_id}


def batch_delete_documents(
    db: Session,
    user_id: int,
    kb_id: int,
    document_ids: List[int],
    _rt: AiRuntimeSettings,
) -> dict:
    repo = KnowledgeRepository(db)
    if not repo.get_owned_kb(kb_id, user_id):
        raise ResourceNotFoundError("未找到知识库")

    raw_ids = list(dict.fromkeys(document_ids))
    ids = [i for i in raw_ids if i > 0]
    if not ids:
        raise BadRequestError("请提供至少一个有效的 document_id")
    if len(ids) > BATCH_DELETE_DOCS_MAX:
        raise BadRequestError(f"单次最多删除 {BATCH_DELETE_DOCS_MAX} 个文档")

    deleted: List[int] = []
    failed: List[Dict[str, Any]] = []

    for doc_id in ids:
        try:
            result = delete_document_core(db, kb_id, doc_id, user_id)
            if result == "ok":
                deleted.append(doc_id)
            else:
                failed.append({"doc_id": doc_id, "detail": "文件未找到"})
        except Exception as e:
            failed.append({"doc_id": doc_id, "detail": str(e)})

    return {"deleted": deleted, "failed": failed}
