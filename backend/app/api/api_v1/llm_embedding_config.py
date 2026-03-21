"""
用户 LLM / 嵌入配置：多份配置存数据库，可选中「当前启用」。
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.llm_embedding_config import LlmEmbeddingConfig
from app.models.user import User
from app.schemas.ai_runtime import AiRuntimeSettings
from app.schemas.llm_embedding_config import (
    LlmEmbeddingConfigCreate,
    LlmEmbeddingConfigListResponse,
    LlmEmbeddingConfigOut,
    LlmEmbeddingConfigUpdate,
)

router = APIRouter()


def _to_out(row: LlmEmbeddingConfig, active_id: int | None) -> LlmEmbeddingConfigOut:
    cfg = AiRuntimeSettings.model_validate(row.config_json)
    return LlmEmbeddingConfigOut(
        id=row.id,
        name=row.name,
        config=cfg,
        is_active=bool(active_id and row.id == active_id),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=LlmEmbeddingConfigListResponse)
def list_configs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    rows = (
        db.query(LlmEmbeddingConfig)
        .filter(LlmEmbeddingConfig.user_id == current_user.id)
        .order_by(LlmEmbeddingConfig.id.desc())
        .all()
    )
    u = db.query(User).filter(User.id == current_user.id).first()
    uid = u.active_llm_embedding_config_id if u else None
    return LlmEmbeddingConfigListResponse(
        items=[_to_out(r, uid) for r in rows],
        active_id=uid,
    )


@router.post("", response_model=LlmEmbeddingConfigOut)
def create_config(
    *,
    db: Session = Depends(get_db),
    body: LlmEmbeddingConfigCreate,
    current_user: User = Depends(get_current_user),
) -> Any:
    row = LlmEmbeddingConfig(
        user_id=current_user.id,
        name=body.name.strip(),
        config_json=body.config.model_dump(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    if current_user.active_llm_embedding_config_id is None:
        current_user.active_llm_embedding_config_id = row.id  # type: ignore
        db.commit()
        db.refresh(current_user)
    return _to_out(row, current_user.active_llm_embedding_config_id)


@router.put("/{config_id}", response_model=LlmEmbeddingConfigOut)
def update_config(
    *,
    db: Session = Depends(get_db),
    config_id: int,
    body: LlmEmbeddingConfigUpdate,
    current_user: User = Depends(get_current_user),
) -> Any:
    row = (
        db.query(LlmEmbeddingConfig)
        .filter(
            LlmEmbeddingConfig.id == config_id,
            LlmEmbeddingConfig.user_id == current_user.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="未找到配置")

    if body.name is not None:
        row.name = body.name.strip()
    if body.config is not None:
        row.config_json = body.config.model_dump()
    db.commit()
    db.refresh(row)
    db.refresh(current_user)
    return _to_out(row, current_user.active_llm_embedding_config_id)


@router.post("/{config_id}/activate", response_model=LlmEmbeddingConfigOut)
def activate_config(
    *,
    db: Session = Depends(get_db),
    config_id: int,
    current_user: User = Depends(get_current_user),
) -> Any:
    row = (
        db.query(LlmEmbeddingConfig)
        .filter(
            LlmEmbeddingConfig.id == config_id,
            LlmEmbeddingConfig.user_id == current_user.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="未找到配置")

    current_user.active_llm_embedding_config_id = row.id  # type: ignore
    db.commit()
    db.refresh(current_user)
    db.refresh(row)
    return _to_out(row, current_user.active_llm_embedding_config_id)


@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_config(
    *,
    db: Session = Depends(get_db),
    config_id: int,
    current_user: User = Depends(get_current_user),
) -> None:
    row = (
        db.query(LlmEmbeddingConfig)
        .filter(
            LlmEmbeddingConfig.id == config_id,
            LlmEmbeddingConfig.user_id == current_user.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="未找到配置")

    if current_user.active_llm_embedding_config_id == row.id:
        current_user.active_llm_embedding_config_id = None  # type: ignore

    db.delete(row)
    db.commit()
