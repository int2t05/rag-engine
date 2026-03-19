"""
Token 相关 Pydantic 模型
=======================
JWT 登录接口的请求/响应结构。
"""

from pydantic import BaseModel
from typing import Optional


class Token(BaseModel):
    """登录成功后的响应：access_token 和 token_type"""

    access_token: str
    token_type: str  # 通常为 "bearer"


class TokenPayload(BaseModel):
    """JWT Token 解码后的 payload 结构"""

    sub: Optional[int] = None  # subject，通常存 username
