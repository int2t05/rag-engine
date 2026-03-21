"""
Embedding 工厂
=============
``EMBEDDINGS_PROVIDER`` 仅两种：

- ``openai`` —— ``OpenAIEmbeddings`` + 嵌入相关字段；配置来自数据库中的用户运行时配置（ContextVar）
- ``ollama`` —— ``OllamaEmbeddings``

别名：``open_ai`` → ``openai``。关闭 tiktoken 与 ``check_embedding_ctx_length`` 以减少网关兼容问题。
"""

from __future__ import annotations

from typing import Final

from langchain_core.embeddings import Embeddings
from langchain_ollama import OllamaEmbeddings
from langchain_openai import OpenAIEmbeddings

from app.shared.ai_runtime_context import get_ai_runtime


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
    s = get_ai_runtime()
    custom = (s.openai_embeddings_api_base or "").strip()
    return custom if custom else s.openai_api_base


def _openai_embeddings_api_key() -> str:
    s = get_ai_runtime()
    custom = (s.openai_embeddings_api_key or "").strip()
    return custom if custom else s.openai_api_key


def _ollama_embeddings_base_url() -> str:
    s = get_ai_runtime()
    custom = (s.ollama_embeddings_api_base or "").strip()
    return custom if custom else s.ollama_api_base


def _openai_style_embeddings(*, api_key: str, base_url: str, model: str) -> Embeddings:
    return OpenAIEmbeddings(
        api_key=api_key,
        base_url=_openai_base(base_url),
        model=model,
        tiktoken_enabled=False,
        check_embedding_ctx_length=False,
    )


class EmbeddingsFactory:
    """按当前请求/任务注入的运行时配置创建文本嵌入模型。"""

    @staticmethod
    def create() -> Embeddings:
        s = get_ai_runtime()
        provider = _canonical_provider(s.embeddings_provider)

        if provider not in _SUPPORTED:
            raise ValueError(
                f"不支持的 embeddings_provider={s.embeddings_provider!r} "
                f"（解析为 {provider!r}）。请使用 openai 或 ollama；"
                "其它 OpenAI 兼容服务请设 openai 并配置网关与密钥。"
            )

        if provider == "openai":
            return _openai_style_embeddings(
                api_key=_openai_embeddings_api_key(),
                base_url=_openai_embeddings_base_url(),
                model=s.openai_embeddings_model,
            )

        return OllamaEmbeddings(
            model=s.ollama_embeddings_model,
            base_url=_ollama_host(_ollama_embeddings_base_url()),
        )
