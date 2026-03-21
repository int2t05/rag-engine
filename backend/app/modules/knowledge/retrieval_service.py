"""
知识库向量检索（共用）
====================
控制台「检索测试」等入口共用此实现。
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from app.core.exceptions import ResourceNotFoundError
from app.modules.knowledge.repository import KnowledgeRepository
from app.shared.ai_runtime_scope import ai_runtime_scope
from app.shared.embedding.embedding_factory import EmbeddingsFactory
from app.shared.rag_dedupe import dedupe_scored_pairs
from app.shared.vector_store import VectorStoreFactory

logger = logging.getLogger(__name__)


def kb_similarity_search(
    db: Session,
    user_id: int,
    kb_id: int,
    query: str,
    top_k: int,
    *,
    not_found_detail: str | None = None,
) -> Dict[str, Any]:
    """
    在指定知识库上做相似度检索，返回 {\"results\": [{content, metadata, score}, ...]}。

    若知识库不存在或不属于 user_id，抛出 ResourceNotFoundError；
    not_found_detail 未传时使用默认中文文案。
    """
    repo = KnowledgeRepository(db)
    if repo.get_owned_kb(kb_id, user_id) is None:
        raise ResourceNotFoundError(
            not_found_detail or f"未找到知识库{kb_id}"
        )

    with ai_runtime_scope(db, user_id):
        embeddings = EmbeddingsFactory.create()
        vector_store = VectorStoreFactory.create(
            collection_name=f"kb_{kb_id}",
            embedding_function=embeddings,
        )
        pairs = vector_store.similarity_search_with_score(query, k=top_k)
        pairs = dedupe_scored_pairs(pairs)

    out: List[Dict[str, Any]] = []
    for doc, score in pairs:
        out.append(
            {
                "content": doc.page_content,  # type: ignore[union-attr]
                "metadata": doc.metadata,  # type: ignore[union-attr]
                "score": float(score),
            }
        )
    return {"results": out}


def kb_similarity_search_safe(
    db: Session,
    user_id: int,
    kb_id: int,
    query: str,
    top_k: int,
    *,
    not_found_detail: str | None = None,
) -> Dict[str, Any]:
    """
    与 kb_similarity_search 相同，但将未预期的底层异常转为 500 语义（供 OpenAPI 等保持原行为）。
    """
    try:
        return kb_similarity_search(
            db, user_id, kb_id, query, top_k, not_found_detail=not_found_detail
        )
    except ResourceNotFoundError:
        raise
    except Exception as e:
        logger.error("kb_similarity_search 错误: %s", e, exc_info=True)
        raise
