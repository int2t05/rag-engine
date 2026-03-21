"""
向量存储抽象基类
==============
定义向量存储的通用接口，Chroma 和 Qdrant 均实现此接口。
"""

from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings


class BaseVectorStore(ABC):
    """矢量存储实现的抽象基类"""

    @abstractmethod
    def __init__(self, collection_name: str, embedding_function: Embeddings, **kwargs):
        """初始化向量存储"""
        pass  # 语法占位符

    @abstractmethod
    def add_documents(
        self,
        documents: List[Document],
        ids: Optional[List[str]] = None,
    ) -> None:
        """将文档添加到矢量存储。ids 须与 documents 等长，且与库表 document_chunks.id 一致以便删除时按 id 清理向量。"""
        pass

    @abstractmethod
    def delete(self, ids: List[str]) -> None:
        """从矢量存储中删除文档"""
        pass

    @abstractmethod
    def as_retriever(self, **kwargs: Any):
        """返回向量存储区的检索器接口"""
        pass

    @abstractmethod
    def similarity_search(
        self, query: str, k: int = 4, **kwargs: Any
    ) -> List[Document]:
        """搜索类似文件"""
        pass

    @abstractmethod
    def similarity_search_with_score(
        self, query: str, k: int = 4, **kwargs: Any
    ) -> List[Document]:
        """搜索带有分数的类似文档"""
        pass

    @abstractmethod
    def delete_collection(self) -> None:
        """删除整个集合"""
        pass

    @abstractmethod
    def count(self) -> int:
        """返回集合中的文档数量"""
        pass
