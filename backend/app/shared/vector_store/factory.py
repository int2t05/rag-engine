"""
向量存储工厂
==========
MVP 仅支持 Chroma：根据集合名与嵌入函数创建 `ChromaVectorStore`。
"""

from typing import Any

from langchain_core.embeddings import Embeddings

from .chroma import ChromaVectorStore


class VectorStoreFactory:
    """创建 Chroma 向量存储实例（唯一后端）。"""

    @classmethod
    def create(
        cls,
        collection_name: str,
        embedding_function: Embeddings,
        **kwargs: Any,
    ) -> ChromaVectorStore:
        """
        参数：
            collection_name: 集合名称（通常 `kb_{id}`）
            embedding_function: LangChain Embeddings
            **kwargs: 传给 Chroma 实现的附加参数
        """
        return ChromaVectorStore(
            collection_name=collection_name,
            embedding_function=embedding_function,
            **kwargs,
        )
