"""
认证与安全模块
==============
负责用户认证的所有安全相关功能：
1. 密码加密与验证（使用 bcrypt）
2. JWT Token 的生成与解析
3. 从请求中提取当前用户（JWT 认证）
4. 从请求中提取 API Key 用户（API Key 认证）

认证流程：
  用户登录 → 验证密码 → 生成 JWT Token → 后续请求携带 Token → 解析 Token 获取用户信息
"""

from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from app.core.config import settings
from fastapi import Depends, HTTPException, status, Security
from fastapi.security import OAuth2PasswordBearer, APIKeyHeader
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.user import User
# from app.services.api_key import APIKeyService

# OAuth2 密码模式的 Token 获取 URL
# FastAPI 会自动在 Swagger UI 中添加"Authorize"按钮
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")

# API Key 从请求头 X-API-Key 中获取
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    验证明文密码与哈希密码是否匹配
    bcrypt 会自动处理盐值（salt），无需手动管理
    """
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def get_password_hash(password: str) -> str:
    """
    将明文密码转换为 bcrypt 哈希值
    bcrypt 会自动生成随机盐值，同一密码每次哈希结果不同，但验证时都能匹配
    """
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    创建 JWT Access Token

    参数：
        data: 要编码到 Token 中的数据，通常包含 {"sub": username}
        expires_delta: Token 过期时间，默认使用配置中的 ACCESS_TOKEN_EXPIRE_MINUTES

    返回：
        编码后的 JWT 字符串
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})  # 添加过期时间声明
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt 


def get_current_user(
    db: Session = Depends(get_db),
    token: str = Depends(oauth2_scheme)
) -> User:
    """
    从 JWT Token 中解析出当前用户（依赖注入函数）

    使用方式：在路由函数参数中添加 `current_user: User = Depends(get_current_user)`
    FastAPI 会自动从请求头的 Authorization: Bearer <token> 中提取 Token 并解析

    流程：
    1. 从请求头提取 Bearer Token
    2. 解码 JWT，获取 username（存储在 "sub" 字段）
    3. 从数据库查找对应用户
    4. 验证用户存在且为活跃状态
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # 解码 JWT Token
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub") # type: ignore
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    # 从数据库查找用户
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    if not user.is_active: # type: ignore
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Inactive user",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user 


# def get_api_key_user(
#     db: Session = Depends(get_db),
#     api_key: str = Security(api_key_header),
# ) -> User:
#     """
#     从 API Key 中解析出对应的用户（依赖注入函数）

#     用于 OpenAPI 路由，外部系统通过 X-API-Key 请求头进行认证
#     与 JWT 认证不同，API Key 是长期有效的密钥

#     流程：
#     1. 从请求头 X-API-Key 提取 API Key
#     2. 在数据库中查找匹配的 API Key 记录
#     3. 验证 API Key 存在且为活跃状态
#     4. 更新 API Key 最后使用时间
#     5. 返回关联的用户对象
#     """
#     if not api_key:
#         raise HTTPException(
#             status_code=status.HTTP_401_UNAUTHORIZED,
#             detail="API key header missing",
#         )
    
#     api_key_obj = APIKeyService.get_api_key_by_key(db=db, key=api_key)
#     if not api_key_obj:
#         raise HTTPException(
#             status_code=status.HTTP_401_UNAUTHORIZED,
#             detail="Invalid API key",
#         )
    
#     if not api_key_obj.is_active:
#         raise HTTPException(
#             status_code=status.HTTP_401_UNAUTHORIZED,
#             detail="Inactive API key",
#         )
    
#     # 更新最后使用时间，用于审计和统计
#     APIKeyService.update_last_used(db=db, api_key=api_key_obj)
#     return api_key_obj.user
