"""从数据库加载当前用户启用的 LLM/嵌入配置。"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.llm_embedding_config import LlmEmbeddingConfig
from app.models.user import User
from app.schemas.ai_runtime import AiRuntimeSettings


class AiRuntimeNotConfigured(Exception):
    """用户未保存并启用任何模型配置。"""

    def __init__(self, detail: str = "请先在「模型配置」中保存并启用一套配置") -> None:
        self.detail = detail
        super().__init__(detail)


def load_ai_runtime_for_user(db: Session, user_id: int) -> AiRuntimeSettings:
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.active_llm_embedding_config_id:
        raise AiRuntimeNotConfigured()

    row = (
        db.query(LlmEmbeddingConfig)
        .filter(
            LlmEmbeddingConfig.id == user.active_llm_embedding_config_id,
            LlmEmbeddingConfig.user_id == user_id,
        )
        .first()
    )
    if not row:
        raise AiRuntimeNotConfigured("当前启用的配置不存在，请重新选择")

    return AiRuntimeSettings.model_validate(row.config_json)
