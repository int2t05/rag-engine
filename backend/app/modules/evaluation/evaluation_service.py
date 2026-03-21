"""
RAG 评估执行服务（对应《RAG评估业务流程最佳实践》第二节 Step 4）

每条用例：检索 → 生成 → RAGAS 打分 → 落库；阈值见 ``PASS_THRESHOLD``（与文档核心指标 0.6 一致）。
"""

import asyncio
import logging
import time
from typing import Any, Dict, List, Optional

from langchain_core.messages import HumanMessage
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.evaluation import EvaluationResult, EvaluationTask, EvaluationTestCase
from app.models.knowledge import Document, KnowledgeBase
from app.modules.evaluation.evaluation_config import (
    AVG_SUMMARY_KEYS,
    EVALUATION_TYPE_NEEDS_GENERATION,
    EVALUATION_TYPE_NEEDS_RETRIEVAL,
    SCORE_KEYS,
    resolve_metrics,
)
from app.shared.embedding.embedding_factory import EmbeddingsFactory
from app.shared.llm.llm_factory import LLMFactory
from app.shared.vector_store import VectorStoreFactory
from app.shared.rag_dedupe import dedupe_retrieved_documents
from app.shared.ai_runtime_loader import AiRuntimeNotConfigured
from app.shared.ai_runtime_scope import ai_runtime_scope

# RAGAS collections + 本模块严格指标
_RAGAS_AVAILABLE = False
_RAGAS_IMPORT_ERROR: Optional[str] = None
try:
    import ragas.metrics.collections  # noqa: F401

    _RAGAS_AVAILABLE = True
except ImportError as e:
    _RAGAS_IMPORT_ERROR = str(e)

# 通过阈值（文档定义）
PASS_THRESHOLD = 0.6


def _retrieve(
    query: str,
    vector_store: Any,
    top_k: int,
) -> List[str]:
    """检索阶段：对 query 进行向量检索，返回 top_k 个文档片段文本。"""
    docs = vector_store.similarity_search(query, k=top_k)
    docs = dedupe_retrieved_documents(docs)
    return [d.page_content for d in docs]


def _generate_answer(query: str, contexts: List[str], llm: Any) -> str:
    """
    生成阶段：基于上下文生成答案。
    遵循「仅依据上下文回答」原则，上下文不足时明确告知。
    """
    if not contexts:
        return "根据提供的上下文，无法回答该问题。上下文为空。"

    context_text = "\n\n---\n\n".join(contexts)
    prompt = f"""你是一个严谨的问答助手。请 strictly 仅根据以下「上下文」回答用户问题。
如果上下文中没有足够信息回答，请明确说明「根据上下文无法确定」。
不要编造、推测或使用上下文以外的知识。

上下文：
{context_text}

用户问题：{query}

请给出简洁、准确的答案："""

    # LangChain 模型需传入 Message 列表
    response = llm.invoke(
        [HumanMessage(content=prompt)]
    )  # invoke 方法异步调用大语言模型
    if hasattr(response, "content"):
        return response.content
    return str(response)


def _evaluate_with_ragas(
    question: str,
    contexts: List[str],
    answer: str,
    ground_truth: str,
    metrics_to_use: List[str],
) -> dict:
    """单条样本：RAGAS collections ascore（Strict 提示 + 重试）。"""
    from app.modules.evaluation.ragas_eval import (
        build_metric_instances,
        build_ragas_dependencies,
        empty_score_row,
        evaluate_metrics_sample,
        metrics_need_embeddings,
    )

    if not metrics_to_use:
        return empty_score_row()

    if not _RAGAS_AVAILABLE:
        logging.warning(
            "RAGAS 未安装或导入失败，无法进行评分。请执行: pip install ragas datasets。"
            f"导入错误: {_RAGAS_IMPORT_ERROR or '未知'}"
        )
        return {
            **empty_score_row(),
            "error": f"RAGAS 未安装: {_RAGAS_IMPORT_ERROR or '请 pip install ragas datasets'}",
        }

    async def _run() -> dict:
        need_emb = metrics_need_embeddings(metrics_to_use)
        llm, emb = build_ragas_dependencies(need_emb)
        inst = build_metric_instances(llm, emb, metrics_to_use)
        return await evaluate_metrics_sample(
            inst,
            user_input=question,
            response=answer or "",
            retrieved_contexts=contexts,
            reference=ground_truth or "",
        )

    try:
        return asyncio.run(_run())
    except Exception as e:
        logging.exception("RAGAS 评估执行异常: %s", e)
        return {**empty_score_row(), "error": str(e)}


