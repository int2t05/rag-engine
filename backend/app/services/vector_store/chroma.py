"""
ChromaDB 向量存储实现
==================
通过 HTTP 客户端连接 ChromaDB 服务。
"""

import logging
from typing import List, Any, Optional
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_chroma import Chroma
import chromadb
from app.core.config import settings

from .base import BaseVectorStore

logger = logging.getLogger(__name__)


class ChromaVectorStore(BaseVectorStore):
    """Chroma vector store 实现"""

    def __init__(self, collection_name: str, embedding_function: Embeddings, **kwargs):
        """初始化 Chroma vector store"""
        chroma_client = chromadb.HttpClient(
            host=settings.CHROMA_DB_HOST,
            port=settings.CHROMA_DB_PORT,
        )

        self._store = Chroma(
            client=chroma_client,
            collection_name=collection_name,
            embedding_function=embedding_function,
        )

    def add_documents(
        self, documents: List[Document], ids: Optional[List[str]] = None
    ) -> None:
        """
        添加文档到 Chroma
        
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
        """从 Chroma中删除文档"""
        self._store.delete(ids)

    def as_retriever(self, **kwargs: Any):
        """返回检索器接口"""
        return self._store.as_retriever(**kwargs)

    def similarity_search(
        self, query: str, k: int = 4, **kwargs: Any
    ) -> List[Document]:
        """在Chroma中搜索类似文档"""
        return self._store.similarity_search(query, k=k, **kwargs)

    def similarity_search_with_score(
        self, query: str, k: int = 4, **kwargs: Any
    ) -> List[Document]:
        """在Chroma中搜索带有分数的类似文档"""
        return self._store.similarity_search_with_score(query, k=k, **kwargs) # type: ignore

    def delete_collection(self) -> None:
        """删除整个集合"""
        self._store._client.delete_collection(self._store._collection.name)

    def count(self) -> int:
        """返回集合中的文档数量"""
        return self._store._collection.count()
