"""
Embedding 工厂
=============
根据配置创建 Embedding 实例（OpenAI / DashScope / Ollama）。
Embedding 将文本转换为固定长度的向量，用于向量检索。
"""

from app.core.config import settings
from langchain_openai import OpenAIEmbeddings
from langchain_ollama import OllamaEmbeddings
from langchain_community.embeddings import DashScopeEmbeddings, ZhipuAIEmbeddings


class EmbeddingsFactory:
    @staticmethod
    def create():
        """
        基于.env config创建嵌入实例的工厂方法。
        """
        # Suppose your .env has a value like EMBEDDINGS_PROVIDER=openai
        embeddings_provider = settings.EMBEDDINGS_PROVIDER.lower()

        if embeddings_provider == "openai":
            return OpenAIEmbeddings(
                api_key=settings.OPENAI_API_KEY,
                base_url=settings.OPENAI_API_BASE,
                model=settings.OPENAI_EMBEDDINGS_MODEL,
                # 禁用 tiktoken，避免：
                # 1) embedding-3 系列模型无法映射到 tokenizer 的 KeyError
                # 2) 从 openaipublic.blob.core.windows.net 下载 cl100k_base 时的 SSL/网络错误
                tiktoken_enabled=False,
            )
        elif embeddings_provider == "dashscope":
            return DashScopeEmbeddings(
                model=settings.DASH_SCOPE_EMBEDDINGS_MODEL,
                dashscope_api_key=settings.DASH_SCOPE_API_KEY,
            )
        elif embeddings_provider == "ollama":
            return OllamaEmbeddings(
                model=settings.OLLAMA_EMBEDDINGS_MODEL,
                base_url=settings.OLLAMA_API_BASE,
            )
        elif embeddings_provider == "zhipu":
            return ZhipuAIEmbeddings(
                api_key=settings.ZHIPUAI_API_KEY,
                model=settings.ZHIPUAI_EMBEDDINGS_MODEL,
            )

        # Extend with other providers:
        # elif embeddings_provider == "another_provider":
        #     return AnotherEmbeddingClass(...)
        else:
            raise ValueError(f"Unsupported embeddings provider: {embeddings_provider}")
