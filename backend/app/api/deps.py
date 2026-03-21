"""FastAPI 依赖：业务前置条件（如已启用模型配置）。"""

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.security import get_api_key_user, get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.ai_runtime import AiRuntimeSettings
from app.services.ai_runtime_loader import AiRuntimeNotConfigured, load_ai_runtime_for_user


def _require_active_ai_runtime(db: Session, user_id: int) -> AiRuntimeSettings:
    try:
        return load_ai_runtime_for_user(db, user_id)
    except AiRuntimeNotConfigured as e:
        raise HTTPException(status_code=400, detail=e.detail) from e


def require_active_ai_runtime(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AiRuntimeSettings:
    """
    JWT 登录用户：必须在「模型配置」中保存并启用至少一套配置，
    才能使用对话、文档向量化、检索测试、RAG 评估执行等能力。
    """
    return _require_active_ai_runtime(db, current_user.id)


def require_active_ai_runtime_openapi(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_api_key_user),
) -> AiRuntimeSettings:
    """API Key 调用 OpenAPI 时同上。"""
    return _require_active_ai_runtime(db, current_user.id)
