from sqlalchemy import Column, Integer, String, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.models.base import Base, TimestampMixin

class KnowledgeBase(Base, TimestampMixin):
    """知识库模型"""
    __tablename__ = "knowledge_bases"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, comment="知识库名称")
    description = Column(Text, comment="知识库描述")
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, comment="所属用户ID")
    
    # 关联关系：一个用户拥有多个知识库
    user = relationship("User", back_populates="knowledge_bases")
    # 预留文档关联（后续扩展）
    documents = relationship("Document", back_populates="knowledge_base", cascade="all, delete-orphan")

class Document(Base, TimestampMixin):
    """知识库文档模型（预留）"""
    __tablename__ = "documents"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    content = Column(Text)
    knowledge_base_id = Column(Integer, ForeignKey("knowledge_bases.id"), nullable=False)
    
    knowledge_base = relationship("KnowledgeBase", back_populates="documents")