"""
Qdrant 向量存储实现
=================
作为 ChromaDB 的替代选项。
"""

import logging
from typing import List, Any, Tuple, Optional
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

    def add_documents(
        self, documents: List[Document], ids: Optional[List[str]] = None
    ) -> None:
        """
        添加文档到 Qdrant
        
        Args:
            documents: Document 对象列表
            ids: 与 documents 等长的点 id，须与 document_chunks.id 一致
            
        Note:
            由于智谱 AI Embedding API 限制每次最多 64 条，这里采用分批处理策略
        """
        if ids is not None and len(ids) != len(documents):
            raise ValueError("ids 长度必须与 documents 一致")
        # 分批处理，每批最多 10 条 (OpenAI / 兼容 API 的限制)
        batch_size = 10
        for i in range(0, len(documents), batch_size):
            batch = documents[i : i + batch_size]
            batch_ids = ids[i : i + batch_size] if ids else None
            logger.debug(f"添加批次 {i // batch_size + 1}: {len(batch)} 个文档")
            if batch_ids is not None:
                self._store.add_documents(batch, ids=batch_ids)
            else:
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

    def count(self) -> int:
        """Return the number of documents in the collection"""
        return self._store._collection.count()
