"""
RAG 编排器
==========
按 LangChain 官方 RAG 教程中的顺序串联「检索前处理 → 检索 → 检索后处理」：
查询重写与多查询属检索前；向量/混合检索为检索本体；父子展开与重排属检索后。
"""

from __future__ import annotations

import logging
from typing import AsyncIterator, Tuple

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
    async def iter_retrieval_pipeline(
        ctx: RagContext,
    ) -> AsyncIterator[Tuple[str, str]]:
        """
        按顺序执行可插拔流水线，并在每个阶段前 yield (step_id, 中文说明) 供 SSE 推送。
        仅在实际启用的模块前推送步骤，避免界面上出现未勾选能力对应的说明。
        """
        opts = ctx.options
        # 1) 检索前：独立问句（可选）
        if opts.query_rewrite:
            yield (
                "query_preprocess",
                "查询预处理（历史感知改写、多路准备）…",
            )
        await apply_query_rewrite(ctx)
        # 2) 检索前：多路子查询（可选）
        if opts.multi_route:
            yield ("multi_route", "多路子查询扩展与合并…")
        await apply_multi_route(ctx)
        if not ctx.retrieval_queries:
            ctx.retrieval_queries = [ctx.retrieval_query or ctx.query]
        # 3) 检索：查询 Embedding 编码 + 稠密相似度（Chroma）+ 可选 BM25 混合 + 多库 + 多查询
        if opts.hybrid and opts.multi_kb:
            retrieval_label = (
                "Embedding 向量化查询 → 稠密向量检索 + BM25 关键词，多库并行召回…"
            )
        elif opts.hybrid:
            retrieval_label = (
                "Embedding 向量化查询 → 稠密向量检索 + BM25 关键词混合召回…"
            )
        elif opts.multi_kb:
            retrieval_label = (
                "Embedding 向量化查询 → 稠密向量相似度检索，多库并行…"
            )
        else:
            retrieval_label = "Embedding 向量化查询 → 稠密向量相似度检索（Chroma）…"
        yield ("vector_retrieval", retrieval_label)
        run_dense_and_hybrid_retrieval(ctx)
        # 4) 检索后：父子块展开（可选）
        if opts.parent_child:
            yield ("parent_child", "父子文档块展开与对齐…")
        apply_parent_child_expand(ctx)
        # 5) 检索后：重排与截断至 top_k
        if opts.rerank:
            yield ("rerank", "重排序与截断至 top_k…")
        apply_rerank(ctx)
        logger.info(
            "RAG 流水线完成: top_k=%s 片段数=%d 模块=%s",
            ctx.options.top_k,
            len(ctx.retrieved_docs),
            ctx.options.model_dump(),
        )

    @staticmethod
    async def run_retrieval_pipeline(ctx: RagContext) -> None:
        """按顺序执行可插拔流水线（无进度事件，兼容旧调用）。"""
        async for _ in RagOrchestrator.iter_retrieval_pipeline(ctx):
            pass
