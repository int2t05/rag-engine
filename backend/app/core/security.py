from datetime import datetime, timedelta
from jose import JWTError, jwt
import bcrypt
from app.core.config import settings
from app.models.user import User
from fastapi.security import OAuth2PasswordBearer
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db

def verify_password(plain: str, hashed: str) -> bool:
    """验证明文密码和哈希密码是否匹配"""
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def get_password_hash(password: str) -> str:
    """生成密码的bcrypt哈希值"""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """生成JWT访问令牌"""
    to_encode = data.copy()
    # 设置过期时间(时间戳)
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    # 生成令牌
    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return encoded_jwt


# OAuth2 令牌获取（从请求头的 Authorization: Bearer <token> 中提取）
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")

def get_current_user(
    db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)
) -> User:
    """
    核心依赖：验证 Token 并返回当前登录用户
    - 从请求头提取 Token
    - 解密 Token 获取用户 ID
    - 数据库查询用户并返回
    """
    # 1. 定义异常（Token 无效/过期/用户不存在）
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token 无效/过期/用户不存在",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        # 2. 解密 Token
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_name: str = payload.get("sub")  # type: ignore # 获取存储的用户名
        if user_name is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # 3. 数据库查询用户
    user = db.query(User).filter(User.username == str(user_name)).first()
    if user is None:
        raise credentials_exception

    # 4. 返回当前用户（后续接口可直接使用）
    return user
