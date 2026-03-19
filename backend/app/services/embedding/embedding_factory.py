"""
Embedding 工厂
=============
根据 EMBEDDINGS_PROVIDER 配置创建文本嵌入模型实例。

Embedding 将文本转换为固定长度的向量表示，用于：
- 文档分块向量化后写入向量数据库
- 用户查询向量化后与知识库进行相似度检索
"""

from app.core.config import settings
from langchain_openai import OpenAIEmbeddings
from langchain_ollama import OllamaEmbeddings
from langchain_community.embeddings import DashScopeEmbeddings, ZhipuAIEmbeddings


class EmbeddingsFactory:
    """文本嵌入模型工厂，按配置创建对应 provider 的 Embedding 实例"""

    @staticmethod
    def create():
        """
        创建 Embedding 实例

        根据 settings.EMBEDDINGS_PROVIDER 选择：
        - openai: OpenAI / 兼容接口
        - dashscope: 阿里云通义
        - ollama: 本地 Ollama
        - zhipu: 智谱 GLM

        Returns:
            Embeddings: LangChain 兼容的嵌入模型实例

        Raises:
            ValueError: 当 provider 不支持时
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
