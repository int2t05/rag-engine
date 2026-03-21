"""
认证与安全模块
==============
负责用户认证的安全相关功能。

功能概览：
  1. 密码加密与验证（bcrypt，自动加盐，不可逆）
  2. JWT Token 的生成与解析（HS256，sub=username，exp=过期时间）
  3. 从请求中提取当前用户（JWT 认证，Authorization: Bearer <token>）

认证流程：
  用户登录 → bcrypt 验证密码 → 生成 JWT Token → 后续请求携带 Token → 解析 Token 获取用户信息
"""

from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.user import User

# OAuth2 密码模式的 Token 获取 URL
# FastAPI 会自动在 Swagger UI 中添加「Authorize」按钮
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    验证明文密码与哈希密码是否匹配

    流程：明文密码 ──▶ bcrypt.checkpw ──▶ 与哈希值对比
    bcrypt 特点：自动加盐、计算成本高（抗暴力破解）、不可逆
    """
    return bcrypt.checkpw(
        plain_password.encode("utf-8"), hashed_password.encode("utf-8")
    )


def get_password_hash(password: str) -> str:
    """
    将明文密码转换为 bcrypt 哈希值

    bcrypt 自动生成随机盐值，同一密码每次哈希结果不同，但验证时均能匹配。
    永远不要存储明文密码！
    """
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    创建 JWT Access Token

    JWT 结构：Header. Payload. Signature
    - Header: {"alg": "HS256", "typ": "JWT"}
    - Payload: {"sub": username, "exp": 过期时间戳}
    - Signature: HMAC-SHA256(Header.Payload, SECRET_KEY)
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return encoded_jwt


def get_current_user(
    db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)
) -> User:
    """
    从 JWT Token 中解析出当前用户（依赖注入函数）

    使用方式：在路由函数参数中添加 `current_user: User = Depends(get_current_user)`
    FastAPI 会自动从请求头的 Authorization: Bearer <token> 中提取 Token 并解析
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无法验证凭据，请检查 Token 是否有效或已过期",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        username: str = payload.get("sub")  # type: ignore
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    if not user.is_active:  # type: ignore
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户未激活",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
