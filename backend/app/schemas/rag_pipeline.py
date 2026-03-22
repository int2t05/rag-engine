"""
RAG 流水线选项（与对话 SSE、评估任务共用）
======================================
前端勾选与 API 请求体对齐；各字段默认关闭，仅 Native 向量检索 + 指定 top_k。
"""

from pydantic import BaseModel, Field


class RagPipelineOptions(BaseModel):
    """可插拔模块开关与参数；未列出的能力视为关闭（no-op）。"""

    top_k: int = Field(default=4, ge=1, le=100, description="最终参与生成与引用的片段数")

    query_rewrite: bool = Field(
        default=False,
        description="历史感知查询重写（LangChain RAG 中的检索前 query transformation）",
    )
    multi_kb: bool = Field(
        default=False,
        description="在关联的多个知识库集合上分别检索并合并去重；关闭时仅使用第一个有向量的库",
    )
    hybrid: bool = Field(
        default=False,
        description="稠密向量 + BM25 稀疏检索，RRF 融合（混合检索）",
    )
    multi_route: bool = Field(
        default=False,
        description="多路召回：由 LLM 生成若干子查询并行检索后合并去重",
    )
    rerank: bool = Field(
        default=False,
        description="检索后交叉编码器重排（FlashRank）",
    )
    parent_child: bool = Field(
        default=False,
        description="若片段元数据含 parent_chunk_id，则展开为父块全文再送入 LLM",
    )

    rerank_top_n: int | None = Field(
        default=None,
        ge=1,
        le=200,
        description="重排前保留的候选数；默认 max(top_k*4, 16)",
    )
    hybrid_vector_weight: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="RRF 中向量侧权重调节（与稀疏侧对称融合时使用）",
    )
