"""
RAGAS（collections）单样本评分：Strict JSON 提示 + 工厂注入。
1. 判分 LLM：LLMFactory
2. 需要向量时：EmbeddingsFactory
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

import httpx
from openai import AsyncOpenAI

from app.schemas.ai_runtime import AiRuntimeSettings
from app.modules.evaluation.evaluation_config import (
    EVAL_HTTP_TIMEOUT_SEC,
    EVAL_RAGAS_ASCORE_CALL_TIMEOUT_SEC,
    SCORE_KEYS,
)

_HTTPX_TIMEOUT = httpx.Timeout(
    float(EVAL_HTTP_TIMEOUT_SEC),
    connect=min(30.0, float(EVAL_HTTP_TIMEOUT_SEC)),
)

from ragas.metrics.collections import (
    AnswerCorrectness,
    AnswerRelevancy,
    ContextPrecision,
    ContextRecall,
    ContextRelevance,
    Faithfulness,
)
from ragas.metrics.collections.answer_correctness.util import (
    CorrectnessClassifierPrompt,
    StatementGeneratorPrompt as ACStatementGeneratorPrompt,
)
from ragas.metrics.collections.answer_relevancy.util import AnswerRelevancePrompt
from ragas.metrics.collections.context_precision.util import ContextPrecisionPrompt
from ragas.metrics.collections.context_recall.util import ContextRecallPrompt
from ragas.metrics.collections.context_relevance.util import (
    ContextRelevanceJudge1Prompt,
    ContextRelevanceJudge2Prompt,
)
from ragas.metrics.collections.faithfulness.util import (
    NLIStatementPrompt,
    StatementGeneratorPrompt as FStatementGeneratorPrompt,
)

_JSON = (
    "\n\nCRITICAL: Output ONLY valid JSON. No explanations, no text before or after the JSON. "
    "Start with { and end with }."
)


def _j(cls: type) -> str:
    return (getattr(cls, "instruction", None) or "").strip() + _JSON


class _SFG(FStatementGeneratorPrompt):
    instruction = _j(FStatementGeneratorPrompt)


class _NLI(NLIStatementPrompt):
    instruction = _j(NLIStatementPrompt)


class StrictFaithfulness(Faithfulness):
    def __init__(self, llm: Any):
        super().__init__(llm=llm)
        self.statement_generator_prompt = _SFG()
        self.nli_statement_prompt = _NLI()


class _ARP(AnswerRelevancePrompt):
    instruction = _j(AnswerRelevancePrompt)


class StrictAnswerRelevancy(AnswerRelevancy):
    def __init__(self, llm: Any, embeddings: Any, strictness: int = 3):
        super().__init__(llm=llm, embeddings=embeddings, strictness=strictness)
        self.prompt = _ARP()


class _CPP(ContextPrecisionPrompt):
    instruction = _j(ContextPrecisionPrompt)


class StrictContextPrecision(ContextPrecision):
    def __init__(self, llm: Any):
        super().__init__(llm=llm)
        self.prompt = _CPP()


class _CRP(ContextRecallPrompt):
    instruction = _j(ContextRecallPrompt)


class StrictContextRecall(ContextRecall):
    def __init__(self, llm: Any):
        super().__init__(llm=llm)
        self.prompt = _CRP()


class _J1(ContextRelevanceJudge1Prompt):
    instruction = _j(ContextRelevanceJudge1Prompt)


class _J2(ContextRelevanceJudge2Prompt):
    instruction = _j(ContextRelevanceJudge2Prompt)


class StrictContextRelevance(ContextRelevance):
    def __init__(self, llm: Any, **kwargs: Any):
        super().__init__(llm=llm, **kwargs)
        self.judge1_prompt = _J1()
        self.judge2_prompt = _J2()


class _ACSG(ACStatementGeneratorPrompt):
    instruction = _j(ACStatementGeneratorPrompt)


class _ACC(CorrectnessClassifierPrompt):
    instruction = _j(CorrectnessClassifierPrompt)


class StrictAnswerCorrectness(AnswerCorrectness):
    def __init__(self, llm: Any, embeddings: Any, **kwargs: Any):
        super().__init__(llm=llm, embeddings=embeddings, **kwargs)
        self.statement_generator_prompt = _ACSG()
        self.correctness_classifier_prompt = _ACC()


# ---------- 与数据库运行时配置一致的 RAGAS LLM / Embeddings ----------


def _base(url: str) -> str:
    b = (url or "").strip()
    return b if not b or b.endswith("/") else f"{b}/"


def _ollama_host(url: str) -> str:
    return (url or "").strip().rstrip("/")


def build_ragas_llm(ai: AiRuntimeSettings) -> Any:
    """
    构建 RAGAS LLM
    """
    from ragas.llms.base import llm_factory

    p = (ai.chat_provider or "openai").lower()
    if p == "openai":
        c = AsyncOpenAI(
            api_key=ai.openai_api_key,
            base_url=_base(ai.openai_api_base),
            timeout=_HTTPX_TIMEOUT,
        )
        return llm_factory(ai.openai_model, client=c, max_tokens=4096)
    if p == "ollama":
        h = _ollama_host(ai.ollama_api_base)
        c = AsyncOpenAI(
            base_url=f"{h}/v1",
            api_key="ollama",
            timeout=_HTTPX_TIMEOUT,
        )
        return llm_factory(ai.ollama_model, client=c, max_tokens=4096)
    raise ValueError(f"RAGAS 评估需要 chat_provider 为 openai 或 ollama，当前为 {p!r}")


def build_ragas_embeddings(ai: AiRuntimeSettings) -> Any:
    """
    构建 RAGAS Embeddings
    """
    from ragas.embeddings.base import embedding_factory

    raw = (ai.embeddings_provider or "openai").strip().lower().replace("-", "_")
    alias = {"open_ai": "openai"}.get(raw, raw)

    def _openai_emb(key: str, base: str, model: str) -> Any:
        return embedding_factory(
            "openai",
            model=model,
            client=AsyncOpenAI(
                api_key=key,
                base_url=_base(base),
                timeout=_HTTPX_TIMEOUT,
            ),
            interface="modern",
        )

    if alias == "openai":
        emb_base = (ai.openai_embeddings_api_base or "").strip() or ai.openai_api_base
        emb_key = (ai.openai_embeddings_api_key or "").strip() or ai.openai_api_key
        return _openai_emb(emb_key, emb_base, ai.openai_embeddings_model)
    if alias == "ollama":
        h = _ollama_host(
            (ai.ollama_embeddings_api_base or "").strip() or ai.ollama_api_base
        )
        return embedding_factory(
            "openai",
            model=ai.ollama_embeddings_model,
            client=AsyncOpenAI(
                base_url=f"{h}/v1",
                api_key="ollama",
                timeout=_HTTPX_TIMEOUT,
            ),
            interface="modern",
        )
    raise ValueError(
        f"不支持的 embeddings_provider={ai.embeddings_provider!r}（解析为 {alias!r}）；"
        "仅支持 openai、ollama"
    )


_EMBED_METRICS: Set[str] = {"answer_relevance", "answer_correctness"}


def metrics_need_embeddings(names: List[str]) -> bool:
    """
    判断是否需要 embeddings
    """
    return bool(_EMBED_METRICS.intersection(names))


def build_ragas_dependencies(
    need_emb: bool,
    ai_override: Optional[AiRuntimeSettings] = None,
) -> Tuple[Any, Optional[Any]]:
    """
    构造 (llm, embeddings)。仅在 need_embeddings 为 True 时创建嵌入，避免多余 API 调用。
    ``ai_override`` 为 None 时使用当前上下文中的全局模型配置（get_ai_runtime）。
    """
    from app.shared.ai_runtime_context import get_ai_runtime

    ai = ai_override if ai_override is not None else get_ai_runtime()
    llm = build_ragas_llm(ai)
    emb = build_ragas_embeddings(ai) if need_emb else None
    return llm, emb


def build_metric_instances(llm: Any, emb: Any, names: List[str]) -> Dict[str, Any]:
    """
    构建指标实例
    """
    out: Dict[str, Any] = {}
    for n in names:
        if n == "faithfulness":
            out[n] = StrictFaithfulness(llm=llm)
        elif n == "answer_relevance":
            if emb is None:
                raise ValueError("answer_relevance 需要 embeddings")
            out[n] = StrictAnswerRelevancy(llm=llm, embeddings=emb)
        elif n == "context_precision":
            out[n] = StrictContextPrecision(llm=llm)
        elif n == "context_recall":
            out[n] = StrictContextRecall(llm=llm)
        elif n == "context_relevance":
            out[n] = StrictContextRelevance(llm=llm)
        elif n == "answer_correctness":
            if emb is None:
                raise ValueError("answer_correctness 需要 embeddings")
            out[n] = StrictAnswerCorrectness(llm=llm, embeddings=emb)
        else:
            raise ValueError(f"未知指标: {n!r}")
    return out


# (ans_ok, ctx_ok, ref_ok) -> skip 原因或 None
_SKIP: Dict[str, Callable[[bool, bool, bool], Optional[str]]] = {
    "faithfulness": lambda a, c, r: (
        None if (a and c) else "需要非空 response 与 retrieved_contexts"
    ),
    "answer_relevance": lambda a, c, r: None if a else "需要非空 response",
    "context_relevance": lambda a, c, r: None if c else "需要非空 retrieved_contexts",
    "context_precision": lambda a, c, r: (
        None if (r and c) else "需要 reference 与 retrieved_contexts"
    ),
    "context_recall": lambda a, c, r: (
        None if (r and c) else "需要 reference 与 retrieved_contexts"
    ),
    "answer_correctness": lambda a, c, r: (
        None if (a and r) else "需要非空 response 与 reference"
    ),
}

# kwargs for metric.ascore
_KW: Dict[str, Callable[[str, str, List[str], str], dict]] = {
    "faithfulness": lambda u, resp, ctx, ref: {
        "user_input": u,
        "response": resp,
        "retrieved_contexts": ctx,
    },
    "answer_relevance": lambda u, resp, ctx, ref: {"user_input": u, "response": resp},
    "context_relevance": lambda u, resp, ctx, ref: {
        "user_input": u,
        "retrieved_contexts": ctx,
    },
    "context_precision": lambda u, resp, ctx, ref: {
        "user_input": u,
        "reference": ref,
        "retrieved_contexts": ctx,
    },
    "context_recall": lambda u, resp, ctx, ref: {
        "user_input": u,
        "retrieved_contexts": ctx,
        "reference": ref,
    },
    "answer_correctness": lambda u, resp, ctx, ref: {
        "user_input": u,
        "response": resp,
        "reference": ref,
    },
}


async def _ascore_retry(
    metric: Any,
    label: str,
    kwargs: dict,
    max_retries: int = 3,
) -> float:
    last: Optional[BaseException] = None
    for i in range(1, max_retries + 1):
        try:
            r = await asyncio.wait_for(
                metric.ascore(**kwargs),
                timeout=float(EVAL_RAGAS_ASCORE_CALL_TIMEOUT_SEC),
            )
            return float(r.value)
        except asyncio.TimeoutError as e:
            last = e
            logging.warning(
                "RAGAS 指标 %s 单次 ascore 超过 %ss（第 %s/%s 次）",
                label,
                EVAL_RAGAS_ASCORE_CALL_TIMEOUT_SEC,
                i,
                max_retries,
            )
            if i == max_retries:
                raise TimeoutError(
                    f"指标 {label} 在 {EVAL_RAGAS_ASCORE_CALL_TIMEOUT_SEC}s 内未完成（已重试 {max_retries} 次）"
                ) from e
            await asyncio.sleep(1)
        except Exception as e:
            last = e
            if i == max_retries:
                logging.warning(
                    "RAGAS 指标 %s 在 %s 次重试后仍失败: %s", label, max_retries, e
                )
                raise
            await asyncio.sleep(1)
    raise RuntimeError(last)  # pragma: no cover


async def evaluate_metrics_sample(
    instances: Dict[str, Any],
    *,
    user_input: str,
    response: str,
    retrieved_contexts: List[str],
    reference: str,
    max_retries: int = 3,
) -> Dict[str, Any]:
    """
    对单条样本按已构建的 instances 计算分数。
    """
    scores: Dict[str, Optional[float]] = {k: None for k in SCORE_KEYS}
    skipped: Dict[str, str] = {}

    ref_ok = bool((reference or "").strip())
    ctx_ok = bool(retrieved_contexts)
    ans_ok = bool((response or "").strip())

    for name, metric in instances.items():
        sk = _SKIP[name](ans_ok, ctx_ok, ref_ok)
        if sk:
            skipped[name] = sk
            continue
        try:
            scores[name] = await _ascore_retry(
                metric,
                name,
                _KW[name](user_input, response, retrieved_contexts, reference),
                max_retries,
            )
        except Exception as e:
            scores[name] = None
            skipped[name] = str(e)

    return {**scores, "skipped": skipped}


def empty_score_row() -> dict:
    """无 RAGAS 或异常时的占位结构（与 evaluate_metrics_sample 键一致，不含 skipped）。"""
    return {k: None for k in SCORE_KEYS}
