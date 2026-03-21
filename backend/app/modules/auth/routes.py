"""
认证 API
========
1. 注册：校验邮箱/用户名唯一 → bcrypt 存哈希
2. 登录：OAuth2 密码表单 → 签发 JWT
3. test-token：Bearer 有效则返回当前用户（供前端探活）
"""

from typing import Any

from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api.errors import http_exception_from_service
from app.core import security
from app.core.exceptions import AppServiceError
from app.db.session import get_db
from app.models.user import User
from app.schemas.token import Token
from app.schemas.user import UserCreate, UserResponse
from app.modules.auth.service import login_access_token, register_user

router = APIRouter()


@router.post("/register", response_model=UserResponse)
def register(*, db: Session = Depends(get_db), user_in: UserCreate) -> Any:
    """注册入口。"""
    try:
        return register_user(db, user_in)
    except AppServiceError as e:
        raise http_exception_from_service(e) from e


@router.post("/token", response_model=Token)
def login_access_token_endpoint(
    db: Session = Depends(get_db), form_data: OAuth2PasswordRequestForm = Depends()
) -> Any:
    """OAuth2 密码模式登录，返回 access_token。"""
    try:
        return login_access_token(db, form_data.username, form_data.password)
    except AppServiceError as e:
        raise http_exception_from_service(e) from e


@router.post("/test-token", response_model=UserResponse)
def test_token(current_user: User = Depends(security.get_current_user)) -> Any:
    """依赖 JWT 依赖链，能进来即 token 有效。"""
    return current_user
