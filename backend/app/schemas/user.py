"""
用户相关 Pydantic 模型
=====================
定义用户相关的请求体（Create）和响应体（Response）的数据结构。
Pydantic 负责自动校验请求数据格式，并生成 OpenAPI 文档。
"""

from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


class UserBase(BaseModel):
    """用户基础字段，Create 和 Update 共用"""

    email: EmailStr
    username: str
    is_active: bool = True
    is_superuser: bool = False


class UserCreate(UserBase):
    """注册时的请求体，需要额外提供明文密码"""

    password: str


class UserUpdate(UserBase):
    """更新用户时的请求体，密码可选（不填则不修改）"""

    password: Optional[str] = None


class UserResponse(UserBase):
    """返回给前端的用户信息，不含密码"""

    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True  # 允许从 ORM 对象自动构建
