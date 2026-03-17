"""
用户模型
========
定义用户表的数据库结构。

对应数据库表名：users
每个用户可以拥有多个知识库、多个对话、多个 API 密钥。
"""

from sqlalchemy import Boolean, Column, Integer, String
from sqlalchemy.orm import relationship
from app.models.base import Base, TimestampMixin


class User(Base, TimestampMixin):
    """
    用户模型

    字段说明：
    - id: 主键，自增整数
    - email: 邮箱地址，唯一，用于注册
    - username: 用户名，唯一，用于登录和 JWT Token
    - hashed_password: 密码的 bcrypt 哈希值（永远不存储明文密码！）
    - is_active: 账户是否激活，可用于禁用用户
    - is_superuser: 是否为超级管理员

    关系说明（relationship）：
    - knowledge_bases: 用户创建的所有知识库
    - chats: 用户的所有对话
    - api_keys: 用户的所有 API 密钥
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)

    # ORM 关系映射
    # relationship 定义了 Python 对象间的关联，可以通过 user.knowledge_bases 直接访问
    knowledge_bases = relationship("KnowledgeBase", back_populates="user")
    chats = relationship("Chat", back_populates="user")
    api_keys = relationship("APIKey", back_populates="user", cascade="all, delete-orphan")
