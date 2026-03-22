"""
RAG 检索核心（Native + 混合 + 多库 + 多查询合并）
=============================================
与 LangChain 文档中「检索器组合」「混合检索」概念对齐：向量为主、BM25 为辅时用 RRF 融合。
"""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any, Dict, List, Sequence, Tuple

from langchain_core.documents import Document
from sqlalchemy.orm import Session

from app.models.knowledge import DocumentChunk
from app.shared.rag_dedupe import dedupe_retrieved_documents

logger = logging.getLogger(__name__)


def _doc_key(doc: Any) -> tuple:
    """对 LangChain Document 生成去重键。"""
    md = dict(getattr(doc, "metadata", None) or {})
    cid = md.get("chunk_id")
    if cid:
        return ("cid", str(cid))
    return ("fb", md.get("source"), getattr(doc, "page_content", "") or "")


def reciprocal_rank_fusion(
    ranked_lists: List[List[Any]],
    k: int = 60,
    weights: List[float] | None = None,
) -> List[Any]:
    """
    RRF：多路排序结果融合为单一排序。
    score(d) = sum_i w_i * 1/(k + rank_i(d))
    不在某一路检索中的文档，该路贡献为 0
    """
    if not ranked_lists:
        return []
    if weights is None:
        weights = [1.0] * len(ranked_lists)
    scores: Dict[tuple, float] = defaultdict(float)
    best_doc: Dict[tuple, Any] = {}
    # 遍历每路检索
    for weight, lst in zip(weights, ranked_lists):
        # 遍历该路检索结果中的每个文档（已按该路得分降序排列）
        for rank, doc in enumerate(lst):
            key = _doc_key(doc)  # 获取文档唯一标识
            scores[key] += weight * (1.0 / (k + rank + 1))
            if key not in best_doc:
                best_doc[key] = doc
    ordered = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)
    return [best_doc[k] for k in ordered]


def _load_bm25_corpus(
    db: Session, kb_ids: Sequence[int]
) -> Tuple[List[str], List[List[str]], Dict[str, Document]]:
    """
    返回 chunk_id 列表、与之一一对应的分词列表、id -> LangChain Document。
    """
    if not kb_ids:
        return [], [], {}
    rows = db.query(DocumentChunk).filter(DocumentChunk.kb_id.in_(list(kb_ids))).all()
    chunk_ids: List[str] = []
    corpus_tokens: List[List[str]] = []
    id_to_doc: Dict[str, Document] = {}
    for row in rows:
        meta = row.chunk_metadata or {}
        text = meta.get("page_content") or ""
        if not text.strip():
            continue
        toks = _simple_tokenize(text)
        if not toks:
            continue
        cid = str(row.id)
        chunk_ids.append(cid)
        corpus_tokens.append(toks)
        md = dict(meta)  # type: ignore
        md["chunk_id"] = md.get("chunk_id", cid)  # type: ignore
        id_to_doc[cid] = Document(page_content=text, metadata=md)
    return chunk_ids, corpus_tokens, id_to_doc


def _simple_tokenize(text: str) -> List[str]:
    """
    对中文文本进行简单分词。
    """
    import re

    parts = re.split(r"[\s\u3000]+", text.strip())
    out: List[str] = []
    for p in parts:
        if len(p) > 1:
            out.append(p.lower())
        else:
            for ch in p:
                if ch.strip():
                    out.append(ch.lower())
    return out


def bm25_top_ids(
    query: str,
    corpus_tokens: List[List[str]],
    chunk_ids: List[str],
    top_n: int,
) -> List[str]:
    """BM25 检索。"""
    try:
        from rank_bm25 import BM25Okapi
    except ImportError:
        logger.warning("rank_bm25 未安装，BM25 分支跳过")
        return []

    if not corpus_tokens or not chunk_ids or len(corpus_tokens) != len(chunk_ids):
        return []
    q_tokens = _simple_tokenize(query)
    if not q_tokens:
        return []
    bm25 = BM25Okapi(corpus_tokens)
    scores = bm25.get_scores(q_tokens)
    # 按得分降序排序，取 top N
    pairs = sorted(zip(chunk_ids, scores), key=lambda x: x[1], reverse=True)[:top_n]
    return [p[0] for p in pairs]


