from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import Column, DateTime
from datetime import datetime

# 所有模型的基类
# SQLAlchemy 提供的 ORM 声明式基类
Base = declarative_base()

# 时间戳混合类（复用创建/更新时间字段）
class TimestampMixin:
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)