"""
Qdrant 向量存储实现
=================
作为 ChromaDB 的替代选项。
"""

import logging
from typing import List, Any, Tuple
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_community.vectorstores import Qdrant
from qdrant_client import QdrantClient
from qdrant_client.http.exceptions import UnexpectedResponse  # 异常处理
from app.core.config import settings

from .base import BaseVectorStore

logger = logging.getLogger(__name__)


class QdrantStore(BaseVectorStore):
    """Qdrant vector store implementation"""

    def __init__(self, collection_name: str, embedding_function: Embeddings, **kwargs):
        """Initialize Qdrant vector store"""
        qdrant_client = QdrantClient(
            url=settings.QDRANT_URL,
            prefer_grpc=settings.QDRANT_PREFER_GRPC,
        )

        self._store = Qdrant(
            client=qdrant_client,  # 显式传入客户端（更可控）
            collection_name=collection_name,
            embeddings=embedding_function,
        )

    def add_documents(self, documents: List[Document]) -> None:
        """
        添加文档到 Qdrant
        
        Args:
            documents: Document 对象列表
            
        Note:
            由于智谱 AI Embedding API 限制每次最多 64 条，这里采用分批处理策略
        """
        # 分批处理，每批最多 64 条 (智谱 AI 的限制)
        batch_size = 64
        for i in range(0, len(documents), batch_size):
            batch = documents[i:i + batch_size]
            logger.debug(f"添加批次 {i // batch_size + 1}: {len(batch)} 个文档")
            self._store.add_documents(batch)

    def delete(self, ids: List[str]) -> None:
        """Delete documents from Qdrant"""
        self._store.delete(ids)

    def as_retriever(self, **kwargs: Any):
        """Return a retriever interface"""
        return self._store.as_retriever(**kwargs)

    def similarity_search(
        self, query: str, k: int = 4, **kwargs: Any
    ) -> List[Document]:
        """Search for similar documents in Qdrant"""
        return self._store.similarity_search(query, k=k, **kwargs)

    def similarity_search_with_score(
        self, query: str, k: int = 4, **kwargs: Any
    ) -> List[Document]:
        """Search for similar documents in Qdrant with score"""
        return self._store.similarity_search_with_score(query, k=k, **kwargs) # type: ignore

    def delete_collection(self) -> None:
        """Delete the entire collection"""
        self._store._client.delete_collection(self._store._collection_name) # type: ignore
