"""
知识库文档生命周期
================
上传、预览、处理入队、任务轮询、详情、删除、批量删除、临时文件清理。
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import time
from io import BytesIO
from typing import Any, Dict, List, Literal, Optional

from fastapi import BackgroundTasks, HTTPException, UploadFile
from minio.error import MinioException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import BadRequestError, ResourceNotFoundError
from app.core.minio import get_minio_client
from app.models.knowledge import Document, DocumentUpload, ProcessingTask
from app.modules.knowledge.repository import KnowledgeRepository
from app.schemas.ai_runtime import AiRuntimeSettings
from app.schemas.knowledge import DocumentResponse, PreviewRequest
from app.shared.ai_runtime_loader import AiRuntimeNotConfigured
from app.shared.ai_runtime_scope import ai_runtime_scope
from app.db.session import SessionLocal
from app.modules.knowledge.document_processor import (
    PreviewResult,
    preview_document,
    process_document,
    process_document_background,
)
from app.shared.embedding.embedding_factory import EmbeddingsFactory
from app.shared.vector_store import VectorStoreFactory

logger = logging.getLogger(__name__)

BATCH_DELETE_DOCS_MAX = 100


def _validate_split_params(
    chunk_size: int,
    chunk_overlap: int,
    *,
    parent_chunk_size: Optional[int] = None,
    parent_chunk_overlap: Optional[int] = None,
    child_chunk_size: Optional[int] = None,
    child_chunk_overlap: Optional[int] = None,
    use_parent_child: bool = False,
) -> None:
    """校验分块参数；父子分块时四元组须全有或全无，且每组 overlap < size。"""
    if chunk_overlap >= chunk_size:
        raise BadRequestError("chunk_overlap 必须小于 chunk_size")
    group = (
        parent_chunk_size,
        parent_chunk_overlap,
        child_chunk_size,
        child_chunk_overlap,
    )
    if any(x is not None for x in group) and not all(x is not None for x in group):
        raise BadRequestError(
            "父子分块参数须同时提供 parent_chunk_size、parent_chunk_overlap、"
            "child_chunk_size、child_chunk_overlap，或全部省略以按常规块大小推导父/子"
        )
    if use_parent_child and all(x is not None for x in group):
        ps, po, cs, co = group
        assert ps is not None and po is not None and cs is not None and co is not None
        if po >= ps:
            raise BadRequestError("parent_chunk_overlap 必须小于 parent_chunk_size")
        if co >= cs:
            raise BadRequestError("child_chunk_overlap 必须小于 child_chunk_size")


def _upload_basename(filename: str | None) -> str:
    if not filename:
        return ""
    return os.path.basename(filename.replace("\\", "/"))


async def replace_kb_document(
    db: Session,
    user_id: int,
    kb_id: int,
    doc_id: int,
    file: UploadFile,
    *,
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
    parent_chunk_size: Optional[int] = None,
    parent_chunk_overlap: Optional[int] = None,
    child_chunk_size: Optional[int] = None,
    child_chunk_overlap: Optional[int] = None,
) -> dict:
    """
    覆盖已入库文档：上传文件名须与 document.file_name 一致；写入 MinIO 原路径后
    调用 process_document 做分块级增量更新。
    """
    repo = KnowledgeRepository(db)
    kb_ent = repo.get_owned_kb(kb_id, user_id)
    if not kb_ent:
        raise ResourceNotFoundError("未找到知识库")
    document = repo.get_document_owned(kb_id, doc_id, user_id)
    if not document:
        raise ResourceNotFoundError("未找到文档")

    incoming = _upload_basename(file.filename)
    if not incoming:
        raise BadRequestError("缺少文件名")
    use_pc = bool(kb_ent.parent_child_chunking) or settings.RAG_PARENT_CHILD_INGEST
    _validate_split_params(
        chunk_size,
        chunk_overlap,
        parent_chunk_size=parent_chunk_size,
        parent_chunk_overlap=parent_chunk_overlap,
        child_chunk_size=child_chunk_size,
        child_chunk_overlap=child_chunk_overlap,
        use_parent_child=use_pc,
    )
    if incoming != document.file_name:
        raise BadRequestError(
            f"文件名须与原文档一致（原文档：{document.file_name}，上传：{incoming}）"
        )

    content = await file.read()
    file_size = len(content)
    file_hash = hashlib.sha256(content).hexdigest()

    minio_client = get_minio_client()
    ct = file.content_type or document.content_type or "application/octet-stream"
    try:
        minio_client.put_object(
            bucket_name=settings.MINIO_BUCKET_NAME,
            object_name=document.file_path,
            data=BytesIO(content),
            length=file_size,
            content_type=ct,
        )
    except MinioException as e:
        logger.error("替换文档写入 MinIO 失败: %s", e)
        raise BadRequestError(f"写入对象存储失败: {e}") from e

    try:
        await process_document(
            document.file_path,
            document.file_name,
            kb_id,
            document.id,
            user_id,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            parent_chunk_size=parent_chunk_size,
            parent_chunk_overlap=parent_chunk_overlap,
            child_chunk_size=child_chunk_size,
            child_chunk_overlap=child_chunk_overlap,
        )
    except Exception as e:
        logger.error("replace_kb_document 处理失败: %s", e, exc_info=True)
        raise BadRequestError(f"增量处理失败: {e}") from e

    document.file_hash = file_hash # type: ignore
    document.file_size = file_size # type: ignore
    document.content_type = ct # type: ignore
    # 保留处理记录：replace 不走上传队列，须单独写入任务行，否则列表无法展示「已完成」
    db.add(
        ProcessingTask(
            knowledge_base_id=kb_id,
            document_id=document.id,
            document_upload_id=None,
            status="completed",
            error_message=None,
        )
    )
    db.commit()
    db.refresh(document)

    return {
        "document_id": document.id,
        "file_name": document.file_name,
        "file_hash": document.file_hash,
        "file_size": document.file_size,
        "message": "已替换并增量更新向量",
    }


async def process_document_replace_background(
    task_id: int,
    kb_id: int,
    user_id: int,
    data: dict,
) -> None:
    """
    首次上传流程中的「同名覆盖」：内容已写入 MinIO 永久路径，
    仅执行 process_document 增量向量化并回写 Document 元数据。
    """
    db = SessionLocal()
    try:
        task = (
            db.query(ProcessingTask).filter(ProcessingTask.id == task_id).first()
        )
        if not task:
            logger.error("replace 任务不存在: task_id=%s", task_id)
            return
        task.status = "processing" # type: ignore
        db.commit()

        doc_id = data["document_id"]
        document = db.query(Document).filter(Document.id == doc_id).first()
        if not document:
            raise RuntimeError("文档不存在")

        await process_document(
            document.file_path,
            document.file_name,
            kb_id,
            doc_id,
            user_id,
            chunk_size=data.get("chunk_size", 1000),
            chunk_overlap=data.get("chunk_overlap", 200),
            parent_chunk_size=data.get("parent_chunk_size"),
            parent_chunk_overlap=data.get("parent_chunk_overlap"),
            child_chunk_size=data.get("child_chunk_size"),
            child_chunk_overlap=data.get("child_chunk_overlap"),
        )

        document = db.query(Document).filter(Document.id == doc_id).first()
        if document:
            document.file_hash = data["file_hash"]
            document.file_size = data["file_size"]
            document.content_type = data["content_type"]
        task = (
            db.query(ProcessingTask).filter(ProcessingTask.id == task_id).first()
        )
        if task:
            task.status = "completed" # type: ignore
            task.error_message = None # type: ignore
        db.commit()
    except Exception as e:
        logger.error(
            "replace 后台处理失败 task_id=%s: %s", task_id, e, exc_info=True
        )
        try:
            task = (
                db.query(ProcessingTask)
                .filter(ProcessingTask.id == task_id)
                .first()
            )
            if task:
                task.status = "failed" # type: ignore
                task.error_message = str(e) # type: ignore
                db.commit()
        except Exception:
            db.rollback()
        raise
    finally:
        db.close()


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
    """
    上传多个文件到 MinIO，并创建数据库记录。
    """
    repo = KnowledgeRepository(db)
    if not repo.get_owned_kb(kb_id, user_id):
        raise ResourceNotFoundError("未找到知识库")

    results: List[dict] = []
    minio_client = get_minio_client()

    for file in files:
        # 1.文件去重（SHA-256）
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

        # 同名不同内容：覆盖原永久路径，提交后走增量向量化（顶替同一 document_id）
        existing_same_name = repo.find_document_by_filename_in_kb(
            kb_id, file.filename or ""
        )
        if existing_same_name:
            file_size = len(file_content)
            ct = (
                file.content_type
                or existing_same_name.content_type
                or "application/octet-stream"
            )
            try:
                minio_client.put_object(
                    bucket_name=settings.MINIO_BUCKET_NAME,
                    object_name=existing_same_name.file_path,
                    data=BytesIO(file_content),
                    length=file_size,
                    content_type=ct,
                )
            except MinioException as e:
                logger.error("覆盖已存在文档失败：%s", e)
                raise HTTPException(status_code=500, detail="上传文件失败") from e
            results.append(
                {
                    "document_id": existing_same_name.id,
                    "file_name": file.filename or "",
                    "file_hash": file_hash,
                    "file_size": file_size,
                    "content_type": ct,
                    "status": "pending_replace",
                    "skip_processing": False,
                    "replace": True,
                }
            )
            continue

        # 2.上传到 MinIO（临时存储）
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

        # 3.创建数据库记录（待处理）
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
    kb_ent = repo.get_owned_kb(kb_id, user_id)
    if not kb_ent:
        raise ResourceNotFoundError("未找到知识库")
    use_pc = bool(kb_ent.parent_child_chunking) or settings.RAG_PARENT_CHILD_INGEST
    _validate_split_params(
        preview_request.chunk_size,
        preview_request.chunk_overlap,
        parent_chunk_size=preview_request.parent_chunk_size,
        parent_chunk_overlap=preview_request.parent_chunk_overlap,
        child_chunk_size=preview_request.child_chunk_size,
        child_chunk_overlap=preview_request.child_chunk_overlap,
        use_parent_child=use_pc,
    )
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
            kb_id=kb_id,
            use_parent_child=use_pc,
            parent_chunk_size=preview_request.parent_chunk_size,
            parent_chunk_overlap=preview_request.parent_chunk_overlap,
            child_chunk_size=preview_request.child_chunk_size,
            child_chunk_overlap=preview_request.child_chunk_overlap,
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
    *,
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
    parent_chunk_size: Optional[int] = None,
    parent_chunk_overlap: Optional[int] = None,
    child_chunk_size: Optional[int] = None,
    child_chunk_overlap: Optional[int] = None,
) -> dict:
    """
    提交流待处理文档进入向量处理队列。

    业务流程：
    1. 权限校验：确认用户拥有该知识库
    2. 过滤跳过项：从上传结果中排除「已存在无需处理」的文件
    3. 构造任务：为每个待处理文档创建 ProcessingTask 记录（状态为 pending）
    4. 批量入库：一次性插入任务记录并 commit
    5. 触发异步处理：通过 BackgroundTasks 将任务投入后台并发执行
    6. 返回任务映射：前端可依据 upload_id + task_id 轮询处理状态

    Args:
        db: 数据库会话
        user_id: 当前用户 ID（用于校验知识库归属）
        kb_id: 知识库 ID
        upload_results: upload_kb_documents 的返回值列表，包含 upload_id / skip_processing 等字段
        background_tasks: FastAPI BackgroundTasks（用于注册后台任务）
        _rt: AI 运行时配置（当前未使用，保留接口兼容）

    Returns:
        {"tasks": [{"upload_id": int, "task_id": int}, ...]}
    """
    start_time = time.time()

    # 1. 权限校验：确保用户拥有该知识库
    repo = KnowledgeRepository(db)
    kb_ent = repo.get_owned_kb(kb_id, user_id)
    if not kb_ent:
        raise ResourceNotFoundError("未找到知识库")
    use_pc = bool(kb_ent.parent_child_chunking) or settings.RAG_PARENT_CHILD_INGEST
    _validate_split_params(
        chunk_size,
        chunk_overlap,
        parent_chunk_size=parent_chunk_size,
        parent_chunk_overlap=parent_chunk_overlap,
        child_chunk_size=child_chunk_size,
        child_chunk_overlap=child_chunk_overlap,
        use_parent_child=use_pc,
    )

    task_info: List[dict] = []
    ordered: List[tuple] = []

    # 2. 过滤跳过项；保留顺序：新上传（DocumentUpload）与同名覆盖（replace）可混排
    for result in upload_results:
        if result.get("skip_processing"):
            continue
        if result.get("replace"):
            ordered.append(("replace", result))
        else:
            uid = result.get("upload_id")
            if uid is not None:
                ordered.append(("upload", uid))

    if not ordered:
        return {"tasks": []}

    upload_ids = [p for kind, p in ordered if kind == "upload"]
    uploads_dict = (
        {u.id: u for u in repo.get_uploads_by_ids(upload_ids)} if upload_ids else {}
    )

    all_tasks: List[ProcessingTask] = []
    for kind, payload in ordered:
        if kind == "upload":
            upload = uploads_dict.get(payload)
            if not upload:
                raise ResourceNotFoundError(f"未找到上传记录 {payload}")
            all_tasks.append(
                ProcessingTask(
                    document_upload_id=payload,
                    knowledge_base_id=kb_id,
                    status="pending",
                )
            )
        else:
            all_tasks.append(
                ProcessingTask(
                    document_id=payload["document_id"],
                    knowledge_base_id=kb_id,
                    document_upload_id=None,
                    status="pending",
                )
            )

    repo.add_processing_tasks(all_tasks)
    db.commit()
    for task in all_tasks:
        db.refresh(task)

    task_data: List[dict] = []
    for i, (kind, payload) in enumerate(ordered):
        task = all_tasks[i]
        if kind == "upload":
            upload = uploads_dict[payload]
            task_info.append({"upload_id": payload, "task_id": task.id})
            task_data.append(
                {
                    "task_id": task.id,
                    "replace": False,
                    "temp_path": upload.temp_path,
                    "file_name": upload.file_name,
                }
            )
        else:
            task_info.append(
                {"document_id": payload["document_id"], "task_id": task.id}
            )
            task_data.append(
                {
                    "task_id": task.id,
                    "replace": True,
                    "document_id": payload["document_id"],
                    "file_name": payload["file_name"],
                    "file_hash": payload["file_hash"],
                    "file_size": payload["file_size"],
                    "content_type": payload["content_type"],
                }
            )

    chunk_bundle = {
        "chunk_size": chunk_size,
        "chunk_overlap": chunk_overlap,
        "parent_chunk_size": parent_chunk_size,
        "parent_chunk_overlap": parent_chunk_overlap,
        "child_chunk_size": child_chunk_size,
        "child_chunk_overlap": child_chunk_overlap,
    }
    for td in task_data:
        td.update(chunk_bundle)

    # 7. 注册后台任务：HTTP 响应返回后，并发执行各文档的向量化处理
    background_tasks.add_task(add_processing_tasks_to_queue, task_data, kb_id, user_id)

    elapsed = round(time.time() - start_time, 2)
    logger.info("已提交 %s 个文档处理任务，耗时 %ss", len(task_info), elapsed)
    return {"tasks": task_info}


async def add_processing_tasks_to_queue(
    task_data: List[dict], kb_id: int, user_id: int
):
    """
    响应返回后并发执行各文档处理。

    该函数在 HTTP 响应发送给前端后，由 BackgroundTasks 在后台运行，
    真正完成文档的读取、分块、向量化、写入向量库等耗时操作。
    """
    # 无任务时直接返回，避免不必要地创建事件循环
    if not task_data:
        return

    # 使用 asyncio.gather 并发执行所有文档的向量化处理；
    # return_exceptions=True 使单个任务失败不影响其他任务，
    # 异常会被捕获进 results 列表而非直接抛出
    async def _run_one(data: dict):
        if data.get("replace"):
            return await process_document_replace_background(
                data["task_id"], kb_id, user_id, data
            )
        return await process_document_background(
            data["temp_path"],
            data["file_name"],
            kb_id,
            data["task_id"],
            None,
            user_id=user_id,
            chunk_size=data.get("chunk_size", 1000),
            chunk_overlap=data.get("chunk_overlap", 200),
            parent_chunk_size=data.get("parent_chunk_size"),
            parent_chunk_overlap=data.get("parent_chunk_overlap"),
            child_chunk_size=data.get("child_chunk_size"),
            child_chunk_overlap=data.get("child_chunk_overlap"),
        )

    results = await asyncio.gather(
        *[_run_one(data) for data in task_data],
        return_exceptions=True,
    )

    # 逐个检查任务结果，将失败项记录到 error 日志
    for data, res in zip(task_data, results):
        if isinstance(res, Exception):
            logger.error(
                "文档处理失败 task_id=%s file=%s: %s",
                data.get("task_id"),
                data.get("file_name"),
                res,
                # 有 traceback 时打印完整堆栈，方便排查；无堆栈时只打印异常对象本身
                exc_info=res if res.__traceback__ else None,
            )

    # 批次结束日志（成功的任务不打印具体信息，失败信息已在上面逐条输出）
    logger.info(
        "文档处理批次结束：共 %s 个任务（失败见上方 error 日志）",
        len(task_data),
    )


def cleanup_temp_files(db: Session) -> dict:
    """
    清理临时上传与孤立任务。
    1. 排除集：仅「DocumentUpload 仍为 pending」且存在 pending/processing 任务
    2. 其余上传 → 删关联任务、删 MinIO、删 upload 行
    3. 再删无 upload/document 指向的孤立 ProcessingTask
    """
    repo = KnowledgeRepository(db)

    protected_subq = repo.list_running_upload_ids_subquery()

    uploads_to_delete = repo.list_uploads_eligible_for_cleanup(protected_subq)
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
    """
    获取处理任务状态
    """
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
                task.document_upload.file_name
                if task.document_upload
                else (task.document.file_name if task.document else None)
            ),
        }
        for task in tasks
    }


def get_document_detail(
    db: Session, user_id: int, kb_id: int, doc_id: int
) -> DocumentResponse:
    """
    获取文件详情
    """
    repo = KnowledgeRepository(db)
    document = repo.get_document_owned(kb_id, doc_id, user_id)
    if not document:
        raise ResourceNotFoundError("文件未找到")

    kb = repo.get_owned_kb(kb_id, user_id)
    parent_child = bool(kb and kb.parent_child_chunking)
    chunk_count = repo.count_chunks(doc_id)
    parent_n = repo.count_parent_chunks(doc_id) if parent_child else 0
    child_n = max(0, chunk_count - parent_n) if parent_child else chunk_count
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
        parent_chunk_count=parent_n if parent_child else None,
        child_chunk_count=child_n if parent_child else None,
        parent_child_chunking=parent_child,
    )


def delete_one_document(
    db: Session,
    user_id: int,
    kb_id: int,
    doc_id: int,
    _rt: AiRuntimeSettings,
) -> dict:
    """
    删除一个文件
    """
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
    """
    批量删除文件
    """
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
