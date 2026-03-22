"""
RAG 编排器
==========
按 LangChain 官方 RAG 教程中的顺序串联「检索前处理 → 检索 → 检索后处理」：
查询重写与多查询属检索前；向量/混合检索为检索本体；父子展开与重排属检索后。
"""

from __future__ import annotations

import logging

from app.modules.chat.rag.context import RagContext
from app.modules.chat.rag.modules_impl import (
    apply_multi_route,
    apply_parent_child_expand,
    apply_query_rewrite,
    apply_rerank,
    run_dense_and_hybrid_retrieval,
)

logger = logging.getLogger(__name__)


class RagOrchestrator:
    """根据 RagContext.options 执行可插拔流水线。"""

    @staticmethod
    async def run_retrieval_pipeline(ctx: RagContext) -> None:
        """按顺序执行可插拔流水线。"""
        # 1) 检索前：独立问句（可选）
        await apply_query_rewrite(ctx)
        # 2) 检索前：多路子查询（可选）
        await apply_multi_route(ctx)
        if not ctx.retrieval_queries:
            ctx.retrieval_queries = [ctx.retrieval_query or ctx.query]
        # 3) 检索：稠密 + 可选 BM25 混合 + 多库 + 多查询
        run_dense_and_hybrid_retrieval(ctx)
        # 4) 检索后：父子块展开（可选）
        apply_parent_child_expand(ctx)
        # 5) 检索后：重排与截断至 top_k
        apply_rerank(ctx)
        logger.info(
            "RAG 流水线完成: top_k=%s 片段数=%d 模块=%s",
            ctx.options.top_k,
            len(ctx.retrieved_docs),
            ctx.options.model_dump(),
        )
