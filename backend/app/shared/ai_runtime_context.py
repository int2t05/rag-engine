"""请求或后台任务内注入的 LLM/嵌入运行时配置（ContextVar）。"""

from __future__ import annotations

from contextvars import ContextVar
from typing import Optional

from app.schemas.ai_runtime import AiRuntimeSettings

_ai_runtime_var: ContextVar[Optional[AiRuntimeSettings]] = ContextVar(
    "_ai_runtime_var", default=None
)


def get_ai_runtime() -> AiRuntimeSettings:
    v = _ai_runtime_var.get()
    if v is None:
        raise RuntimeError("未注入 AI 运行时配置")
    return v


def set_ai_runtime_token(s: AiRuntimeSettings):
    return _ai_runtime_var.set(s)


def reset_ai_runtime_token(token) -> None:
    _ai_runtime_var.reset(token)
