"""
RAG 流水线上下文
================
在模块间传递可变状态；检索前写 retrieval_queries / retrieval_query，
检索后写 retrieved_docs。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, List

from sqlalchemy.orm import Session

from app.models.knowledge import KnowledgeBase
from app.schemas.rag_pipeline import RagPipelineOptions


@dataclass  # 自动生成 __init__、__repr__、__eq__ 等方法
class RagContext:
    """单次用户提问对应的 RAG 流水线上下文。"""

    query: str
    messages: dict
    chat_history: list  # LangChain HumanMessage / AIMessage 列表
    knowledge_base_ids: List[int]
    db: Session
    knowledge_bases: List[KnowledgeBase]
    # 与 knowledge_bases 中有文档的库一一对应
    kb_ids_for_store: List[int]
    vector_stores: List[Any]

    options: RagPipelineOptions

    # 检索阶段：单查询或多查询
    retrieval_query: str = ""
    retrieval_queries: List[str] = field(default_factory=list)

    retrieved_docs: List[Any] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not self.retrieval_query:
            self.retrieval_query = self.query
