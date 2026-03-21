"""
认证 API
========
提供用户注册、登录（获取 JWT Token）和 Token 验证接口。

符合《用户认证业务流程最佳实践》文档规范，实现：
- 用户注册：邮箱/用户名唯一性检查、密码 bcrypt 哈希存储
- 用户登录：OAuth2 密码模式，返回 JWT Access Token
- Token 验证：受保护接口依赖 get_current_user 注入当前用户

路由说明：
- POST /register：用户注册（3.1 节流程）
- POST /token：OAuth2 密码模式登录，返回 JWT（3.2 节流程）
- POST /test-token：验证 Token 有效性，返回当前用户信息（3.3 节）
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
    """用户注册（最佳实践文档 3.1 节）。"""
    try:
        return register_user(db, user_in)
    except AppServiceError as e:
        raise http_exception_from_service(e) from e


@router.post("/token", response_model=Token)
def login_access_token_endpoint(
    db: Session = Depends(get_db), form_data: OAuth2PasswordRequestForm = Depends()
) -> Any:
    """登录获取 JWT Token（OAuth2 密码模式，文档 3.2 节）。"""
    try:
        return login_access_token(db, form_data.username, form_data.password)
    except AppServiceError as e:
        raise http_exception_from_service(e) from e


@router.post("/test-token", response_model=UserResponse)
def test_token(current_user: User = Depends(security.get_current_user)) -> Any:
    """验证 Token 是否有效（文档 3.3 节）。"""
    return current_user
