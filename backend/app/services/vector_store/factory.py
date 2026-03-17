"""
向量存储工厂
==========
根据 store_type 创建 ChromaDB 或 Qdrant 实例。
"""

from typing import Dict, Type, Any
from langchain_core.embeddings import Embeddings

from .base import BaseVectorStore
from .chroma import ChromaVectorStore
from .qdrant import QdrantStore


class VectorStoreFactory:
    """用于创建矢量存储实例的工厂"""

    _stores: Dict[str, Type[BaseVectorStore]] = {
        "chroma": ChromaVectorStore,
        "qdrant": QdrantStore,
    }

    @classmethod  # 类方法
    def create(
        cls,  # cls 是 "class" 的缩写
        store_type: str,
        collection_name: str,
        embedding_function: Embeddings,
        **kwargs: Any,
    ) -> BaseVectorStore:
        """创建矢量存储实例

        参数说明 (Args)：
            store_type: 向量存储类型（如 'chroma'、'qdrant' 等）
            collection_name: 集合名称
            embedding_function: 要使用的嵌入函数
            **kwargs: 特定向量存储实现的附加参数
        返回值 (Returns)：
            请求的向量存储的实例
        异常 (Raises)：
            ValueError: 如果 store_type 不被支持时抛出
        """
        store_class = cls._stores.get(store_type.lower())
        if not store_class:
            raise ValueError(
                f"Unsupported vector store type: {store_type}. "
                f"Supported types are: {', '.join(cls._stores.keys())}"
            )

        return store_class(
            collection_name=collection_name,
            embedding_function=embedding_function,
            **kwargs,
        )

    @classmethod
    def register_store(cls, name: str, store_class: Type[BaseVectorStore]) -> None:
        """注册一个新的向量存储实现
    
        参数说明 (Args)：
            name: 向量存储类型的名称
            store_class: 向量存储类的实现
        """
        cls._stores[name.lower()] = store_class
