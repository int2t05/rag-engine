"""
知识库 CRUD 用例
==============
创建、列表、详情（含待上传任务）、更新、删除（MinIO / 向量 / 外键解绑 / DB）。
"""

from __future__ import annotations

import logging
from typing import Any, List

from minio.error import MinioException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import ResourceNotFoundError
from app.core.minio import get_minio_client
from app.models.knowledge import KnowledgeBase
from app.modules.knowledge.repository import KnowledgeRepository
from app.schemas.ai_runtime import AiRuntimeSettings
from app.schemas.knowledge import (
    KnowledgeBaseCreate,
    KnowledgeBaseResponse,
    KnowledgeBaseUpdate,
    PendingUploadTaskResponse,
)
from app.shared.ai_runtime_scope import ai_runtime_scope
from app.shared.embedding.embedding_factory import EmbeddingsFactory
from app.shared.vector_store import VectorStoreFactory

logger = logging.getLogger(__name__)


def create_knowledge_base(
    db: Session, user_id: int, kb_in: KnowledgeBaseCreate
) -> KnowledgeBase:
    """新建知识库并 commit。"""
    kb = KnowledgeBase(name=kb_in.name, description=kb_in.description, user_id=user_id)
    db.add(kb)
    db.commit()
    db.refresh(kb)
    logger.info("知识库创建成功，名称：%s，user_id=%s", kb.name, user_id)
    return kb


def list_knowledge_bases(
    db: Session, user_id: int, skip: int = 0, limit: int = 100
) -> List[KnowledgeBase]:
    repo = KnowledgeRepository(db)
    return repo.list_owned_kbs(user_id, skip=skip, limit=limit)


def get_knowledge_base_detail(
    db: Session, kb_id: int, user_id: int
) -> KnowledgeBaseResponse:
    """404：未找到知识库。"""
    repo = KnowledgeRepository(db)
    kb = repo.get_kb_detail_loaded(kb_id, user_id)
    if not kb:
        raise ResourceNotFoundError("未找到知识库")

    pending_rows = repo.list_pending_upload_tasks_for_kb(kb_id)
    pending_list = [
        PendingUploadTaskResponse(
            task_id=t.id,
            status=t.status,
            file_name=(t.document_upload.file_name if t.document_upload else "?"),
            error_message=t.error_message,
        )
        for t in pending_rows
    ]
    data = KnowledgeBaseResponse.model_validate(kb)  # ORM → Pydantic（过滤字段）
    return data.model_copy(
        update={"pending_upload_tasks": pending_list}
    )  # 追加 pending_upload_tasks 字段


def update_knowledge_base(
    db: Session, kb_id: int, user_id: int, kb_in: KnowledgeBaseUpdate
) -> KnowledgeBase:
    repo = KnowledgeRepository(db)
    kb = repo.get_owned_kb(kb_id, user_id)
    if not kb:
        raise ResourceNotFoundError("未找到知识库")

    for field, value in kb_in.model_dump(exclude_unset=True).items():
        setattr(kb, field, value)
    db.add(kb)
    db.commit()
    db.refresh(kb)
    logger.info("知识库已更新：user_id=%s name=%s", user_id, kb.name)
    return kb


def delete_knowledge_base(
    db: Session,
    user_id: int,
    kb_id: int,
    _rt: AiRuntimeSettings,
) -> dict:
    """
    删除知识库及外部资源；返回 {\"message\": ...} 或带 warnings。
    任意未预期错误转为 HTTP 500（由路由捕获）。
    """
    repo = KnowledgeRepository(db)
    kb = repo.get_owned_kb(kb_id, user_id)
    if not kb:
        raise ResourceNotFoundError("未找到知识库")

    cleanup_errors: List[str] = []
    minio_client = get_minio_client()

    with ai_runtime_scope(db, user_id):
        embeddings = EmbeddingsFactory.create()
        vector_store = VectorStoreFactory.create(
            collection_name=f"kb_{kb_id}",
            embedding_function=embeddings,
        )

    try:
        try:
            objects = minio_client.list_objects(
                settings.MINIO_BUCKET_NAME, prefix=f"kb_{kb_id}/"
            )
            for obj in objects:
                minio_client.remove_object(settings.MINIO_BUCKET_NAME, obj.object_name)
            logger.info("清理知识库 %s 的 MinIO 文件", kb_id)
        except MinioException as e:
            cleanup_errors.append(f"无法清理MinIO文件: {str(e)}")
            logger.error("kb%s MinIO 清理错误: %s", kb_id, e)

        try:
            vector_store.delete_collection()
            logger.info("清理知识库 %s 的矢量存储", kb_id)
        except Exception as e:
            cleanup_errors.append(f"无法清理矢量存储: {str(e)}")
            logger.error("kb%s 矢量存储清理错误: %s", kb_id, e)

        repo.unlink_kb_from_chats(kb_id)
        repo.nullify_evaluation_tasks_kb(kb_id)
        repo.delete_kb_row(kb)
        db.commit()

        if cleanup_errors:
            return {
                "message": "已删除知识库，并附有清理警告",
                "warnings": cleanup_errors,
            }
        return {"message": "已成功删除知识库和所有关联资源"}
    except Exception as e:
        db.rollback()
        logger.error("无法删除知识库 %s：%s", kb_id, e)
        raise
