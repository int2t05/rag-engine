"""
检索结果去重
============
同一 chunk 若因历史原因在向量库中存在多条点（例如未按 chunk_id 删除残留），
相似度检索会多次命中相同片段。按 chunk_id（或回退键）保留第一条。

父子分块展开为父块全文后，多个子块命中会变成相同正文但 chunk_id 仍不同，
此时按 parent_chunk_id 合并为一条引用（见 _doc_dedupe_key）。
"""

from typing import Any, List, Tuple


def dedupe_retrieved_documents(docs: List[Any]) -> List[Any]:
    """对 LangChain Document 列表按 chunk_id / 内容去重，保持顺序。"""
    seen: set = set()
    out: List[Any] = []
    for doc in docs:
        key = _doc_dedupe_key(doc)
        if key in seen:
            continue
        seen.add(key)
        out.append(doc)
    return out


def dedupe_scored_pairs(
    pairs: List[Tuple[Any, float]],
) -> List[Tuple[Any, float]]:
    """对 (document, score) 列表去重，保留每个键首次出现的分数。"""
    seen: set = set()
    out: List[Tuple[Any, float]] = []
    for doc, score in pairs:
        key = _doc_dedupe_key(doc)
        if key in seen:
            continue
        seen.add(key)
        out.append((doc, score))
    return out


def _doc_dedupe_key(doc: Any) -> tuple:
    """对 LangChain Document 生成去重键。"""
    md = dict(getattr(doc, "metadata", None) or {})
    # 子块已展开为父块全文：多路命中同一父块时正文一致，按父块主键合并
    if md.get("expanded_from_child") and md.get("parent_chunk_id"):
        return ("parent", str(md["parent_chunk_id"]).strip())
    cid = md.get("chunk_id")
    if cid:
        return ("cid", str(cid))
    content = getattr(doc, "page_content", "") or ""
    return ("fb", md.get("source"), content)
