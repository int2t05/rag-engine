"""LLM/嵌入配置 API 模型"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from app.schemas.ai_runtime import AiRuntimeSettings


class LlmEmbeddingConfigCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    config: AiRuntimeSettings


class LlmEmbeddingConfigUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    config: Optional[AiRuntimeSettings] = None


class LlmEmbeddingConfigOut(BaseModel):
    id: int
    name: str
    config: AiRuntimeSettings
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class LlmEmbeddingConfigListResponse(BaseModel):
    items: List[LlmEmbeddingConfigOut]
    active_id: Optional[int] = None
