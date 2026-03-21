"""
知识库 API
==========
知识库 CRUD、文档上传、分块预览、后台处理、处理状态查询、检索测试。

文档处理流程：上传 → 预览(可选) → 处理 → 轮询状态
"""

import asyncio
import hashlib
import logging
import time
from datetime import datetime, timedelta
from io import BytesIO
from typing import Any, Dict, List, Literal

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
)
from minio.error import MinioException
from pydantic import BaseModel
from sqlalchemy import delete, func
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.evaluation import EvaluationTask
from app.models.chat import chat_knowledge_bases

from app.models.base import BEIJING_TZ

from app.core.config import settings
from app.core.minio import get_minio_client
from app.core.security import get_current_user
from app.api.deps import require_active_ai_runtime
from app.schemas.ai_runtime import AiRuntimeSettings
from app.models.user import User
from app.db.session import get_db
from app.models.knowledge import (
    KnowledgeBase,
    Document,
    ProcessingTask,
    DocumentChunk,
    DocumentUpload,
)
from app.schemas.knowledge import (
    KnowledgeBaseCreate,
    KnowledgeBaseResponse,
    KnowledgeBaseUpdate,
    DocumentResponse,
    PendingUploadTaskResponse,
    PreviewRequest,
)

from app.services.document_processor import (
    process_document_background,
    upload_document,
    preview_document,
    PreviewResult,
)
from app.services.embedding.embedding_factory import EmbeddingsFactory
from app.services.vector_store import VectorStoreFactory
from app.services.rag_dedupe import dedupe_scored_pairs
from app.services.ai_runtime_loader import AiRuntimeNotConfigured
from app.services.ai_runtime_scope import ai_runtime_scope

router = APIRouter()

logger = logging.getLogger(__name__)


class TestRetrievalRequest(BaseModel):
    """检索测试请求体"""

    query: str
    kb_id: int
    top_k: int


class BatchDeleteDocumentsRequest(BaseModel):
    """批量删除文档请求体"""

    document_ids: List[int]


_BATCH_DELETE_DOCS_MAX = 100


def _delete_document_core(
    db: Session,
    kb_id: int,
    doc_id: int,
    user_id: int,
) -> Literal["ok", "not_found"]:
    """
    删除单个文档（向量、MinIO、ProcessingTask、Document）。
    成功则 commit；失败则 rollback 并抛出异常；未找到返回 not_found。
    """
    document = (
        db.query(Document)
        .join(KnowledgeBase)
        .filter(
            Document.id == doc_id,
            Document.knowledge_base_id == kb_id,
            KnowledgeBase.user_id == user_id,
        )
        .first()
    )

    if not document:
        return "not_found"

    try:
        chunk_ids = [
            str(row[0])
            for row in db.query(DocumentChunk.id)
            .filter(DocumentChunk.document_id == doc_id)
            .all()
        ]

        if chunk_ids:
            try:
                with ai_runtime_scope(db, user_id):
                    embeddings = EmbeddingsFactory.create()
                    vector_store = VectorStoreFactory.create(
                        store_type=settings.VECTOR_STORE_TYPE,
                        collection_name=f"kb_{kb_id}",
                        embedding_function=embeddings,
                    )
                    try:
                        vector_store.delete(chunk_ids)
                        logger.info(f"已从向量库删除文档 {doc_id} 的 {len(chunk_ids)} 个分块")
                    except Exception as e:
                        logger.warning(f"向量库删除分块失败（继续删除其他资源）: {e}")
            except AiRuntimeNotConfigured as e:
                logger.warning("未配置模型，跳过向量删除: %s", e.detail)

        minio_client = get_minio_client()
        try:
            minio_client.remove_object(settings.MINIO_BUCKET_NAME, document.file_path)
            logger.info(f"已从 MinIO 删除文件: {document.file_path}")
        except MinioException as e:
            logger.warning(f"MinIO 删除文件失败（继续删除数据库记录）: {e}")

        db.query(ProcessingTask).filter(
            ProcessingTask.document_id == doc_id,
        ).delete(synchronize_session=False)

        db.delete(document)
        db.commit()
        return "ok"
    except Exception as e:
        db.rollback()
        logger.error(f"删除文档 {doc_id} 失败: {e}")
        raise


