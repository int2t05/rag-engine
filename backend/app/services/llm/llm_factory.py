"""
LLM 工厂
========
根据运行时配置创建聊天模型，供 RAG 对话与评估使用。

仅支持两种入口：
- **openai**：`init_chat_model(..., model_provider="openai")`。除官方 OpenAI 外，凡提供
  OpenAI 兼容 HTTP API 的服务（DeepSeek、智谱 GLM、自建网关等）均通过配置接入。
- **ollama**：本地 ``langchain_ollama.ChatOllama``。

配置来自数据库（经 ContextVar 注入），不从 .env 读取。
"""

from __future__ import annotations

from typing import Optional

from langchain.chat_models.base import init_chat_model
from langchain_core.language_models import BaseChatModel
from langchain_ollama import ChatOllama

from app.services.ai_runtime_context import get_ai_runtime

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
        s = get_ai_runtime()
        provider = (provider or s.chat_provider).lower()
        if provider not in _SUPPORTED:
            raise ValueError(
                f"不支持的 chat_provider={provider!r}，仅支持 {sorted(_SUPPORTED)}。"
                " DeepSeek / 智谱等请使用 chat_provider=openai，"
                "并设置网关、密钥与模型名。"
            )

        if provider == "openai":
            return init_chat_model(
                model=s.openai_model,
                model_provider="openai",
                api_key=s.openai_api_key,
                base_url=_openai_base(s.openai_api_base),
                temperature=temperature,
                streaming=streaming,
            )

        return ChatOllama(
            model=s.ollama_model,
            base_url=_ollama_host(s.ollama_api_base),
            temperature=temperature,
        )
