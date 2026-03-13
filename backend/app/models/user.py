from sqlalchemy import Boolean, Column, Integer, String
from app.models.base import Base, TimestampMixin
from sqlalchemy.orm import relationship

class User(Base, TimestampMixin):
    """用户表模型"""

    __tablename__ = "users"  # 数据库表名

    id = Column(Integer, primary_key=True, index=True)  # 主键ID
    email = Column(String(255), unique=True, index=True, nullable=False)  # 邮箱（唯一）
    username = Column(
        String(255), unique=True, index=True, nullable=False
    )  # 用户名（唯一）
    hashed_password = Column(String(255), nullable=False)  # 哈希后的密码
    is_active = Column(Boolean, default=True)  # 是否激活（默认激活）

    knowledge_bases = relationship("KnowledgeBase", back_populates="user", cascade="all, delete-orphan")