def vector_search_multi(
    vector_store_pairs: List[Tuple[int, Any]],
    query: str,
    k: int,
    multi_kb: bool,
) -> List[Any]:
    """在单个或多个集合上做相似度检索并合并。"""
    stores = vector_store_pairs if multi_kb else vector_store_pairs[:1]
    merged: List[Any] = []
    for _kb_id, vs in stores:
        part = vs.similarity_search(query, k=k)
        merged.extend(part)  # 把 part的每个元素逐一添加
    return dedupe_retrieved_documents(merged)


def hybrid_fuse(
    db: Session,
    kb_ids: Sequence[int],
    query: str,
    vector_docs: List[Any],
    bm25_fetch: int,
    vec_weight: float,
) -> List[Any]:
    """向量结果与 BM25 结果做 RRF 融合。"""
    # 加载 BM25 语料库
    chunk_ids, corpus_tokens, id_to_doc = _load_bm25_corpus(db, kb_ids)
    # BM25 关键词检索
    bm25_ids = bm25_top_ids(query, corpus_tokens, chunk_ids, bm25_fetch)
    # ID 映射回文档对象
    bm25_docs = [id_to_doc[i] for i in bm25_ids if i in id_to_doc]

    # 权重归一化（限制向量权重范围后，计算两路权重使和为1）
    vec_weight = max(0.01, min(1.0, vec_weight))  # 向量权重限制在 [0.01, 1.0]
    sparse_weight = 1.0 - vec_weight  # 稀疏权重 = 1 - 向量权重
    s = vec_weight + sparse_weight  # 总权重（应为1）
    w_vec = vec_weight / s  # 归一化
    w_sparse = sparse_weight / s  # 归一化

    # 5. RRF 倒数排名融合两路检索结果
    fused = reciprocal_rank_fusion(
        [vector_docs, bm25_docs],
        weights=[w_vec, w_sparse],
    )
    return fused


def retrieve_for_context(
    db: Session,  # 数据库会话
    vector_store_pairs: List[Tuple[int, Any]],  # 知识库ID与向量存储的配对列表
    kb_ids_for_corpus: List[int],  # 参与检索的知识库ID列表
    queries: List[str],  # 检索查询列表（多查询变体）
    multi_kb: bool,  # 是否多知识库模式
    top_k: int,  # 最终返回的片段数量
    hybrid: bool,  # 是否启用混合检索（向量+关键词）
    hybrid_vector_weight: float,  # 混合检索中向量检索的权重
) -> List[Any]:
    """
    执行完整检索：多查询 OR 单查询；每路向量检索；可选混合；去重截断。
    """
    # 计算每路检索应获取的候选数量（混合模式取更多）
    fetch_k = max(top_k * 3, top_k + 8) if hybrid else max(top_k * 2, top_k + 4)

    all_docs: List[Any] = []
    for q in queries:  # 遍历每个查询变体
        q = (q or "").strip()
        if not q:
            continue

        # 1. 向量检索：查询当前变体
        vec_part = vector_search_multi(vector_store_pairs, q, fetch_k, multi_kb)

        # 2. 决定是否混合关键词检索
        if hybrid and kb_ids_for_corpus:
            # 混合模式：融合向量检索 + 关键词检索的结果
            fused = hybrid_fuse(
                db,
                kb_ids_for_corpus,
                q,
                vec_part,
                fetch_k,
                hybrid_vector_weight,
            )
            all_docs.extend(fused)  # 收集混合融合后的结果
        else:
            all_docs.extend(vec_part)  # 纯向量检索，直接收集

    # 3. 对所有查询结果合并去重
    merged = dedupe_retrieved_documents(all_docs)

    # 4. 截断到 top_k * 4（或至少 top_k）个，返回给后续重排序阶段
    return merged[: max(top_k * 4, top_k)]


def truncate_to_top_k(docs: List[Any], top_k: int) -> List[Any]:
    """
    截断到 top_k 个结果
    """
    return docs[:top_k] if len(docs) > top_k else docs
