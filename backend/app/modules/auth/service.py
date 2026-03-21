"""
账户注册与登录用例
================
OAuth2 密码模式登录与注册；抛领域异常，由路由映射为 HTTP 状态码。
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any, Dict

from sqlalchemy.orm import Session

from app.core import security
from app.core.config import settings
from app.core.exceptions import BadRequestError, UnauthorizedError
from app.models.user import User
from app.modules.auth.repository import UserRepository
from app.schemas.user import UserCreate


def register_user(db: Session, user_in: UserCreate) -> User:
    """新用户注册；邮箱或用户名冲突时抛 BadRequestError。"""
    repo = UserRepository(db)
    if repo.get_by_email(user_in.email):
        raise BadRequestError("使用此电子邮件的用户已存在。")
    if repo.get_by_username(user_in.username):
        raise BadRequestError("具有此用户名的用户已存在。")

    user = User(
        email=user_in.email,
        username=user_in.username,
        hashed_password=security.get_password_hash(user_in.password),
    )
    repo.add(user)
    db.commit()
    db.refresh(user)
    return user


def login_access_token(db: Session, username: str, password: str) -> Dict[str, Any]:
    """
    校验用户名密码并签发 JWT。
    失败或未激活时抛 UnauthorizedError（统一「用户名或密码」提示，避免枚举用户）。
    """
    repo = UserRepository(db)
    user = repo.get_by_username(username)
    if not user or not security.verify_password(password, user.hashed_password):
        raise UnauthorizedError("用户名或密码不正确")
    if not user.is_active:
        raise UnauthorizedError("用户未激活")

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}
