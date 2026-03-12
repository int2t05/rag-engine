from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.core import security
from app.core.config import settings
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserResponse
from app.schemas.token import Token

# 创建路由实例  路由管理器 统一前缀
router = APIRouter()

# 注册接口 /register为相对路径
# 如果省略 status_code（默认 200）
# user_in: UserCreate 类型注解 表示接收一个UserCreate类型的参数
@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(*, db: Session = Depends(get_db), user_in: UserCreate):
    """
    用户注册：
    - 校验邮箱/用户名是否已存在
    - 密码哈希后存储
    - 返回用户信息（不含密码）
    """
    # 检查邮箱是否已存在
    if db.query(User).filter(User.email == user_in.email).first():
        # 触发异常
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already exists"
        )
    # 检查用户名是否已存在
    if db.query(User).filter(User.username == user_in.username).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists"
        )
    # 创建用户（密码哈希）
    user = User(
        email=user_in.email,
        username=user_in.username,
        hashed_password=security.get_password_hash(user_in.password),
    )
    # 写入数据库
    db.add(user)
    db.commit()
    db.refresh(user)  # 刷新获取自动生成的字段（id/created_at等）
    return user

# 登录接口（兼容OAuth2密码模式）
@router.post("/token", response_model=Token)
def login(
    db: Session = Depends(get_db),
    form_data: OAuth2PasswordRequestForm = Depends()
):
    """
    用户登录：
    - 用户名+密码验证
    - 生成JWT Token返回
    """
    # 查询用户
    user = db.query(User).filter(User.username == form_data.username).first()
    # 验证用户存在且密码正确
    if not user or not security.verify_password(form_data.password, user.hashed_password): # type: ignore
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # 生成Token（sub=subject，存储用户名）
    access_token = security.create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}
