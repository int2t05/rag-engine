"""
RAG 评估类型配置
================
定义不同评估类型的执行流程与返回指标。

| 类型 | 评估内容 | 适用场景 |
|------|----------|----------|
| full | 检索 + 生成 + 全指标评分 | 完整评估 |
| retrieval | 仅检索 + 检索指标 | 专注优化检索 |
| generation | 仅生成 + 生成指标 | 专注优化生成 |
"""

from typing import List, Literal

# 评估类型字面量
EvaluationTypeLiteral = Literal["full", "retrieval", "generation"]

# 支持的评估类型列表
EVALUATION_TYPES: List[str] = ["full", "retrieval", "generation"]

# 各类型对应的指标
RETRIEVAL_METRICS = ["context_relevance", "context_precision", "context_recall"]
GENERATION_METRICS = ["faithfulness", "answer_relevance"]
FULL_METRICS = RETRIEVAL_METRICS + GENERATION_METRICS

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
    return EVALUATION_TYPE_METRICS.get(eval_type, FULL_METRICS)


def get_evaluation_types_config() -> List[dict]:
    """获取评估类型配置列表，供 API 返回给前端"""
    return [
        {
            "type": "full",
            "label": "完整评估",
            "description": "检索 + 生成 + 全指标评分",
            "metrics": FULL_METRICS,
            "needs_retrieval": True,
            "needs_generation": True,
        },
        {
            "type": "retrieval",
            "label": "检索评估",
            "description": "仅检索 + 检索指标，专注优化检索",
            "metrics": RETRIEVAL_METRICS,
            "needs_retrieval": True,
            "needs_generation": False,
        },
        {
            "type": "generation",
            "label": "生成评估",
            "description": "仅生成 + 生成指标，专注优化生成",
            "metrics": GENERATION_METRICS,
            "needs_retrieval": True,
            "needs_generation": True,
        },
    ]
