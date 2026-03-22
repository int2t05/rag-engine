"""
知识库相关模型
==============
定义知识库（KnowledgeBase）、文档（Document）、文档分块（DocumentChunk）、
上传记录（DocumentUpload）和处理任务（ProcessingTask）的数据库结构。

RAG 文档处理流程对应的表：
1. 用户上传文件 → 创建 DocumentUpload 记录，文件存到 MinIO 临时目录
2. 后台处理开始 → 创建 ProcessingTask 记录，status=pending
3. 解析文档、分块、向量化 → 创建 Document 和 DocumentChunk 记录
4. 处理完成 → 更新 ProcessingTask.status=completed，DocumentUpload.status=completed
"""

from sqlalchemy import Column, Integer, String, ForeignKey, Text, DateTime, JSON, BigInteger, TIMESTAMP, text, Boolean
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy.orm import relationship
from app.models.base import Base, TimestampMixin, BEIJING_TZ
from datetime import datetime
import sqlalchemy as sa


class KnowledgeBase(Base, TimestampMixin):
    """
    知识库模型
    一个知识库是多个文档的集合，每个知识库对应向量数据库中的一个 collection。

    字段：
    - id: 主键
    - name: 知识库名称
    - description: 知识库描述
    - user_id: 创建者
    - parent_child_chunking: 入库时是否使用父子分块（仅子块入向量库）
    """
    __tablename__ = "knowledge_bases"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(LONGTEXT)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    parent_child_chunking = Column(
        Boolean, nullable=False, default=False, server_default=text("0")
    )

    documents = relationship("Document", back_populates="knowledge_base", cascade="all, delete-orphan")
    user = relationship("User", back_populates="knowledge_bases")
    processing_tasks = relationship("ProcessingTask", back_populates="knowledge_base")
    chunks = relationship("DocumentChunk", back_populates="knowledge_base", cascade="all, delete-orphan")
    document_uploads = relationship("DocumentUpload", back_populates="knowledge_base", cascade="all, delete-orphan")


class Document(Base, TimestampMixin):
    """
    文档模型
    表示已成功处理并存储到向量数据库的文档。

    字段：
    - file_path: 在 MinIO 中的对象路径，如 "kb_1/document.pdf"
    - file_name: 原始文件名
    - file_size: 文件大小（字节）
    - content_type: MIME 类型
    - file_hash: 文件内容的 SHA-256 哈希，用于去重和变更检测
    """
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    file_path = Column(String(255), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_size = Column(BigInteger, nullable=False)
    content_type = Column(String(100), nullable=False)
    file_hash = Column(String(64), index=True)
    knowledge_base_id = Column(Integer, ForeignKey("knowledge_bases.id"), nullable=False)

    knowledge_base = relationship("KnowledgeBase", back_populates="documents")
    processing_tasks = relationship(
        "ProcessingTask",
        back_populates="document",
        order_by="ProcessingTask.id",
    )
    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")

    # 同一知识库内不允许重复文件名
    __table_args__ = (
        sa.UniqueConstraint('knowledge_base_id', 'file_name', name='uq_kb_file_name'),
    )


class DocumentUpload(Base):
    """
    文档上传记录
    用户上传文件后、后台处理完成前，用此表记录临时文件信息。

    字段：
    - temp_path: MinIO 临时目录路径，如 "kb_1/temp/xxx.pdf"
    - status: pending(待处理) / completed(已完成)
    - error_message: 处理失败时的错误信息
    """
    __tablename__ = "document_uploads"

    id = Column(Integer, primary_key=True, index=True)
    knowledge_base_id = Column(Integer, ForeignKey("knowledge_bases.id", ondelete="CASCADE"), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_hash = Column(String(255), nullable=False)
    file_size = Column(BigInteger, nullable=False)
    content_type = Column(String(255), nullable=False)
    temp_path = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(BEIJING_TZ))
    status = Column(String(255), nullable=False, server_default="pending")
    error_message = Column(Text)

    knowledge_base = relationship("KnowledgeBase", back_populates="document_uploads")


class ProcessingTask(Base):
    """
    文档处理任务
    每条记录代表一个文档的后台处理任务。

    状态流转：pending → processing → completed / failed
    document_id 和 document_upload_id 二选一，取决于处理的是已存文档还是新上传的
    """
    __tablename__ = "processing_tasks"

    id = Column(Integer, primary_key=True, index=True)
    knowledge_base_id = Column(Integer, ForeignKey("knowledge_bases.id"))
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=True)      # 已存在的文档
    document_upload_id = Column(Integer, ForeignKey("document_uploads.id"), nullable=True)  # 新上传的文档
    status = Column(String(50), default="pending")
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(BEIJING_TZ))
    updated_at = Column(DateTime, default=lambda: datetime.now(BEIJING_TZ), onupdate=lambda: datetime.now(BEIJING_TZ))

    knowledge_base = relationship("KnowledgeBase", back_populates="processing_tasks")
    document = relationship("Document", back_populates="processing_tasks")
    document_upload = relationship("DocumentUpload", backref="processing_tasks")


class DocumentChunk(Base, TimestampMixin):
    """
    文档分块记录
    文档被切分后，每个块在此表记录一条。
    同时，块的内容会通过 Embedding 转为向量存入向量数据库。

    id 使用 content 的哈希，方便做增量更新（相同内容的块可跳过）
    chunk_metadata 存储 JSON，包括 page_content 等 LangChain Document 的元数据
    """
    __tablename__ = "document_chunks"

    id = Column(String(64), primary_key=True)
    kb_id = Column(Integer, ForeignKey("knowledge_bases.id"), nullable=False)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False)
    file_name = Column(String(255), nullable=False)
    chunk_metadata = Column(JSON, nullable=True)
    hash = Column(String(64), nullable=False, index=True)

    knowledge_base = relationship("KnowledgeBase", back_populates="chunks")
    document = relationship("Document", back_populates="chunks")

    __table_args__ = (
        sa.Index('idx_kb_file_name', 'kb_id', 'file_name'),
    )
