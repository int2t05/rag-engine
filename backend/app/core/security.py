from datetime import datetime, timedelta
from jose import JWTError, jwt
import bcrypt
from app.core.config import settings

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
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    # 生成令牌
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt