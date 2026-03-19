"""
用户相关 Pydantic 模型
=====================
定义用户相关的请求体（Create）和响应体（Response）的数据结构。
Pydantic 负责自动校验请求数据格式，并生成 OpenAPI 文档。

安全说明：
- 密码要求至少 8 位，符合《用户认证业务流程最佳实践》规范
- 响应模型 UserResponse 不含 hashed_password，防止密码泄漏
"""

from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import datetime


class UserBase(BaseModel):
    """
    用户基础字段
    Create 和 Update 共用，包含邮箱、用户名、激活状态、管理员标记。
    """

    email: EmailStr
    username: str
    is_active: bool = True
    is_superuser: bool = False


class UserCreate(UserBase):
    """
    用户注册请求体
    需要额外提供明文密码，密码将在服务端使用 bcrypt 哈希后存储。
    """

    password: str

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        """
        密码强度校验（符合最佳实践文档 3.1 节）
        - 长度至少 8 位，防止弱密码
        """
        if len(v) < 8:
            raise ValueError("密码长度至少 8 位")
        return v


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
