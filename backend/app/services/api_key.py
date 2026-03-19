"""
API 密钥服务
============
封装 API 密钥的 CRUD 和查询逻辑，符合《用户认证业务流程最佳实践》文档 4.1 / 4.2 节。

职责：
- 创建 API Key（sk- + 64 位十六进制，secrets.token_hex 保证密码学安全）
- 查询、更新、删除 Key 记录
- 认证时查找 Key 并更新 last_used_at（审计用）
"""

from typing import List, Optional
from datetime import datetime, timezone
import secrets
from sqlalchemy.orm import Session

from app.models.api_key import APIKey
from app.schemas.api_key import APIKeyCreate, APIKeyUpdate


class APIKeyService:
    """API 密钥领域服务类"""

    @staticmethod
    def get_api_keys(db: Session, user_id: int, skip: int = 0, limit: int = 100) -> List[APIKey]:
        """
        获取指定用户的所有 API 密钥（分页）。

        用于「我的密钥」列表展示，不包含敏感操作的逻辑。
        """
        return (
            db.query(APIKey)
            .filter(APIKey.user_id == user_id)
            .offset(skip)
            .limit(limit)
            .all()
        )

    @staticmethod
    def create_api_key(db: Session, user_id: int, name: str) -> APIKey:
        """
        创建新 API 密钥（最佳实践文档 4.1 节）

        流程：
        1. 使用 secrets.token_hex(32) 生成 64 位十六进制随机串（密码学安全）
        2. 格式化为 sk-{hex}，符合文档规范
        3. 写入 api_keys 表，关联 user_id，默认 is_active=True

        ⚠️ 返回的 key 明文仅在创建响应中展示一次，后续无法找回。
        """
        api_key = APIKey(
            key=f"sk-{secrets.token_hex(32)}",
            name=name,
            user_id=user_id,
            is_active=True
        )
        db.add(api_key)
        db.commit()
        db.refresh(api_key)
        return api_key

    @staticmethod
    def get_api_key(db: Session, api_key_id: int) -> Optional[APIKey]:
        """根据主键 ID 获取 API 密钥，用于更新/删除前校验归属。"""
        return db.query(APIKey).filter(APIKey.id == api_key_id).first()

    @staticmethod
    def get_api_key_by_key(db: Session, key: str) -> Optional[APIKey]:
        """
        根据 key 明文查找 API 密钥（用于认证，最佳实践 4.2 节）

        认证流程中由 security.get_api_key_user 调用：
        请求头 X-API-Key -> 查询此方法 -> 校验 is_active -> 更新 last_used_at -> 返回 user
        """
        return db.query(APIKey).filter(APIKey.key == key).first()

    @staticmethod
    def update_api_key(db: Session, api_key: APIKey, update_data: APIKeyUpdate) -> APIKey:
        """
        更新 API 密钥（名称或激活状态）。

        支持部分更新：仅传入的字段会被修改，exclude_unset 忽略未传递的字段。
        """
        for field, value in update_data.model_dump(exclude_unset=True).items():
            setattr(api_key, field, value)
        db.add(api_key)
        db.commit()
        db.refresh(api_key)
        return api_key

    @staticmethod
    def delete_api_key(db: Session, api_key: APIKey) -> None:
        """物理删除 API 密钥，删除后该 Key 立即失效，无法恢复。"""
        db.delete(api_key)
        db.commit()

    @staticmethod
    def update_last_used(db: Session, api_key: APIKey) -> APIKey:
        """
        更新最后使用时间（最佳实践 4.2 / 4.3 节）

        每次通过 API Key 认证成功时调用，用于审计和异常检测。
        """
        api_key.last_used_at = datetime.now(timezone.utc)  # type: ignore
        db.add(api_key)
        db.commit()
        db.refresh(api_key)
        return api_key
