"""
知识库 API（元数据 CRUD）
=======================
创建、列表、详情、更新、删除知识库本身。
文档上传、处理、检索测试等见 knowledge_documents.py。
"""

from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_active_ai_runtime
from app.core.exceptions import ResourceNotFoundError
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.ai_runtime import AiRuntimeSettings
from app.schemas.knowledge import (
    KnowledgeBaseCreate,
    KnowledgeBaseResponse,
    KnowledgeBaseUpdate,
)
from app.modules.knowledge import (
    create_knowledge_base,
    delete_knowledge_base,
    get_knowledge_base_detail,
    list_knowledge_bases,
    update_knowledge_base,
)

router = APIRouter()


@router.post("", response_model=KnowledgeBaseResponse)
def create_kb_endpoint(
    *,
    db: Session = Depends(get_db),
    kb_in: KnowledgeBaseCreate,
    current_user: User = Depends(get_current_user),
) -> Any:
    """创建新知识库。"""
    return create_knowledge_base(db, current_user.id, kb_in)


@router.get("", response_model=List[KnowledgeBaseResponse])
def list_kb_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """分页列出当前用户的知识库。"""
    return list_knowledge_bases(db, current_user.id, skip=skip, limit=limit)


@router.get("/{kb_id}", response_model=KnowledgeBaseResponse)
def get_kb_endpoint(
    *,
    db: Session = Depends(get_db),
    kb_id: int,
    current_user: User = Depends(get_current_user),
) -> Any:
    """知识库详情（含待处理上传任务摘要）。"""
    try:
        return get_knowledge_base_detail(db, kb_id, current_user.id)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from e


@router.put("/{kb_id}", response_model=KnowledgeBaseResponse)
def update_kb_endpoint(
    *,
    db: Session = Depends(get_db),
    kb_id: int,
    kb_in: KnowledgeBaseUpdate,
    current_user: User = Depends(get_current_user),
) -> Any:
    """更新知识库元数据。"""
    try:
        return update_knowledge_base(db, kb_id, current_user.id, kb_in)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from e


@router.delete("/{kb_id}")
async def delete_kb_endpoint(
    *,
    db: Session = Depends(get_db),
    kb_id: int,
    current_user: User = Depends(get_current_user),
    _rt: AiRuntimeSettings = Depends(require_active_ai_runtime),
) -> Any:
    """删除知识库及关联向量、对象存储与数据库记录。"""
    try:
        return delete_knowledge_base(db, current_user.id, kb_id, _rt)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from e
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"删除知识库失败：{str(e)}"
        ) from e
