"""
RAGAS 评分运行时：将任务级 judge_config 与用户全局 AiRuntimeSettings 合并。
任务中可含 openai_api_key 等覆盖项；未填的密钥仍用全局配置。
"""

from __future__ import annotations

from typing import Union

from app.schemas.ai_runtime import AiRuntimeSettings
from app.schemas.evaluation import EvaluationJudgeConfig


def merge_ai_runtime_for_judge(
    base: AiRuntimeSettings,
    judge: Union[EvaluationJudgeConfig, dict, None],
) -> AiRuntimeSettings:
    if judge is None:
        return base
    if isinstance(judge, dict):
        if not judge:
            return base
        judge = EvaluationJudgeConfig.model_validate(judge)
    raw = judge.model_dump(exclude_none=True)
    patch = {k: v for k, v in raw.items() if v != ""}
    if not patch:
        return base
    merged = {**base.model_dump(), **patch}
    return AiRuntimeSettings.model_validate(merged)
