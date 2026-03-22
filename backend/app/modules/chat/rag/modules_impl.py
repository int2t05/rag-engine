"""
可插拔 RAG 步骤实现
==================
各函数对应 LangChain 文档中的检索前/后处理；关闭时由 orchestrator 跳过。
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, List

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

from app.models.knowledge import DocumentChunk
from app.modules.chat.rag.context import RagContext
from app.modules.chat.rag.retrieval_core import retrieve_for_context, truncate_to_top_k
from app.shared.llm.llm_factory import LLMFactory

logger = logging.getLogger(__name__)


async def apply_query_rewrite(ctx: RagContext) -> None:
    """检索前：历史感知，将多轮指代消解为独立检索句。"""
    if not ctx.options.query_rewrite:
        ctx.retrieval_query = ctx.query
        return
    llm = LLMFactory.create()
    from langchain_core.prompts import MessagesPlaceholder

    contextualize_q_prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "Given a chat history and the latest user question "
                "which might reference context in the chat history, "
                "formulate a standalone question which can be understood "
                "without the chat history. Do NOT answer the question, just "
                "reformulate it if needed and otherwise return it as is.",
            ),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}"),
        ]
    )
    chain = contextualize_q_prompt | llm | StrOutputParser()
    standalone = await chain.ainvoke(
        {"input": ctx.query, "chat_history": ctx.chat_history}
    )
    ctx.retrieval_query = (standalone or ctx.query).strip() or ctx.query


async def apply_multi_route(ctx: RagContext) -> None:
    """检索前：多查询扩展；与 multi_query_retriever 思想一致。"""
    base = ctx.retrieval_query or ctx.query
    if not ctx.options.multi_route:
        ctx.retrieval_queries = [base]
        return
    llm = LLMFactory.create()
    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You output ONLY a JSON array of 2 to 4 strings. Each string is a "
                "search query variant for finding relevant documents. No markdown, no explanation.",
            ),
            ("human", "User question: {q}\nStandalone query: {sq}"),
        ]
    )
    chain = prompt | llm | StrOutputParser()
    raw = await chain.ainvoke({"q": ctx.query, "sq": base})
    queries: List[str] = [base]
    try:
        m = re.search(r"\[[\s\S]*\]", raw)  # Regular Expression
        arr = json.loads(m.group(0) if m else raw)  # 解析为 Python list
        if isinstance(arr, list):
            for x in arr:
                if isinstance(x, str) and x.strip():
                    queries.append(x.strip())
    except (json.JSONDecodeError, AttributeError, TypeError):
        logger.debug("multi_route JSON 解析失败，使用单查询")
    # 去重保持顺序
    seen = set()
    out: List[str] = []
    for q in queries:
        if q not in seen:
            seen.add(q)
            out.append(q)
    ctx.retrieval_queries = out[:5] or [base]  # 最多保留 5 个检索查询


def run_dense_and_hybrid_retrieval(ctx: RagContext) -> None:
    """检索：向量（+ 可选混合）+ 多库 + 多查询合并。"""
    # 1. 配对：知识库ID ↔ 对应的向量存储
    pairs = list(zip(ctx.kb_ids_for_store, ctx.vector_stores))

    # 2. 确定参与检索的知识库范围
    kb_corpus = (
        ctx.kb_ids_for_store if ctx.options.multi_kb else ctx.kb_ids_for_store[:1]
    )

    ctx.retrieved_docs = retrieve_for_context(
        db=ctx.db,  # 数据库连接
        vector_store_pairs=pairs,  # 知识库↔向量存储配对
        kb_ids_for_corpus=kb_corpus,  # 参与检索的知识库范围
        queries=ctx.retrieval_queries,  # 多查询变体（最多5个）
        multi_kb=ctx.options.multi_kb,  # 是否多知识库模式
        top_k=ctx.options.top_k,  # 每个查询返回的片段数
        hybrid=ctx.options.hybrid,  # 是否混合检索（向量+关键词）
        hybrid_vector_weight=ctx.options.hybrid_vector_weight,  # 向量权重
    )


def apply_parent_child_expand(ctx: RagContext) -> None:
    """检索后：子块命中时换为父块全文（若已入库）。"""
    if not ctx.options.parent_child:
        return
    for doc in ctx.retrieved_docs:
        md = dict(getattr(doc, "metadata", None) or {})
        pid = md.get("parent_chunk_id")
        if not pid:
            continue
        row = ctx.db.query(DocumentChunk).filter(DocumentChunk.id == str(pid)).first()
        if row and row.chunk_metadata:
            meta = dict(row.chunk_metadata)  # type: ignore
            text = meta.get("page_content") or ""
            if text:
                doc.page_content = text
                md["expanded_from_child"] = True
                md["parent_chunk_id"] = str(pid)
                doc.metadata = md


def apply_rerank(ctx: RagContext) -> None:
    """检索后：交叉编码器重排，截断至 top_k。"""
    opts = ctx.options

    if not opts.rerank or not ctx.retrieved_docs:
        ctx.retrieved_docs = truncate_to_top_k(ctx.retrieved_docs, opts.top_k)
        return

    # 计算重排候选数量（默认为 top_k * 4 或 16，取较大值）
    top_n = opts.rerank_top_n or max(opts.top_k * 4, 16)
    top_n = min(top_n, len(ctx.retrieved_docs))

    # 用第一个查询变体作为重排查询
    query = ctx.retrieval_queries[0] if ctx.retrieval_queries else ctx.retrieval_query

    try:
        from flashrank import Ranker, RerankRequest
    except ImportError:
        logger.warning("flashrank 未安装，跳过重排")
        ctx.retrieved_docs = truncate_to_top_k(ctx.retrieved_docs, opts.top_k)
        return

    # 初始化重排模型，准备候选文档
    ranker = Ranker()
    docs_slice = ctx.retrieved_docs[:top_n]  # 只取 top_n 个进入重排

    # 转换为 flashrank 格式
    passages = [
        {"id": i, "text": getattr(d, "page_content", "") or ""}
        for i, d in enumerate(docs_slice)
    ]

    # 执行重排
    req = RerankRequest(query=query, passages=passages)
    results = ranker.rerank(req)

    # 解析重排结果，得到新排序的索引顺序
    order = []
    for r in results:
        rid = r.get("id")
        if rid is None:
            continue
        order.append(int(rid))

    # 按新顺序重排文档
    reranked = [docs_slice[i] for i in order if 0 <= i < len(docs_slice)]
    if not reranked:
        reranked = docs_slice

    # 截断到最终 top_k，返回
    ctx.retrieved_docs = truncate_to_top_k(reranked, opts.top_k)
