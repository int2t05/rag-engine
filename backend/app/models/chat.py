"""
对话与消息模型
==============
定义对话（Chat）和消息（Message）的数据库结构。

核心概念：
- 一个 Chat（对话）关联一个或多个 KnowledgeBase（知识库）
- 一个 Chat 包含多条 Message（消息）
- Message 的 role 可以是 "user"（用户发送）或 "assistant"（AI 回答）

Chat 和 KnowledgeBase 是多对多关系：
- 一个对话可以同时关联多个知识库
- 一个知识库也可以被多个对话引用
- 通过中间表 chat_knowledge_bases 实现
"""

from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, Table
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy.orm import relationship
from app.models.base import Base, TimestampMixin

# 多对多关联表：对话 ↔ 知识库
# 这不是一个 ORM 模型类，而是 SQLAlchemy 的 Table 对象
# 它只有两个外键列，分别指向 chats 和 knowledge_bases 表
chat_knowledge_bases = Table(
    "chat_knowledge_bases",
    Base.metadata,
    Column("chat_id", Integer, ForeignKey("chats.id"), primary_key=True),
    Column(
        "knowledge_base_id", Integer, ForeignKey("knowledge_bases.id"), primary_key=True
    ),
)


class Chat(Base, TimestampMixin):
    """
    对话模型

    字段：
    - id: 主键
    - title: 对话标题，由用户在创建时指定
    - user_id: 创建此对话的用户 ID

    关系：
    - messages: 此对话中的所有消息（按时间排序）
    - user: 创建此对话的用户
    - knowledge_bases: 此对话关联的知识库列表（多对多）
    """

    __tablename__ = "chats"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    messages = relationship(
        "Message", back_populates="chat", cascade="all, delete-orphan"
    )
    user = relationship("User", back_populates="chats")
    # secondary 指定通过哪个中间表建立多对多关系
    knowledge_bases = relationship(
        "KnowledgeBase", secondary=chat_knowledge_bases, backref="chats"
    )


class Message(Base, TimestampMixin):
    """
    消息模型

    字段：
    - id: 主键
    - content: 消息内容
        - 用户消息：用户输入的原始文本
        - AI 回答：包含 Base64 编码的引用上下文 + "__LLM_RESPONSE__" + LLM 生成的回答
    - role: 消息角色，"user" 或 "assistant"
    - chat_id: 所属对话的 ID

    使用 LONGTEXT 类型存储 content，因为 AI 的回答可能很长，
    特别是包含了 Base64 编码的引用上下文后
    """

    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    content = Column(LONGTEXT, nullable=False)
    role = Column(String(50), nullable=False)  # "user" 或 "assistant"
    chat_id = Column(Integer, ForeignKey("chats.id"), nullable=False)

    chat = relationship("Chat", back_populates="messages")
