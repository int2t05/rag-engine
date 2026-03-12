from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# 创建数据库引擎（连接MySQL）
engine = create_engine(
    settings.get_database_url,
    pool_pre_ping=True,  # 检查连接是否有效
    pool_size=10,
    max_overflow=20,
    # TODO: 添加连接池配置 避免频繁创建连接
    # pool_recycle=3600,  # 每3600秒（1小时）强制回收连接，避免MySQL超时
    # connect_args={"connect_timeout": 5}  # 连接超时时间（5秒），避免卡等待
)

# 创建会话工厂
# 不自动提交事务，不自动刷新
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """依赖函数：获取数据库会话，自动关闭"""
    db = SessionLocal()
    try:
        # 生成器函数
        # 自动关闭数据库会话，避免连接泄漏，保证连接池的连接被正常回收
        yield db
    finally:
        db.close()