def _is_passed(scores: dict, metrics_used: List[str]) -> int:
    """
    本次任务所选指标均须有有效分数，且均 ≥ PASS_THRESHOLD。
    """
    for m in metrics_used:
        v = scores.get(m)
        if v is None:
            return 0
        try:
            fv = float(v)
        except (TypeError, ValueError):
            return 0
        if fv < PASS_THRESHOLD:
            return 0
    return 1


def run_evaluation_task(task_id: int) -> None:
    """
    后台执行评估任务的主入口。

    流程：
    1. 加载任务和测试用例
    2. 如有知识库，加载向量存储
    3. 对每个测试用例：检索 → 生成 → 评估 → 保存
    4. 汇总统计，更新任务 summary 和 status
    """
    db: Session = SessionLocal()
    try:
        # 1. 加载任务和测试用例
        task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
        if not task:
            return

        if task.status == "running":
            return

        test_cases = (
            db.query(EvaluationTestCase)
            .filter(EvaluationTestCase.task_id == task_id)
            .order_by(EvaluationTestCase.id)
            .all()
        )

        if not test_cases:
            task.status = "completed"  # type: ignore
            task.summary = {"total": 0, "message": "无测试用例"}  # type: ignore
            db.commit()
            return

        uid: Optional[int] = task.created_by  # type: ignore[assignment]
        if not uid and task.knowledge_base_id:
            kb_u = (
                db.query(KnowledgeBase)
                .filter(KnowledgeBase.id == task.knowledge_base_id)
                .first()
            )
            if kb_u:
                uid = kb_u.user_id

        if not uid:
            task.status = "failed"  # type: ignore
            task.error_message = "无法确定所属用户，无法加载模型配置"  # type: ignore
            db.commit()
            return

        task.status = "running"  # type: ignore
        db.commit()

        try:
            with ai_runtime_scope(db, uid):
                _run_evaluation_body(db, task_id, task, test_cases)
        except AiRuntimeNotConfigured as e:
            task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
            if task:
                task.status = "failed"  # type: ignore
                task.error_message = e.detail  # type: ignore
                db.commit()
            return

    except Exception as e:
        task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
        if task:
            task.status = "failed"  # type: ignore
            task.error_message = str(e)  # type: ignore
            db.commit()
        raise
    finally:
        db.close()


