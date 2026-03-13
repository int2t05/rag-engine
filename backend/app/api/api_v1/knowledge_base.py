# backend/app/api/api_v1/knowledge_base.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.models.user import User
from app.models.knowledge import KnowledgeBase
from app.schemas.knowledge import (
    KnowledgeBaseCreate,
    KnowledgeBaseResponse,
    KnowledgeBaseUpdate,
)
from app.core.security import get_current_user

router = APIRouter()

# 创建知识库
@router.post(
    "", response_model=KnowledgeBaseResponse, status_code=status.HTTP_201_CREATED
)
def create_knowledge_base(
    kb_in: KnowledgeBaseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """创建新知识库（仅当前登录用户可操作）"""
    # 检查名称是否重复
    existing_kb = (
        db.query(KnowledgeBase)
        .filter(
            KnowledgeBase.name == kb_in.name, KnowledgeBase.user_id == current_user.id
        )
        .first()
    )
    if existing_kb:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="知识库名称已存在"
        )

    # 创建知识库
    kb = KnowledgeBase(
        name=kb_in.name, description=kb_in.description, user_id=current_user.id
    )
    db.add(kb)
    db.commit()
    db.refresh(kb)
    return kb


# 获取知识库列表
@router.get("", response_model=List[KnowledgeBaseResponse])
def list_knowledge_bases(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取当前用户的所有知识库"""
    kbs = (
        db.query(KnowledgeBase)
        .filter(KnowledgeBase.user_id == current_user.id)
        .offset(skip)
        .limit(limit)
        .all()
    )
    return kbs


# 获取知识库详情
@router.get("/{kb_id}", response_model=KnowledgeBaseResponse)
def get_knowledge_base(
    kb_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取指定ID的知识库详情（仅当前用户可访问）"""
    kb = (
        db.query(KnowledgeBase)
        .filter(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id)
        .first()
    )
    if not kb:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="知识库不存在或无访问权限"
        )
    return kb


# 更新知识库
@router.put("/{kb_id}", response_model=KnowledgeBaseResponse)
def update_knowledge_base(
    kb_id: int,
    kb_in: KnowledgeBaseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """更新指定ID的知识库（仅当前用户可操作）"""
    kb = (
        db.query(KnowledgeBase)
        .filter(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id)
        .first()
    )
    if not kb:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="知识库不存在或无访问权限"
        )

    # 仅更新传入的字段
    update_data = kb_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(kb, key, value)

    db.commit()
    db.refresh(kb)
    return kb


# 删除知识库
@router.delete("/{kb_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_knowledge_base(
    kb_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除指定ID的知识库（仅当前用户可操作）"""
    kb = (
        db.query(KnowledgeBase)
        .filter(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id)
        .first()
    )
    if not kb:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="知识库不存在或无访问权限"
        )

    db.delete(kb)
    db.commit()
    return None