@router.post("", response_model=KnowledgeBaseResponse)
def create_knowledge_base(
    *,
    db: Session = Depends(get_db),
    kb_in: KnowledgeBaseCreate,
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    创建新知识库
    """
    kb = KnowledgeBase(
        name=kb_in.name, description=kb_in.description, user_id=current_user.id
    )
    db.add(kb)
    db.commit()
    db.refresh(kb)
    logger.info(f"知识库创建成功，名称： {kb.name}，用户名： {current_user.username}")
    return kb


@router.get("", response_model=List[KnowledgeBaseResponse])
def get_knowledge_bases(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """
    查询知识库
    """
    knowledge_bases = (
        db.query(KnowledgeBase)
        .filter(KnowledgeBase.user_id == current_user.id)
        .offset(skip)
        .limit(limit)
        .all()
    )
    return knowledge_bases


@router.get("/{kb_id}", response_model=KnowledgeBaseResponse)
def get_knowledge_base(
    *,
    db: Session = Depends(get_db),
    kb_id: int,
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    根据用户ID查询知识库
    """
    kb = (
        db.query(KnowledgeBase)
        .options(
            joinedload(KnowledgeBase.documents).joinedload(Document.processing_tasks)
        )
        .filter(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id)
        .first()
    )

    if not kb:
        raise HTTPException(status_code=404, detail="未找到知识库")

    pending_rows = (
        db.query(ProcessingTask)
        .options(joinedload(ProcessingTask.document_upload))
        .filter(
            ProcessingTask.knowledge_base_id == kb_id,
            ProcessingTask.document_id.is_(None),
            ProcessingTask.status.in_(["pending", "processing"]),
        )
        .all()
    )
    pending_list = [
        PendingUploadTaskResponse(
            task_id=t.id,
            status=t.status,
            file_name=(t.document_upload.file_name if t.document_upload else "?"),
            error_message=t.error_message,
        )
        for t in pending_rows
    ]
    data = KnowledgeBaseResponse.model_validate(kb)
    return data.model_copy(update={"pending_upload_tasks": pending_list})


@router.put("/{kb_id}", response_model=KnowledgeBaseResponse)
def update_knowledge_base(
    *,
    db: Session = Depends(get_db),
    kb_id: int,
    kb_in: KnowledgeBaseUpdate,
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    更新知识库
    """
    kb = (
        db.query(KnowledgeBase)
        .filter(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id)
        .first()
    )

    if not kb:
        raise HTTPException(status_code=404, detail="未找到知识库")

    for field, value in kb_in.model_dump(exclude_unset=True).items():
        setattr(kb, field, value)

    db.add(kb)
    db.commit()
    db.refresh(kb)
    logger.info(f"知识库已更新：用户{current_user.id}的{kb.name}")
    return kb


@router.delete("/{kb_id}")
async def delete_knowledge_base(
    *,
    db: Session = Depends(get_db),
    kb_id: int,
    current_user: User = Depends(get_current_user),
    _rt: AiRuntimeSettings = Depends(require_active_ai_runtime),
) -> Any:
    """
    删除知识库以及关联的文档和索引
    """
    logger = logging.getLogger(__name__)

    kb = (
        db.query(KnowledgeBase)
        .filter(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id)
        .first()
    )
    if not kb:
        raise HTTPException(status_code=404, detail="未找到知识库")

    try:
        # 在删除前获取所有文档文件路径
        document_paths = [doc.file_path for doc in kb.documents]

        # 初始化服务
        minio_client = get_minio_client()
        with ai_runtime_scope(db, current_user.id):
            embeddings = EmbeddingsFactory.create()
            vector_store = VectorStoreFactory.create(
                store_type=settings.VECTOR_STORE_TYPE,
                collection_name=f"kb_{kb_id}",
                embedding_function=embeddings,
            )

        # 首先清理外部资源
        cleanup_errors = []

        # 1. 清理MinIO文件
        try:
            # 清理前缀为kb_{kb_id}/的所有对象
            objects = minio_client.list_objects(
                settings.MINIO_BUCKET_NAME, prefix=f"kb_{kb_id}/"
            )
            for obj in objects:
                minio_client.remove_object(settings.MINIO_BUCKET_NAME, obj.object_name)
            logger.info(f"清理知识库{kb_id}的MinIO文件 ")
        except MinioException as e:
            cleanup_errors.append(f"无法清理MinIO文件: {str(e)}")
            logger.error(f"kb{kb_id}的 MinIO文件清理错误 : {str(e)}")

        # 2. 清理矢量存储
        try:
            vector_store.delete_collection()
            logger.info(f"清理知识库{kb_id}的矢量存储 ")
        except Exception as e:
            cleanup_errors.append(f"无法清理矢量存储: {str(e)}")
            logger.error(f"kb{kb_id}的矢量存储清理错误 : {str(e)}")

        # 3. 解除引用本知识库的外键，避免 MySQL 1451（evaluation_tasks、对话关联表等）
        db.execute(
            delete(chat_knowledge_bases).where(
                chat_knowledge_bases.c.knowledge_base_id == kb_id
            )
        )
        db.query(EvaluationTask).filter(
            EvaluationTask.knowledge_base_id == kb_id
        ).update({EvaluationTask.knowledge_base_id: None}, synchronize_session=False)

        # 最后在单个事务中删除数据库记录
        db.delete(kb)
        db.commit()

        # 报告响应中的任何清理错误
        if cleanup_errors:
            return {
                "message": "已删除知识库，并附有清理警告",
                "warnings": cleanup_errors,
            }

        return {"message": "已成功删除知识库和所有关联资源"}
    except Exception as e:
        db.rollback()
        logger.error(f"无法删除知识库{kb_id}：{str(e)}")
        raise HTTPException(status_code=500, detail=f"删除知识库失败：{str(e)}")


# 批量上传文档
@router.post("/{kb_id}/documents/upload")
async def upload_kb_documents(
    kb_id: int,
    files: List[UploadFile],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _rt: AiRuntimeSettings = Depends(require_active_ai_runtime),
):
    """
    将多个文档上传到MinIO。
    """
    kb = (
        db.query(KnowledgeBase)
        .filter(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id)
        .first()
    )
    if not kb:
        raise HTTPException(status_code=404, detail="未找到知识库")

    results = []
    for file in files:
        # 1. 计算文件 hash
        file_content = await file.read()
        file_hash = hashlib.sha256(file_content).hexdigest()

        # 2. 检查是否存在完全相同的文件（名称和hash都相同）
        existing_document = (
            db.query(Document)
            .filter(
                Document.file_name == file.filename,
                Document.file_hash == file_hash,
                Document.knowledge_base_id == kb_id,
            )
            .first()
        )

        if existing_document:
            # 完全相同的文件，直接返回
            results.append(
                {
                    "document_id": existing_document.id,
                    "file_name": existing_document.file_name,
                    "status": "exists",
                    "message": "文件已存在且已处理完成",
                    "skip_processing": True,
                }
            )
            continue

        # 3. 上传到临时目录（使用 BytesIO 避免 file 流位置问题）
        temp_path = f"kb_{kb_id}/temp/{file.filename}"
        try:
            minio_client = get_minio_client()
            file_size = len(file_content)
            minio_client.put_object(
                bucket_name=settings.MINIO_BUCKET_NAME,
                object_name=temp_path,
                data=BytesIO(file_content),
                length=file_size,
                content_type=file.content_type or "application/octet-stream",
            )
        except MinioException as e:
            logger.error(f"上传文件到MinIO失败：{str(e)}")
            raise HTTPException(status_code=500, detail="上传文件失败")

        # 4. 创建上传记录
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


@router.post("/{kb_id}/documents/preview")
async def preview_kb_documents(
    kb_id: int,
    preview_request: PreviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[int, PreviewResult]:
    """
    预览多个文档的分块
    """
    results = {}
    for doc_id in preview_request.document_ids:
        document = (
            db.query(Document)
            .join(KnowledgeBase)
            .filter(
                Document.id == doc_id,
                Document.knowledge_base_id == kb_id,
                KnowledgeBase.user_id == current_user.id,
            )
            .first()
        )

        if document:
            file_path = document.file_path
        else:
            upload = (
                db.query(DocumentUpload)
                .join(KnowledgeBase)
                .filter(
                    DocumentUpload.id == doc_id,
                    DocumentUpload.knowledge_base_id == kb_id,
                    KnowledgeBase.user_id == current_user.id,
                )
                .first()
            )

            if not upload:
                raise HTTPException(status_code=404, detail=f"未找到文档{doc_id}")

            file_path = upload.temp_path

        preview = await preview_document(
            file_path,
            chunk_size=preview_request.chunk_size,
            chunk_overlap=preview_request.chunk_overlap,
        )
        results[doc_id] = preview

    return results


@router.post("/{kb_id}/documents/process")
async def process_kb_documents(
    kb_id: int,
    upload_results: List[dict],
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _rt: AiRuntimeSettings = Depends(require_active_ai_runtime),
):
    # BackgroundTasks 是 FastAPI 内置的一个工具类，用于在请求响应返回后，异步执行一些耗时的后台任务
    """
    异步处理多个文档。

    流程：
    1. 校验知识库归属
    2. 创建 ProcessingTask 记录
    3. 将处理任务加入后台队列（add_processing_tasks_to_queue）
    4. 立即返回 task_id 列表，前端可轮询 /documents/tasks 获取状态
    """
    start_time = time.time()

    kb = (
        db.query(KnowledgeBase)
        .filter(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id)
        .first()
    )

    if not kb:
        raise HTTPException(status_code=404, detail="未找到知识库")

    task_info = []
    upload_ids = []

    for result in upload_results:
        if result.get("skip_processing"):
            continue
        upload_ids.append(result["upload_id"])

    if not upload_ids:
        return {"tasks": []}

    # 获取上传记录
    uploads = db.query(DocumentUpload).filter(DocumentUpload.id.in_(upload_ids)).all()
    uploads_dict = {upload.id: upload for upload in uploads}

    all_tasks = []
    for upload_id in upload_ids:
        upload = uploads_dict.get(upload_id)
        if not upload:
            continue

        task = ProcessingTask(
            document_upload_id=upload_id, knowledge_base_id=kb_id, status="pending"
        )
        all_tasks.append(task)

    db.add_all(all_tasks)  # 添加到会话缓存
    db.commit()

    for task in all_tasks:
        db.refresh(task)  # 确保 Python 对象与数据库中的实际记录保持同步

    # 创建异步任务
    task_data = []
    for i, upload_id in enumerate(upload_ids):
        if i < len(all_tasks):
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

    background_tasks.add_task(
        add_processing_tasks_to_queue, task_data, kb_id, current_user.id
    )

    elapsed = round(time.time() - start_time, 2)
    logger.info(f"已提交 {len(task_info)} 个文档处理任务，耗时 {elapsed}s")
    return {"tasks": task_info}


async def add_processing_tasks_to_queue(task_data, kb_id, user_id: int):
    """
    在响应返回后并发执行各文档处理；内部通过 process_document_background
    的 to_thread 避免阻塞事件循环。
    """
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


@router.post("/cleanup")
async def cleanup_temp_files(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    清除临时文件。
    清除文档上传记录（DocumentUpload）及关联的任务处理记录（ProcessingTask），
    以及未指定文档的孤立任务（仅 status 字段）；并删除 MinIO 中的临时文件。
    任务正在运行（pending/processing）的不删除。
    仅处理创建时间超过 24 小时的上传记录，避免清理尚未开始处理或正在排队的新上传。
    """
    # 排除有正在运行任务的上传记录
    running_upload_ids = (
        db.query(ProcessingTask.document_upload_id)
        .filter(
            ProcessingTask.document_upload_id.isnot(None),
            ProcessingTask.status.in_(["pending", "processing"]),
        )
        .distinct()
    )
    cutoff = datetime.now(BEIJING_TZ) - timedelta(hours=24)
    uploads_to_delete = (
        db.query(DocumentUpload)
        .filter(
            DocumentUpload.created_at < cutoff,
            ~DocumentUpload.id.in_(running_upload_ids),
        )
        .all()
    )
    upload_ids_to_delete = [u.id for u in uploads_to_delete]
    deleted_tasks = 0

    # 清除关联的任务处理记录（需在删除 DocumentUpload 之前执行，因外键约束）
    if upload_ids_to_delete:
        deleted_tasks = (
            db.query(ProcessingTask)
            .filter(ProcessingTask.document_upload_id.in_(upload_ids_to_delete))
            .delete(synchronize_session=False)
        )

    # 清除未指定文档的孤立任务（document_upload_id 和 document_id 均为空，且非运行中）
    orphan_tasks_deleted = (
        db.query(ProcessingTask)
        .filter(
            ProcessingTask.document_upload_id.is_(None),
            ProcessingTask.document_id.is_(None),
        )
        .delete(synchronize_session=False)
    )
    deleted_tasks += orphan_tasks_deleted

    minio_client = get_minio_client()
    for upload in uploads_to_delete:
        try:
            minio_client.remove_object(
                bucket_name=settings.MINIO_BUCKET_NAME, object_name=upload.temp_path
            )
        except MinioException as e:
            logger.error(f"无法删除临时文件 {upload.temp_path}: {str(e)}")

        db.delete(upload)

    db.commit()

    msg = f"已清理{len(uploads_to_delete)}条上传记录、{deleted_tasks}条任务处理记录"
    if orphan_tasks_deleted:
        msg += f"（含{orphan_tasks_deleted}条孤立任务）"
    return {"message": msg}


@router.get("/{kb_id}/documents/tasks")
async def get_processing_tasks(
    kb_id: int,
    task_ids: str = Query(..., description="要检查其状态的任务ID的逗号分隔列表"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # task_ids 是必填的查询参数 ... 代表必填
    # Query 是 FastAPI 中用于声明和校验 URL 查询参数的工具（对应 URL 中 ?key=value 部分）
    """
    获取多个处理任务的状态
    """
    task_id_list = [int(id.strip()) for id in task_ids.split(",")]

    kb = (
        db.query(KnowledgeBase)
        .filter(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id)
        .first()
    )

    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    tasks = (
        db.query(ProcessingTask)
        .options(selectinload(ProcessingTask.document_upload))  # 预加载优化
        .filter(
            ProcessingTask.id.in_(task_id_list),
            ProcessingTask.knowledge_base_id == kb_id,
        )
        .all()
    )

    return {
        # 字典推导式
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


@router.get("/{kb_id}/documents/{doc_id}", response_model=DocumentResponse)
async def get_document(
    *,
    db: Session = Depends(get_db),
    kb_id: int,
    doc_id: int,
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    按ID获取文档详细信息。
    """
    document = (
        db.query(Document)
        .join(KnowledgeBase)
        .filter(
            Document.id == doc_id,
            Document.knowledge_base_id == kb_id,
            KnowledgeBase.user_id == current_user.id,
        )
        .first()
    )

    if not document:
        raise HTTPException(status_code=404, detail="文件未找到")

    # 统计分块个数
    chunk_count = (
        db.query(func.count(DocumentChunk.id))
        .filter(DocumentChunk.document_id == doc_id)
        .scalar()
        or 0
    )

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


@router.delete("/{kb_id}/documents/{doc_id}")
async def delete_document(
    *,
    db: Session = Depends(get_db),
    kb_id: int,
    doc_id: int,
    current_user: User = Depends(get_current_user),
    _rt: AiRuntimeSettings = Depends(require_active_ai_runtime),
) -> Any:
    """
    删除文档：移除向量索引、MinIO 文件及数据库记录。
    """
    try:
        result = _delete_document_core(db, kb_id, doc_id, current_user.id)
        if result == "not_found":
            raise HTTPException(status_code=404, detail="文件未找到")
        return {"message": "文档已删除", "doc_id": doc_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除文档失败: {str(e)}")


@router.post("/{kb_id}/documents/batch-delete")
async def batch_delete_documents(
    kb_id: int,
    body: BatchDeleteDocumentsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _rt: AiRuntimeSettings = Depends(require_active_ai_runtime),
) -> Any:
    """
    批量删除文档；逐项执行，部分失败不影响其余项。
    """
    kb = (
        db.query(KnowledgeBase)
        .filter(
            KnowledgeBase.id == kb_id,
            KnowledgeBase.user_id == current_user.id,
        )
        .first()
    )
    if not kb:
        raise HTTPException(status_code=404, detail="未找到知识库")

    raw_ids = list(dict.fromkeys(body.document_ids))
    ids = [i for i in raw_ids if i > 0]
    if not ids:
        raise HTTPException(status_code=400, detail="请提供至少一个有效的 document_id")
    if len(ids) > _BATCH_DELETE_DOCS_MAX:
        raise HTTPException(
            status_code=400,
            detail=f"单次最多删除 {_BATCH_DELETE_DOCS_MAX} 个文档",
        )

    deleted: List[int] = []
    failed: List[Dict[str, Any]] = []

    for doc_id in ids:
        try:
            result = _delete_document_core(db, kb_id, doc_id, current_user.id)
            if result == "ok":
                deleted.append(doc_id)
            else:
                failed.append({"doc_id": doc_id, "detail": "文件未找到"})
        except Exception as e:
            failed.append({"doc_id": doc_id, "detail": str(e)})

    return {"deleted": deleted, "failed": failed}


@router.post("/test-retrieval")
async def test_retrieval(
    request: TestRetrievalRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _rt: AiRuntimeSettings = Depends(require_active_ai_runtime),
) -> Any:
    """
    测试针对知识库的给定查询的检索质量。
    """
    try:
        kb = (
            db.query(KnowledgeBase)
            .filter(
                KnowledgeBase.id == request.kb_id,
                KnowledgeBase.user_id == current_user.id,
            )
            .first()
        )

        if not kb:
            raise HTTPException(
                status_code=404,
                detail=f"未找到知识库{request.kb_id}",
            )

        with ai_runtime_scope(db, current_user.id):
            embeddings = EmbeddingsFactory.create()

            vector_store = VectorStoreFactory.create(
                store_type=settings.VECTOR_STORE_TYPE,
                collection_name=f"kb_{request.kb_id}",
                embedding_function=embeddings,
            )

            results = vector_store.similarity_search_with_score(
                request.query, k=request.top_k
            )
            results = dedupe_scored_pairs(results)

            response = []
            for doc, score in results:
                response.append(
                    {
                        "content": doc.page_content,  # type: ignore
                        "metadata": doc.metadata,  # type: ignore
                        "score": float(score),  # 余弦距离 = 1 - 余弦相似度
                    }
                )

            return {"results": response}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"test-retrieval 错误: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
