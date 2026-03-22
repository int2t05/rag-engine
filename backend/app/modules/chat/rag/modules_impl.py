"""
可插拔 RAG 步骤实现
==================
各函数对应 LangChain 文档中的检索前/后处理；关闭时由 orchestrator 跳过。
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

from sqlalchemy.orm import Session

from app.models.knowledge import DocumentChunk
from app.modules.chat.rag.context import RagContext
from app.modules.chat.rag.retrieval_core import retrieve_for_context, truncate_to_top_k
from app.shared.rag_dedupe import dedupe_retrieved_documents
from app.shared.llm.llm_factory import LLMFactory

logger = logging.getLogger(__name__)


def _normalize_chunk_id(val: Any) -> Optional[str]:
    if val is None:
        return None
    s = str(val).strip()
    return s or None


def _coerce_kb_doc_ids(md: Dict[str, Any]) -> Optional[tuple[int, int]]:
    """从检索 metadata 解析 kb_id、document_id；失败则返回 None。"""
    try:
        kb = md.get("kb_id")
        doc = md.get("document_id")
        if kb is None or doc is None:
            return None
        return int(kb), int(doc)
    except (TypeError, ValueError):
        return None


def _enrich_chunk_id_and_parent_from_db(db: Session, doc: Any) -> None:
    """Chroma 可能缺 chunk_id：用 kb_id+document_id+正文在库表对齐子块行并补全 chunk_id。"""
    md = dict(getattr(doc, "metadata", None) or {})
    pc = (getattr(doc, "page_content", None) or "").strip()
    if not pc:
        return
    ids = _coerce_kb_doc_ids(md)
    if ids is None:
        return
    kb_i, doc_i = ids
    rows = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.kb_id == kb_i, DocumentChunk.document_id == doc_i)
        .all()
    )
    has_cid = _normalize_chunk_id(md.get("chunk_id")) or _normalize_chunk_id(
        md.get("chunkId")
    )
    fallback = None
    for r in rows:
        cm = dict(r.chunk_metadata or {})  # type: ignore
        if (cm.get("page_content") or "").strip() != pc:
            continue
        has_p = cm.get("parent_chunk_id") is not None and str(
            cm.get("parent_chunk_id", "") # type: ignore
        ).strip()
        if has_p:
            if not has_cid:
                md["chunk_id"] = str(r.id)
            doc.metadata = md
            return
        if fallback is None:
            fallback = r
    if fallback is not None and not has_cid:
        md["chunk_id"] = str(fallback.id)
        doc.metadata = md


def _resolve_parent_chunk_id(db: Session, md: Dict[str, Any]) -> Optional[str]:
    """
    解析父块主键 id（64 位 hex）。
    若存在子块 `chunk_id`，以库表子块行的 `parent_chunk_id` 为准；否则回退 metadata。
    """
    cid = _normalize_chunk_id(md.get("chunk_id")) or _normalize_chunk_id(
        md.get("chunkId")
    )
    kb_doc = _coerce_kb_doc_ids(md)
    if cid:
        q = db.query(DocumentChunk).filter(DocumentChunk.id == cid)
        if kb_doc:
            q = q.filter(DocumentChunk.kb_id == kb_doc[0])
        row = q.first()
        if row and row.chunk_metadata:
            cm = dict(row.chunk_metadata)  # type: ignore
            p = cm.get("parent_chunk_id")
            if p is not None and str(p).strip():
                return str(p).strip()
    raw = md.get("parent_chunk_id") or md.get("parentChunkId")
    if raw is not None and str(raw).strip():
        return str(raw).strip()
    return None


def _find_parent_row_by_containment(
    db: Session,
    kb_id: int,
    document_id: int,
    child_text: str,
) -> Optional[DocumentChunk]:
    """子块 metadata 里的父 id 在库中缺失时：找含子块正文的最短父块行（入库时子必为父的子串）。"""
    ct = (child_text or "").strip()
    if not ct:
        return None
    rows = (
        db.query(DocumentChunk)
        .filter(
            DocumentChunk.kb_id == kb_id,
            DocumentChunk.document_id == document_id,
        )
        .all()
    )
    best: Optional[tuple[int, DocumentChunk]] = None
    for r in rows:
        cm = dict(r.chunk_metadata or {})  # type: ignore
        if not cm.get("is_parent"):
            continue
        pt = (cm.get("page_content") or "").strip()
        if not pt or ct not in pt: # type: ignore
            continue
        ln = len(pt)
        if best is None or ln < best[0]:
            best = (ln, r)
    return best[1] if best else None


def _load_parent_chunk_row(
    db: Session,
    pid: str,
    md: Dict[str, Any],
    child_text: str,
) -> Optional[DocumentChunk]:
    kb_doc = _coerce_kb_doc_ids(md)
    q = db.query(DocumentChunk).filter(DocumentChunk.id == pid)
    if kb_doc:
        q = q.filter(DocumentChunk.kb_id == kb_doc[0])
    row = q.first()
    if row:
        return row
    if not kb_doc:
        return None
    return _find_parent_row_by_containment(db, kb_doc[0], kb_doc[1], child_text)


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
        _enrich_chunk_id_and_parent_from_db(ctx.db, doc)
        md = dict(getattr(doc, "metadata", None) or {})
        pid = _resolve_parent_chunk_id(ctx.db, md)
        if not pid:
            continue
        child_body = getattr(doc, "page_content", "") or ""
        row = _load_parent_chunk_row(ctx.db, pid, md, child_body)
        if not row:
            logger.warning(
                "parent_child 展开失败：未找到父块 id=%s（子块 chunk_id=%s）",
                pid[:20] + ("…" if len(pid) > 20 else ""),
                md.get("chunk_id"),
            )
            continue
        if row.chunk_metadata:
            meta = dict(row.chunk_metadata)  # type: ignore
            text = meta.get("page_content") or ""
            if text:
                doc.page_content = text
                md["expanded_from_child"] = True
                md["parent_chunk_id"] = str(row.id)
                doc.metadata = md
                if str(row.id) != pid:
                    logger.debug(
                        "parent_child 以正文包含关系回退到父块 id=%s（metadata 原指向 %s）",
                        row.id,
                        pid[:20] + ("…" if len(pid) > 20 else ""),
                    )
            else:
                logger.warning(
                    "parent_child 展开失败：父块 id=%s 的 chunk_metadata 无 page_content",
                    pid[:20] + ("…" if len(pid) > 20 else ""),
                )

    # 展开后多条子块对应同一父块：合并为单条，避免参考来源重复
    ctx.retrieved_docs = dedupe_retrieved_documents(ctx.retrieved_docs)


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
