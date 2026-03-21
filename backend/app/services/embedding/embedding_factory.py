"""
Embedding 工厂
=============
``EMBEDDINGS_PROVIDER`` 仅两种：

- ``openai`` —— ``OpenAIEmbeddings`` + ``OPENAI_EMBEDDINGS_*``；若嵌入与对话不同网关，设
  ``OPENAI_EMBEDDINGS_API_BASE``（及可选 ``OPENAI_EMBEDDINGS_API_KEY``），否则沿用 ``OPENAI_API_*``
- ``ollama`` —— ``OllamaEmbeddings``；若嵌入节点与对话不同，设 ``OLLAMA_EMBEDDINGS_API_BASE``，否则 ``OLLAMA_API_BASE``

别名：``open_ai`` → ``openai``。关闭 tiktoken 与 ``check_embedding_ctx_length`` 以减少网关兼容问题。
"""

from __future__ import annotations

from typing import Final

from langchain_core.embeddings import Embeddings
from langchain_ollama import OllamaEmbeddings
from langchain_openai import OpenAIEmbeddings

from app.core.config import settings


def _openai_base(url: str) -> str:
    b = (url or "").strip()
    return b if not b or b.endswith("/") else f"{b}/"


def _ollama_host(url: str) -> str:
    return (url or "").strip().rstrip("/")


_PROVIDER_ALIASES: Final[dict[str, str]] = {
    "open_ai": "openai",
}

_SUPPORTED: Final[frozenset[str]] = frozenset({"ollama", "openai"})


def _canonical_provider(raw: str) -> str:
    key = (raw or "").strip().lower().replace("-", "_")
    return _PROVIDER_ALIASES.get(key, key)


def _openai_embeddings_base_url() -> str:
    custom = (settings.OPENAI_EMBEDDINGS_API_BASE or "").strip()
    return custom if custom else settings.OPENAI_API_BASE


def _openai_embeddings_api_key() -> str:
    custom = (settings.OPENAI_EMBEDDINGS_API_KEY or "").strip()
    return custom if custom else settings.OPENAI_API_KEY


def _ollama_embeddings_base_url() -> str:
    custom = (settings.OLLAMA_EMBEDDINGS_API_BASE or "").strip()
    return custom if custom else settings.OLLAMA_API_BASE


def _openai_style_embeddings(*, api_key: str, base_url: str, model: str) -> Embeddings:
    return OpenAIEmbeddings(
        api_key=api_key,
        base_url=_openai_base(base_url),
        model=model,
        tiktoken_enabled=False,
        check_embedding_ctx_length=False,
    )


class EmbeddingsFactory:
    """按配置创建文本嵌入模型（向量检索 / 入库）。"""

    @staticmethod
    def create() -> Embeddings:
        provider = _canonical_provider(settings.EMBEDDINGS_PROVIDER)

        if provider not in _SUPPORTED:
            raise ValueError(
                f"不支持的 EMBEDDINGS_PROVIDER={settings.EMBEDDINGS_PROVIDER!r} "
                f"（解析为 {provider!r}）。请使用 openai 或 ollama；"
                "其它 OpenAI 兼容服务请设 openai 并配置 OPENAI_API_*。"
            )

        if provider == "openai":
            return _openai_style_embeddings(
                api_key=_openai_embeddings_api_key(),
                base_url=_openai_embeddings_base_url(),
                model=settings.OPENAI_EMBEDDINGS_MODEL,
            )

        return OllamaEmbeddings(
            model=settings.OLLAMA_EMBEDDINGS_MODEL,
            base_url=_ollama_host(_ollama_embeddings_base_url()),
        )
