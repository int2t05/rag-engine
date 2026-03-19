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

from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core import security
from app.core.config import settings
from app.db.session import get_db
from app.models.user import User
from app.schemas.token import Token
from app.schemas.user import UserCreate, UserResponse

router = APIRouter()

# OAuth2 密码模式，tokenUrl 需与路由前缀拼接后为实际 URL：/api/auth/token
# Swagger UI 会自动提供「Authorize」按钮用于测试
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")


@router.post("/register", response_model=UserResponse)
def register(*, db: Session = Depends(get_db), user_in: UserCreate) -> Any:
    """
    用户注册（最佳实践文档 3.1 节）

    流程：
    1. 校验邮箱唯一性 —— 若已存在返回 400
    2. 校验用户名唯一性 —— 若已占用返回 400
    3. 密码强度由 UserCreate.field_validator 校验（至少 8 位）
    4. bcrypt 哈希密码（自动加盐，不可逆）
    5. 创建用户记录，默认 is_active=True
    """
    # 步骤 1：检查 email 唯一性
    user = db.query(User).filter(User.email == user_in.email).first()
    if user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="使用此电子邮件的用户已存在。",
        )

    # 步骤 2：检查 username 唯一性
    user = db.query(User).filter(User.username == user_in.username).first()
    if user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="具有此用户名的用户已存在。",
        )

    # 步骤 3：密码校验由 Pydantic UserCreate 完成
    # 步骤 4：bcrypt 哈希密码（自动加盐，每次结果不同）
    # 步骤 5：创建并持久化用户
    user = User(
        email=user_in.email,
        username=user_in.username,
        hashed_password=security.get_password_hash(user_in.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/token", response_model=Token)
def login_access_token(
    db: Session = Depends(get_db), form_data: OAuth2PasswordRequestForm = Depends()
) -> Any:
    """
    登录获取 JWT Token（最佳实践文档 3.2 节，OAuth2 密码模式）

    流程：
    1. 根据 username 查找用户 —— 不存在则返回 401（用户名或密码错误）
    2. bcrypt 验证明文密码 —— 不匹配则返回 401
    3. 检查用户激活状态（is_active）—— 未激活返回 401
    4. 生成 JWT Token（sub=username, exp=可配置有效期，默认 7 天）
    """
    # 步骤 1：查找用户
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not security.verify_password(
        form_data.password, user.hashed_password
    ):
        # 统一提示「用户名或密码错误」，避免枚举用户名
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码不正确",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # 步骤 3：检查激活状态
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户未激活",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 步骤 4：生成 JWT Token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/test-token", response_model=UserResponse)
def test_token(current_user: User = Depends(security.get_current_user)) -> Any:
    """
    验证 Token 是否有效（最佳实践文档 3.3 节）

    受保护接口访问流程：
    1. 从 Header 提取 Bearer Token
    2. JWT 解码验证签名
    3. 检查过期时间
    4. 获取 username → 查询数据库 → 注入 current_user
    """
    return current_user
