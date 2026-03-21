"""
用户 LLM / 嵌入配置行级数据访问
==============================
"""

from __future__ import annotations

from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.llm_embedding_config import LlmEmbeddingConfig
from app.models.user import User


class LlmEmbeddingConfigRepository:
    """LlmEmbeddingConfig 与用户 active 指针的查询。"""

    def __init__(self, db: Session) -> None:
        self.db = db

    def list_for_user_ordered(self, user_id: int) -> List[LlmEmbeddingConfig]:
        return (
            self.db.query(LlmEmbeddingConfig)
            .filter(LlmEmbeddingConfig.user_id == user_id)
            .order_by(LlmEmbeddingConfig.id.desc())
            .all()
        )

    def get_owned(self, config_id: int, user_id: int) -> Optional[LlmEmbeddingConfig]:
        return (
            self.db.query(LlmEmbeddingConfig)
            .filter(
                LlmEmbeddingConfig.id == config_id,
                LlmEmbeddingConfig.user_id == user_id,
            )
            .first()
        )

    def get_user_row(self, user_id: int) -> Optional[User]:
        return self.db.query(User).filter(User.id == user_id).first()

    def add(self, row: LlmEmbeddingConfig) -> None:
        self.db.add(row)

    def delete_row(self, row: LlmEmbeddingConfig) -> None:
        self.db.delete(row)
