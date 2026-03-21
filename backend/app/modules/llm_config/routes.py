"""
用户 LLM / 嵌入配置：多份配置存数据库，可选中「当前启用」。
"""

from typing import Any

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.errors import http_exception_from_service
from app.core.exceptions import AppServiceError
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.llm_embedding_config import (
    LlmEmbeddingConfigCreate,
    LlmEmbeddingConfigListResponse,
    LlmEmbeddingConfigOut,
    LlmEmbeddingConfigUpdate,
)
from app.modules.llm_config import service as llm_cfg_svc

router = APIRouter()


@router.get("", response_model=LlmEmbeddingConfigListResponse)
def list_configs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """列出当前用户全部配置及激活项 ID。"""
    return llm_cfg_svc.list_configs(db, current_user)


@router.post("", response_model=LlmEmbeddingConfigOut)
def create_config(
    *,
    db: Session = Depends(get_db),
    body: LlmEmbeddingConfigCreate,
    current_user: User = Depends(get_current_user),
) -> Any:
    """新增配置；若此前无激活项则自动激活本条。"""
    try:
        return llm_cfg_svc.create_config(db, current_user, body)
    except AppServiceError as e:
        raise http_exception_from_service(e) from e


@router.put("/{config_id}", response_model=LlmEmbeddingConfigOut)
def update_config(
    *,
    db: Session = Depends(get_db),
    config_id: int,
    body: LlmEmbeddingConfigUpdate,
    current_user: User = Depends(get_current_user),
) -> Any:
    """更新名称或 config JSON。"""
    try:
        return llm_cfg_svc.update_config(db, current_user, config_id, body)
    except AppServiceError as e:
        raise http_exception_from_service(e) from e


@router.post("/{config_id}/activate", response_model=LlmEmbeddingConfigOut)
def activate_config(
    *,
    db: Session = Depends(get_db),
    config_id: int,
    current_user: User = Depends(get_current_user),
) -> Any:
    """设为当前用户启用的模型配置。"""
    try:
        return llm_cfg_svc.activate_config(db, current_user, config_id)
    except AppServiceError as e:
        raise http_exception_from_service(e) from e


@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_config(
    *,
    db: Session = Depends(get_db),
    config_id: int,
    current_user: User = Depends(get_current_user),
) -> None:
    """删除配置；若正在激活则清除激活指针。"""
    try:
        llm_cfg_svc.delete_config(db, current_user, config_id)
    except AppServiceError as e:
        raise http_exception_from_service(e) from e
