"""
LLM 工厂
========
根据 CHAT_PROVIDER 创建聊天模型，供 RAG 对话与评估使用。

仅支持两种入口：
- **openai**：`init_chat_model(..., model_provider="openai")`。除官方 OpenAI 外，凡提供
  OpenAI 兼容 HTTP API 的服务（DeepSeek、智谱 GLM、自建网关等）均通过配置
  ``OPENAI_API_BASE`` / ``OPENAI_API_KEY`` / ``OPENAI_MODEL`` 接入，无需单独 provider。
- **ollama**：本地 ``langchain_ollama.ChatOllama``。
"""

from __future__ import annotations

from typing import Optional

from langchain.chat_models.base import init_chat_model
from langchain_core.language_models import BaseChatModel
from langchain_ollama import ChatOllama

from app.core.config import settings

_SUPPORTED = frozenset({"openai", "ollama"})


def _openai_base(url: str) -> str:
    b = (url or "").strip()
    return b if not b or b.endswith("/") else f"{b}/"


def _ollama_host(url: str) -> str:
    return (url or "").strip().rstrip("/")


class LLMFactory:
    """按配置创建 LangChain BaseChatModel 实例。"""

    @staticmethod
    def create(
        provider: Optional[str] = None,
        temperature: float = 0,
        streaming: bool = True,
    ) -> BaseChatModel:
        """
        创建 LLM 实例。

        Args:
            provider: 提供商；默认 ``settings.CHAT_PROVIDER``，仅 ``openai`` 或 ``ollama``。
            temperature: 采样温度；评估建议 0。
            streaming: 是否流式；对话 True，评估 False。

        Returns:
            可用于 Chain / LCEL 的聊天模型。

        Raises:
            ValueError: 不支持的 provider。
        """
        provider = (provider or settings.CHAT_PROVIDER).lower()
        if provider not in _SUPPORTED:
            raise ValueError(
                f"不支持的 CHAT_PROVIDER={provider!r}，仅支持 {sorted(_SUPPORTED)}。"
                " DeepSeek / 智谱等请使用 CHAT_PROVIDER=openai，"
                "并设置 OPENAI_API_BASE、OPENAI_API_KEY、OPENAI_MODEL。"
            )

        if provider == "openai":
            return init_chat_model(
                model=settings.OPENAI_MODEL,
                model_provider="openai",
                api_key=settings.OPENAI_API_KEY,
                base_url=_openai_base(settings.OPENAI_API_BASE),
                temperature=temperature,
                streaming=streaming,
            )

        return ChatOllama(
            model=settings.OLLAMA_MODEL,
            base_url=_ollama_host(settings.OLLAMA_API_BASE),
            temperature=temperature
        )