def _run_evaluation_body(
    db: Session,
    task_id: int,
    task: EvaluationTask,
    test_cases: List[EvaluationTestCase],
) -> None:
    # 2. 加载向量存储和 LLM（如需知识库）
    vector_store = None
    if task.knowledge_base_id:
        kb = (
            db.query(KnowledgeBase)
            .filter(KnowledgeBase.id == task.knowledge_base_id)
            .first()
        )
        if kb:
            docs = (
                db.query(Document)
                .filter(Document.knowledge_base_id == task.knowledge_base_id)
                .all()
            )
            if docs:
                embeddings = EmbeddingsFactory.create()
                vector_store = VectorStoreFactory.create(
                    collection_name=f"kb_{task.knowledge_base_id}",
                    embedding_function=embeddings,
                )

    # 用于生成的 LLM（非流式，temperature=0）
    llm = LLMFactory.create(temperature=0, streaming=False)

    if not _RAGAS_AVAILABLE:
        logging.warning(
            "RAGAS 未安装，评估将执行检索和生成，但无法计算评分。"
            "请执行: pip install ragas datasets"
        )

    top_k = task.top_k or 5
    eval_type = (task.evaluation_type or "full").lower()
    needs_retrieval = EVALUATION_TYPE_NEEDS_RETRIEVAL.get(eval_type, True)
    needs_generation = EVALUATION_TYPE_NEEDS_GENERATION.get(eval_type, True)
    raw_em = getattr(task, "evaluation_metrics", None)
    metrics_for_type = resolve_metrics(eval_type, raw_em)

    start_time = time.time()
    total_passed = 0
    score_lists: Dict[str, List[float]] = {k: [] for k in SCORE_KEYS}

    # 3. 对每个测试用例：检索 → 生成（按需）→ 评估 → 保存
    for tc in test_cases:
        # 3a. 检索
        retrieved_contexts: List[str] = []
        if vector_store and needs_retrieval:
            retrieved_contexts = _retrieve(tc.query, vector_store, top_k)

        # 3b. 生成（retrieval 类型跳过）
        generated_answer: Optional[str] = None
        if needs_generation:
            generated_answer = _generate_answer(tc.query, retrieved_contexts, llm)
        else:
            generated_answer = ""

        # 3c. 评估（按类型只计算对应指标）
        scores = _evaluate_with_ragas(
            question=tc.query,
            contexts=retrieved_contexts,
            answer=generated_answer or "",
            ground_truth=tc.reference or "",
            metrics_to_use=metrics_for_type,
        )

        passed = _is_passed(scores, metrics_for_type)
        total_passed += passed

        for k in SCORE_KEYS:
            v = scores.get(k)
            if v is not None:
                try:
                    score_lists[k].append(float(v))
                except (TypeError, ValueError):
                    pass

        # 3d. 保存结果（仅持久化列上存在的指标；answer_correctness 等在 judge_details）
        def _mask_score(name: str) -> Optional[float]:
            return scores.get(name) if name in metrics_for_type else None

        _three_core = (
            "context_relevance" in metrics_for_type
            and "faithfulness" in metrics_for_type
            and "answer_relevance" in metrics_for_type
        )
        result = EvaluationResult(
            task_id=task_id,
            test_case_id=tc.id,
            retrieved_contexts=retrieved_contexts,
            generated_answer=generated_answer,
            context_relevance=_mask_score("context_relevance"),
            faithfulness=_mask_score("faithfulness"),
            answer_relevance=_mask_score("answer_relevance"),
            context_recall=_mask_score("context_recall"),
            context_precision=_mask_score("context_precision"),
            ragas_score=(
                scores.get("ragas_score") if _three_core else None
            ),
            passed=passed,
            judge_details={
                k: v
                for k, v in scores.items()
                if k
                in set(metrics_for_type)
                | {"ragas_score", "error", "skipped", "answer_correctness"}
            },
        )
        db.add(result)
        db.commit()

    # 4. 汇总统计
    duration = time.time() - start_time
    n = len(test_cases)
    pass_rate = total_passed / n if n else 0

    base_summary: dict = {
        "total": n,
        "passed": total_passed,
        "failed": n - total_passed,
        "pass_rate": round(pass_rate, 4),
        "duration_seconds": round(duration, 2),
        "evaluation_type": eval_type,
        "metrics": metrics_for_type,
    }
    if not _RAGAS_AVAILABLE:
        base_summary["warning"] = "RAGAS 未安装，无法计算评分。请执行: pip install ragas datasets"
    for k, label in AVG_SUMMARY_KEYS.items():
        vals = score_lists[k]
        if vals:
            base_summary[label] = round(sum(vals) / len(vals), 4)

    task.summary = base_summary  # type: ignore
    task.status = "completed"  # type: ignore
    db.commit()
