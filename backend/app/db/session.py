"""
数据库会话管理模块
==================
负责创建数据库引擎和管理数据库会话（Session）。

SQLAlchemy 的工作方式：
1. Engine（引擎）：管理数据库连接池，是与数据库通信的核心
2. Session（会话）：代表一次与数据库的"对话"，在会话中可以执行查询、添加、修改、删除等操作
3. 通过 get_db() 依赖注入，每个 API 请求都会获得一个独立的数据库会话

为什么用 yield：
- yield 之前的代码在请求开始时执行（创建会话）
- yield 返回会话供路由函数使用
- yield 之后的代码在请求结束时执行（关闭会话，释放连接）
"""

from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

# 创建数据库引擎
# SQLAlchemy 会自动管理连接池，多个请求可以复用数据库连接
engine = create_engine(settings.get_database_url)

# 创建会话工厂
# autocommit=False：需要手动调用 commit() 提交事务
# autoflush=False：需要手动调用 flush() 刷新数据到数据库
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """
    数据库会话依赖注入函数

    使用方式：在路由函数参数中添加 `db: Session = Depends(get_db)`
    FastAPI 会自动调用此函数，为每个请求创建独立的数据库会话，
    并在请求结束后自动关闭会话。

    使用 try/finally 确保会话一定会被关闭，即使发生异常
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
