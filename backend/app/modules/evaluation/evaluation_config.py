"""
RAG 评估：类型与指标映射
========================
与《docs/RAG评估业务流程最佳实践.md》第三节一致；LLM/Embedding 环境变量见该文档第四节。

| 类型 | 内容 | 场景 |
|------|------|------|
| full | 检索 + 生成 + 全指标 | 默认全流程 |
| retrieval | 检索 + 检索侧指标 | 调检索 |
| generation | 检索 + 生成 + 生成侧指标 | 调生成（仍要检索上下文） |

若请求体带 ``evaluation_metrics``，则只算列出的指标（须为 ``ALLOWED_METRICS`` 子集）。
"""

from typing import List, Literal, Optional, Tuple

# 评估类型字面量
EvaluationTypeLiteral = Literal["full", "retrieval", "generation"]

# 支持的评估类型列表
EVALUATION_TYPES: List[str] = ["full", "retrieval", "generation"]

# 各类型对应的指标
RETRIEVAL_METRICS = ["context_relevance", "context_precision", "context_recall"]
GENERATION_METRICS = ["faithfulness", "answer_relevance"]
FULL_METRICS = RETRIEVAL_METRICS + GENERATION_METRICS

# 允许在「自定义指标列表」中选用的全部指标（与 RAGAS collections 一致）
ALLOWED_METRICS: List[str] = [
    "faithfulness",
    "answer_relevance",
    "context_precision",
    "context_recall",
    "context_relevance",
    "answer_correctness",
]
ALLOWED_METRICS_SET = frozenset(ALLOWED_METRICS)

# 结果表 / 汇总用到的分数字段（顺序固定，供循环聚合）
SCORE_KEYS: Tuple[str, ...] = (
    "context_relevance",
    "faithfulness",
    "answer_relevance",
    "context_precision",
    "context_recall",
    "answer_correctness",
)

# ---------- 评估流水线超时（秒）：防止检索 / LLM / RAGAS 无限挂死 ----------
# 向量检索（同步 similarity_search）
EVAL_RETRIEVE_TIMEOUT_SEC: int = 120
# 单条用例答案生成（同步 llm.invoke）
EVAL_GENERATE_TIMEOUT_SEC: int = 180
# RAGAS 单次 metric.ascore（内部多轮 LLM）
EVAL_RAGAS_ASCORE_CALL_TIMEOUT_SEC: int = 120
# 单条用例 RAGAS 全部指标合计（含重试）
EVAL_RAGAS_SAMPLE_TOTAL_TIMEOUT_SEC: int = 600
# OpenAI 兼容 HTTP 客户端（RAGAS 所用 AsyncOpenAI）
EVAL_HTTP_TIMEOUT_SEC: int = 120

# summary 中 avg_* 字段名
AVG_SUMMARY_KEYS: dict[str, str] = {
    "context_relevance": "avg_context_relevance",
    "faithfulness": "avg_faithfulness",
    "answer_relevance": "avg_answer_relevance",
    "context_precision": "avg_context_precision",
    "context_recall": "avg_context_recall",
    "answer_correctness": "avg_answer_correctness",
}

# 类型 -> 指标映射
EVALUATION_TYPE_METRICS: dict[str, List[str]] = {
    "full": FULL_METRICS,
    "retrieval": RETRIEVAL_METRICS,
    "generation": GENERATION_METRICS,
}

# 类型 -> 是否执行检索
EVALUATION_TYPE_NEEDS_RETRIEVAL: dict[str, bool] = {
    "full": True,
    "retrieval": True,
    "generation": True,  # 生成需要上下文，故仍需检索
}

# 类型 -> 是否执行生成
EVALUATION_TYPE_NEEDS_GENERATION: dict[str, bool] = {
    "full": True,
    "retrieval": False,
    "generation": True,
}


def get_metrics_for_type(eval_type: str) -> List[str]:
    """获取指定评估类型对应的指标列表"""
    return list(EVALUATION_TYPE_METRICS.get(eval_type, FULL_METRICS))


def validate_metric_list(names: List[str]) -> List[str]:
    """校验指标名非空、去重、均为合法值；返回规范化后的列表。"""
    if not names:
        raise ValueError("evaluation_metrics 不能为空")
    seen: set[str] = set()
    out: List[str] = []
    for raw in names:
        n = (raw or "").strip().lower().replace("-", "_")
        if not n:
            continue
        if n not in ALLOWED_METRICS_SET:
            raise ValueError(
                f"不支持的指标: {raw!r}，允许: {sorted(ALLOWED_METRICS_SET)}"
            )
        if n not in seen:
            seen.add(n)
            out.append(n)
    if not out:
        raise ValueError("evaluation_metrics 解析后为空")
    return out


def resolve_metrics(
    eval_type: str,
    selected: Optional[List[str]],
) -> List[str]:
    """
    若 ``selected`` 非空，使用自定义指标；否则按评估类型默认列表。
    """
    if selected is not None and len(selected) > 0:
        return validate_metric_list(selected)
    return get_metrics_for_type(eval_type)


def get_evaluation_types_config() -> List[dict]:
    """获取评估类型配置列表，供 API 返回给前端"""
    return [
        {
            "type": "full",
            "label": "完整评估",
            "description": "检索 + 生成 + 全指标评分",
            "metrics": FULL_METRICS,
            "allowed_metrics": ALLOWED_METRICS,
            "needs_retrieval": True,
            "needs_generation": True,
        },
        {
            "type": "retrieval",
            "label": "检索评估",
            "description": "仅检索 + 检索指标，专注优化检索",
            "metrics": RETRIEVAL_METRICS,
            "allowed_metrics": ALLOWED_METRICS,
            "needs_retrieval": True,
            "needs_generation": False,
        },
        {
            "type": "generation",
            "label": "生成评估",
            "description": "仅生成 + 生成指标，专注优化生成",
            "metrics": GENERATION_METRICS,
            "allowed_metrics": ALLOWED_METRICS,
            "needs_retrieval": True,
            "needs_generation": True,
        },
    ]
