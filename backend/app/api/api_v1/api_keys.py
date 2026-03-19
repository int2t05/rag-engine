"""
API 密钥管理 API
================
创建、查询、更新、删除 API 密钥，符合《用户认证业务流程最佳实践》文档 4.1 / 4.2 节。

密钥格式：sk-{64 位十六进制}（secrets.token_hex(32)）
适用场景：外部系统、脚本、机器人等无法交互式登录的场景。

安全说明（4.3 节）：
- 创建时密钥明文只返回一次，客户端需妥善保存，之后无法找回
- 建议生产环境使用 HTTPS 传输
- 定期轮换密钥，不同系统使用不同 Key 便于权限控制
"""

import logging
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.core.security import get_current_user
from app.db.session import get_db
from app.services.api_key import APIKeyService

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/", response_model=List[schemas.APIKey])
def read_api_keys(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: models.User = Depends(get_current_user),
) -> Any:
    """
    检索当前用户的所有 API 密钥（分页）。

    依赖：JWT Token 认证（get_current_user）
    返回：API Key 列表（key 字段仅在创建时返回，列表中可能脱敏或为空，视 schema 而定）
    """
    api_keys = APIKeyService.get_api_keys(
        db=db, user_id=current_user.id, skip=skip, limit=limit
    )
    return api_keys


@router.post("/", response_model=schemas.APIKey)
def create_api_key(
    *,
    db: Session = Depends(get_db),
    api_key_in: schemas.APIKeyCreate,
    current_user: models.User = Depends(get_current_user),
) -> Any:
    """
    创建新的 API 密钥（最佳实践文档 4.1 节）

    流程：
    1. 生成随机 Key（sk- + 64 位十六进制）
    2. 存储到 api_keys 表，关联当前用户
    3. 201 响应中返回完整 key

    ⚠️ 注意：密钥明文仅在此响应中返回一次，后续无法找回，客户端需妥善保存。
    """
    api_key = APIKeyService.create_api_key(
        db=db, user_id=current_user.id, name=api_key_in.name
    )
    logger.info(f"已为用户 {current_user.id} 创建 API 密钥：{api_key.name}")
    return api_key


@router.put("/{id}", response_model=schemas.APIKey)
def update_api_key(
    *,
    db: Session = Depends(get_db),
    id: int,
    api_key_in: schemas.APIKeyUpdate,
    current_user: models.User = Depends(get_current_user),
) -> Any:
    """
    更新 API 密钥（名称或激活状态）。

    权限：仅允许修改当前用户自己的密钥，否则返回 403 权限不足。
    """
    api_key = APIKeyService.get_api_key(db=db, api_key_id=id)
    if not api_key:
        raise HTTPException(status_code=404, detail="找不到API密钥")
    if api_key.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="权限不足")

    api_key = APIKeyService.update_api_key(
        db=db, api_key=api_key, update_data=api_key_in
    )
    # 仅记录 id/name，避免将 API Key 明文写入日志（最佳实践 4.3 节）
    logger.info(f"已更新 API 密钥：用户 {current_user.id}，密钥 id={api_key.id}")
    return api_key


@router.delete("/{id}", response_model=schemas.APIKey)
def delete_api_key(
    *,
    db: Session = Depends(get_db),
    id: int,
    current_user: models.User = Depends(get_current_user),
) -> Any:
    """
    删除 API 密钥（物理删除，无法恢复）。

    权限：仅允许删除当前用户自己的密钥，否则返回 403 权限不足。
    """
    api_key = APIKeyService.get_api_key(db=db, api_key_id=id)
    if not api_key:
        raise HTTPException(status_code=404, detail="找不到API密钥")
    if api_key.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="权限不足")

    APIKeyService.delete_api_key(db=db, api_key=api_key)
    # 仅记录 id，避免将 API Key 明文写入日志（最佳实践 4.3 节）
    logger.info(f"删除 API 密钥：用户 {current_user.id}，密钥 id={api_key.id}")
    return api_key
