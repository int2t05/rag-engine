"""
知识库 API
==========
知识库 CRUD、文档上传、分块预览、后台处理、处理状态查询、检索测试。
文档处理流程：上传 → 预览(可选) → 处理 → 轮询状态
"""

import hashlib
from typing import List, Any, Dict
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
    BackgroundTasks,
    Query,
)
from sqlalchemy.orm import Session

from langchain_chroma import Chroma
from sqlalchemy import text
import logging
from datetime import datetime, timedelta
from pydantic import BaseModel
from sqlalchemy.orm import selectinload
import time
import asyncio

from app.db.session import get_db
from app.models.user import User
from app.core.security import get_current_user
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
    PreviewRequest,
)

from app.services.document_processor import (
    process_document_background,
    upload_document,
    preview_document,
    PreviewResult,
)
from app.core.config import settings
from app.core.minio import get_minio_client
from minio.error import MinioException

from app.services.vector_store import VectorStoreFactory
from app.services.embedding.embedding_factory import EmbeddingsFactory

router = APIRouter()

logger = logging.getLogger(__name__)


class TestRetrievalRequest(BaseModel):
    """检索测试请求体"""

    query: str
    kb_id: int
    top_k: int


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
    from sqlalchemy.orm import joinedload

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

    return kb


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

    for field, value in kb_in.dict(exclude_unset=True).items():
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

        # 3. 上传到临时目录
        temp_path = f"kb_{kb_id}/temp/{file.filename}"
        await file.seek(0)  # 将文件指针重新定位到文件开头
        try:
            minio_client = get_minio_client()
            file_size = len(file_content)  # 使用之前读取的文件内容长度
            minio_client.put_object(
                bucket_name=settings.MINIO_BUCKET_NAME,
                object_name=temp_path,
                data=file.file,
                length=file_size,  # 指定文件大小
                content_type=file.content_type,
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
):
    # BackgroundTasks 是 FastAPI 内置的一个工具类，用于在请求响应返回后，异步执行一些耗时的后台任务
    """
    异步处理多个文档。
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

    background_tasks.add_task(add_processing_tasks_to_queue, task_data, kb_id)

    return {"tasks": task_info}


async def add_processing_tasks_to_queue(task_data, kb_id):
    """
    辅助函数将文档处理任务添加到队列中，而不会阻塞主响应。
    """
    for data in task_data:
        asyncio.create_task(
            process_document_background(
                data["temp_path"], data["file_name"], kb_id, data["task_id"], None
            )
        )
    logger.info(f"已将{len(task_data)}个文档处理任务添加到队列")


@router.post("/cleanup")
async def cleanup_temp_files(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    清理过期的临时文件。
    """
    from app.models.base import BEIJING_TZ

    expired_time = datetime.now(BEIJING_TZ) - timedelta(hours=24)
    expired_uploads = (
        db.query(DocumentUpload).filter(DocumentUpload.created_at < expired_time).all()
    )

    minio_client = get_minio_client()
    for upload in expired_uploads:
        try:
            minio_client.remove_object(
                bucket_name=settings.MINIO_BUCKET_NAME, object_name=upload.temp_path
            )
        except MinioException as e:
            logger.error(f"无法删除临时文件 {upload.temp_path}: {str(e)}")

        db.delete(upload)

    db.commit()

    return {"message": f"已清理{len(expired_uploads)}条过期上传"}


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

    return document


@router.post("/test-retrieval")
async def test_retrieval(
    request: TestRetrievalRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
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

        # 初始化
        embeddings = EmbeddingsFactory.create()

        vector_store = VectorStoreFactory.create(
            store_type=settings.VECTOR_STORE_TYPE,
            collection_name=f"kb_{request.kb_id}",
            embedding_function=embeddings,
        )

        results = vector_store.similarity_search_with_score(
            request.query, k=request.top_k
        )

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

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
