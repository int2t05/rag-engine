"""
API 密钥服务
============
封装 API 密钥的 CRUD 和查询逻辑。
"""

from typing import List, Optional
from datetime import datetime
import secrets
from sqlalchemy.orm import Session

from app.models.api_key import APIKey
from app.schemas.api_key import APIKeyCreate, APIKeyUpdate


class APIKeyService:
    @staticmethod
    def get_api_keys(db: Session, user_id: int, skip: int = 0, limit: int = 100) -> List[APIKey]:
        """获取用户的所有 API 密钥"""
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
        创建新 API 密钥
        key 格式：sk-{32 字节随机十六进制} = 64 位十六进制字符
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
        """根据 ID 获取 API 密钥"""
        return db.query(APIKey).filter(APIKey.id == api_key_id).first()

    @staticmethod
    def get_api_key_by_key(db: Session, key: str) -> Optional[APIKey]:
        """根据 key 值查找 API 密钥（用于认证）"""
        return db.query(APIKey).filter(APIKey.key == key).first()

    @staticmethod
    def update_api_key(db: Session, api_key: APIKey, update_data: APIKeyUpdate) -> APIKey:
        """更新 API 密钥（名称或激活状态）"""
        for field, value in update_data.model_dump(exclude_unset=True).items():
            setattr(api_key, field, value)
        db.add(api_key)
        db.commit()
        db.refresh(api_key)
        return api_key

    @staticmethod
    def delete_api_key(db: Session, api_key: APIKey) -> None:
        """删除 API 密钥"""
        db.delete(api_key)
        db.commit()

    @staticmethod
    def update_last_used(db: Session, api_key: APIKey) -> APIKey:
        """更新最后使用时间（每次通过 API Key 认证时调用）"""
        api_key.last_used_at = datetime.utcnow() # type: ignore
        db.add(api_key)
        db.commit()
        db.refresh(api_key)
        return api_key
