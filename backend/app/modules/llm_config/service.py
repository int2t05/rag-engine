"""
用户 LLM / 嵌入配置用例
=====================
列表、创建、更新、激活、删除；与 AiRuntimeSettings schema 互转。
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.core.exceptions import ResourceNotFoundError
from app.models.llm_embedding_config import LlmEmbeddingConfig
from app.models.user import User
from app.modules.llm_config.repository import LlmEmbeddingConfigRepository
from app.schemas.ai_runtime import AiRuntimeSettings
from app.schemas.llm_embedding_config import (
    LlmEmbeddingConfigCreate,
    LlmEmbeddingConfigListResponse,
    LlmEmbeddingConfigOut,
    LlmEmbeddingConfigUpdate,
)


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


def list_configs(db: Session, user: User) -> LlmEmbeddingConfigListResponse:
    repo = LlmEmbeddingConfigRepository(db)
    rows = repo.list_for_user_ordered(user.id)
    u = repo.get_user_row(user.id)
    uid = u.active_llm_embedding_config_id if u else None
    return LlmEmbeddingConfigListResponse(
        items=[_to_out(r, uid) for r in rows],
        active_id=uid,
    )


def create_config(db: Session, user: User, body: LlmEmbeddingConfigCreate) -> Any:
    repo = LlmEmbeddingConfigRepository(db)
    row = LlmEmbeddingConfig(
        user_id=user.id,
        name=body.name.strip(),
        config_json=body.config.model_dump(),
    )
    repo.add(row)
    db.commit()
    db.refresh(row)
    u = repo.get_user_row(user.id)
    if u and u.active_llm_embedding_config_id is None:
        u.active_llm_embedding_config_id = row.id  # type: ignore[assignment]
        db.commit()
        db.refresh(u)
    u2 = repo.get_user_row(user.id)
    aid = u2.active_llm_embedding_config_id if u2 else None
    return _to_out(row, aid)


def update_config(
    db: Session, user: User, config_id: int, body: LlmEmbeddingConfigUpdate
) -> LlmEmbeddingConfigOut:
    repo = LlmEmbeddingConfigRepository(db)
    row = repo.get_owned(config_id, user.id)
    if not row:
        raise ResourceNotFoundError("未找到配置")
    if body.name is not None:
        row.name = body.name.strip()
    if body.config is not None:
        row.config_json = body.config.model_dump()
    db.commit()
    db.refresh(row)
    u = repo.get_user_row(user.id)
    aid = u.active_llm_embedding_config_id if u else None
    return _to_out(row, aid)


def activate_config(db: Session, user: User, config_id: int) -> LlmEmbeddingConfigOut:
    repo = LlmEmbeddingConfigRepository(db)
    row = repo.get_owned(config_id, user.id)
    if not row:
        raise ResourceNotFoundError("未找到配置")
    u = repo.get_user_row(user.id)
    if not u:
        raise ResourceNotFoundError("未找到配置")
    u.active_llm_embedding_config_id = row.id  # type: ignore[assignment]
    db.commit()
    db.refresh(u)
    db.refresh(row)
    return _to_out(row, u.active_llm_embedding_config_id)


def delete_config(db: Session, user: User, config_id: int) -> None:
    repo = LlmEmbeddingConfigRepository(db)
    row = repo.get_owned(config_id, user.id)
    if not row:
        raise ResourceNotFoundError("未找到配置")
    u = repo.get_user_row(user.id)
    if u and u.active_llm_embedding_config_id == row.id:
        u.active_llm_embedding_config_id = None  # type: ignore[assignment]
    repo.delete_row(row)
    db.commit()
