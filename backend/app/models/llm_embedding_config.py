"""
用户级 LLM / 嵌入配置（多份配置 + 当前启用）
"""

from sqlalchemy import Column, ForeignKey, Integer, String, JSON
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin


class LlmEmbeddingConfig(Base, TimestampMixin):
    __tablename__ = "llm_embedding_configs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    config_json = Column(JSON, nullable=False)

    user = relationship(
        "User",
        back_populates="llm_embedding_configs",
        foreign_keys=[user_id],
    )
