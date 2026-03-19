"""
API 密钥相关 Pydantic 模型
=========================
"""

from typing import Optional
from datetime import datetime
from pydantic import BaseModel


class APIKeyBase(BaseModel):
    """API 密钥基础字段"""

    name: str
    is_active: bool = True


class APIKeyCreate(APIKeyBase):
    """创建 API 密钥的请求体（key 由服务端生成）"""

    pass


class APIKeyUpdate(BaseModel):
    """更新 API 密钥的请求体"""

    name: Optional[str] = None
    is_active: Optional[bool] = None


class APIKey(APIKeyBase):
    """API 密钥的响应（包含完整 key，创建时显示一次）"""

    id: int
    key: str
    user_id: int
    last_used_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class APIKeyInDB(APIKey):
    """内部使用的完整 API 密钥模型"""

    pass
