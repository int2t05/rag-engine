"""
RAG 评估执行服务
================
每条用例：1. 检索 → 2. 生成 → 3. RAGAS 打分 → 4. 落库。
仅计算各 RAGAS 指标分值，不做通过/失败判定与综合分。
"""

import asyncio
import logging
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from typing import Any, Dict, List, Optional

from langchain_core.messages import HumanMessage
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from datetime import datetime

from app.db.session import SessionLocal
from app.models.base import BEIJING_TZ
from app.models.evaluation import EvaluationResult, EvaluationTask, EvaluationTestCase
from app.models.knowledge import Document, KnowledgeBase
from app.modules.evaluation.evaluation_config import (
    AVG_SUMMARY_KEYS,
    EVAL_GENERATE_TIMEOUT_SEC,
    EVAL_RAGAS_SAMPLE_TOTAL_TIMEOUT_SEC,
    EVAL_RETRIEVE_TIMEOUT_SEC,
    EVALUATION_TYPE_NEEDS_GENERATION,
    EVALUATION_TYPE_NEEDS_RETRIEVAL,
    SCORE_KEYS,
    resolve_metrics,
)
from app.shared.embedding.embedding_factory import EmbeddingsFactory
from app.shared.llm.llm_factory import LLMFactory
from app.shared.vector_store import VectorStoreFactory
from app.modules.chat.rag.retrieval_core import retrieve_for_context, truncate_to_top_k
from app.shared.ai_runtime_loader import AiRuntimeNotConfigured
from app.schemas.ai_runtime import AiRuntimeSettings
from app.shared.ai_runtime_context import get_ai_runtime
from app.shared.ai_runtime_scope import ai_runtime_scope
from app.modules.evaluation.judge_runtime import merge_ai_runtime_for_judge

# RAGAS collections + 本模块严格指标
_RAGAS_AVAILABLE = False
_RAGAS_IMPORT_ERROR: Optional[str] = None
try:
    import ragas.metrics.collections  # noqa: F401

    _RAGAS_AVAILABLE = True
except ImportError as e:
    _RAGAS_IMPORT_ERROR = str(e)

def _empty_score_row() -> dict:
    """无 RAGAS 或异常时的占位结构（与 evaluate_metrics_sample 键一致，不含 skipped）。"""
    return {k: None for k in SCORE_KEYS}


def _evaluation_task_still_present(db: Session, task_id: int) -> bool:
    """
    任务行是否仍存在（强制删除会级联删掉任务，后台线程需据此停止）。
    使用标量 SELECT，避免会话 identity map 返回已删行残留实例。
    """
    pk = db.scalar(select(EvaluationTask.id).where(EvaluationTask.id == task_id))
    return pk is not None


def _call_sync_with_timeout(fn: Any, timeout_sec: float, label: str) -> Any:
    """同步阻塞调用（向量库 / LangChain invoke）放入线程并限时，避免永久挂死 worker。"""
    with ThreadPoolExecutor(max_workers=1) as ex:
        fut = ex.submit(fn)
        try:
            return fut.result(timeout=timeout_sec)
        except FuturesTimeout:
            logging.warning("%s 超过 %s 秒未完成，已中止等待", label, timeout_sec)
            raise TimeoutError(f"{label} 超时（{int(timeout_sec)} 秒）") from None


def _retrieve(
    query: str,
    vector_store: Any,
    top_k: int,
    db: Session,
    kb_id: int,
) -> List[str]:
    """
    检索阶段：与对话 Native 路径一致（纯向量、多查询合并逻辑在 retrieval_core）。
    """

    def _inner() -> List[str]:
        pairs = [(kb_id, vector_store)]
        docs = retrieve_for_context(
            db=db,
            vector_store_pairs=pairs,
            kb_ids_for_corpus=[kb_id],
            queries=[query],
            multi_kb=False,
            top_k=top_k,
            hybrid=False,
            hybrid_vector_weight=0.5,
        )
        docs = truncate_to_top_k(docs, top_k)
        return [d.page_content for d in docs]

    return _call_sync_with_timeout(
        _inner,
        float(EVAL_RETRIEVE_TIMEOUT_SEC),
        "向量检索",
    )


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

    def _inner() -> str:
        response = llm.invoke([HumanMessage(content=prompt)])
        if hasattr(response, "content"):
            return response.content
        return str(response)

    return _call_sync_with_timeout(
        _inner,
        float(EVAL_GENERATE_TIMEOUT_SEC),
        "答案生成",
    )


def _evaluate_with_ragas(
    question: str,
    contexts: List[str],
    answer: str,
    ground_truth: str,
    metrics_to_use: List[str],
    judge_runtime: Optional[AiRuntimeSettings] = None,
) -> dict:
    """单条样本：RAGAS collections ascore（Strict 提示 + 重试）。"""
    from app.modules.evaluation.ragas_eval import (
        build_metric_instances,
        build_ragas_dependencies,
        evaluate_metrics_sample,
        metrics_need_embeddings,
    )

    if not metrics_to_use:
        return _empty_score_row()

    if not _RAGAS_AVAILABLE:
        logging.warning(
            "RAGAS 未安装或导入失败，无法进行评分。请执行: pip install ragas datasets。"
            f"导入错误: {_RAGAS_IMPORT_ERROR or '未知'}"
        )
        return {
            **_empty_score_row(),
            "error": f"RAGAS 未安装: {_RAGAS_IMPORT_ERROR or '请 pip install ragas datasets'}",
        }

    async def _run() -> dict:
        need_emb = metrics_need_embeddings(metrics_to_use)
        llm, emb = build_ragas_dependencies(need_emb, ai_override=judge_runtime)
        inst = build_metric_instances(llm, emb, metrics_to_use)
        return await asyncio.wait_for(
            evaluate_metrics_sample(
                inst,
                user_input=question,
                response=answer or "",
                retrieved_contexts=contexts,
                reference=ground_truth or "",
            ),
            timeout=float(EVAL_RAGAS_SAMPLE_TOTAL_TIMEOUT_SEC),
        )

    try:
        return asyncio.run(_run())
    except TimeoutError as e:
        logging.warning(
            "RAGAS 单条样本总耗时超过 %s 秒: %s",
            EVAL_RAGAS_SAMPLE_TOTAL_TIMEOUT_SEC,
            e,
        )
        return {
            **_empty_score_row(),
            "error": f"RAGAS 评分总超时（{EVAL_RAGAS_SAMPLE_TOTAL_TIMEOUT_SEC} 秒）",
        }
    except Exception as e:
        logging.exception("RAGAS 评估执行异常: %s", e)
        return {**_empty_score_row(), "error": str(e)}


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
                uid = kb_u.user_id  # type: ignore

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
            try:
                db.rollback()
            except Exception:
                pass
            task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
            if task:
                task.status = "failed"  # type: ignore
                task.error_message = e.detail  # type: ignore
                db.commit()
            return

    except IntegrityError:
        try:
            db.rollback()
        except Exception:
            pass
        if not _evaluation_task_still_present(db, task_id):
            logging.info(
                "评估任务 id=%s 已删除，外键约束失败已忽略，后台任务结束",
                task_id,
            )
            return
        raise
    except Exception as e:
        try:
            db.rollback()
        except Exception:
            pass
        task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
        if task:
            try:
                task.status = "failed"  # type: ignore
                task.error_message = str(e)  # type: ignore
                db.commit()
            except Exception:
                db.rollback()
        raise
    finally:
        db.close()


def _run_evaluation_body(
    db: Session,
    task_id: int,
    task: EvaluationTask,
    test_cases: List[EvaluationTestCase],
) -> None:
    """
    运行评估任务
    """
    if not _evaluation_task_still_present(db, task_id):
        logging.info("评估任务 id=%s 已删除，停止执行", task_id)
        return

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
    try:
        metrics_for_type = resolve_metrics(eval_type, raw_em)
    except ValueError as e:
        task.status = "failed"  # type: ignore
        task.error_message = str(e)  # type: ignore
        db.commit()
        return

    start_time = time.time()
    score_lists: Dict[str, List[float]] = {k: [] for k in SCORE_KEYS}

    judge_rt = merge_ai_runtime_for_judge(get_ai_runtime(), getattr(task, "judge_config", None))

    # 3. 对每个测试用例：检索 → 生成（按需）→ 评估 → 保存
    for tc in test_cases:
        if not _evaluation_task_still_present(db, task_id):
            logging.info("评估任务 id=%s 已删除，停止执行", task_id)
            return

        # 心跳：刷新任务行的 updated_at，便于检测僵死的「执行中」状态
        task = db.get(EvaluationTask, task_id)
        if task is None:
            logging.info("评估任务 id=%s 已删除，停止执行", task_id)
            return
        task.updated_at = datetime.now(BEIJING_TZ)  # type: ignore[assignment]
        db.add(task)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            if not _evaluation_task_still_present(db, task_id):
                logging.info("评估任务 id=%s 已删除，停止执行", task_id)
                return
            raise

        retrieved_contexts: List[str] = []
        generated_answer: Optional[str] = "" if not needs_generation else None
        try:
            # 3a. 检索
            if vector_store and needs_retrieval and task.knowledge_base_id is not None:
                retrieved_contexts = _retrieve(
                    tc.query, vector_store, top_k, db, task.knowledge_base_id
                )

            # 3b. 生成（retrieval 类型跳过）
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
                judge_runtime=judge_rt,
            )
        except TimeoutError as e:
            logging.warning("评估用例 id=%s 超时: %s", tc.id, e)
            scores = {**_empty_score_row(), "error": str(e)}
            if generated_answer is None:
                generated_answer = ""

        for k in SCORE_KEYS:
            v = scores.get(k)
            if v is not None:
                try:
                    score_lists[k].append(float(v))
                except (TypeError, ValueError):
                    pass

        if not _evaluation_task_still_present(db, task_id):
            logging.info("评估任务 id=%s 已删除，中止写入结果", task_id)
            return

        # 3d. 保存结果（仅持久化列上存在的指标；answer_correctness 等在 judge_details）
        def _mask_score(name: str) -> Optional[float]:
            return scores.get(name) if name in metrics_for_type else None

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
            ragas_score=None,
            passed=None,
            judge_details={
                k: v
                for k, v in scores.items()
                if k
                in set(metrics_for_type)
                | {"error", "skipped", "answer_correctness"}
            },
        )
        try:
            db.add(result)
            db.commit()
        except IntegrityError:
            db.rollback()
            if not _evaluation_task_still_present(db, task_id):
                logging.info(
                    "评估任务 id=%s 在评分完成后已删除，跳过本用例结果写入",
                    task_id,
                )
                return
            raise

    if not _evaluation_task_still_present(db, task_id):
        logging.info("评估任务 id=%s 已删除，跳过汇总", task_id)
        return

    # 4. 汇总统计
    duration = time.time() - start_time
    n = len(test_cases)

    base_summary: dict = {
        "total": n,
        "duration_seconds": round(duration, 2),
        "evaluation_type": eval_type,
        "metrics": metrics_for_type,
    }
    jc = getattr(task, "judge_config", None)
    if jc:
        base_summary["judge_config"] = jc
    if not _RAGAS_AVAILABLE:
        base_summary["warning"] = (
            "RAGAS 未安装，无法计算评分。请执行: pip install ragas datasets"
        )
    for k, label in AVG_SUMMARY_KEYS.items():
        vals = score_lists[k]
        if vals:
            base_summary[label] = round(sum(vals) / len(vals), 4)

    task = db.get(EvaluationTask, task_id)
    if task is None:
        logging.info("评估任务 id=%s 已删除，跳过汇总", task_id)
        return

    task.summary = base_summary  # type: ignore
    task.status = "completed"  # type: ignore
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        if not _evaluation_task_still_present(db, task_id):
            logging.info("评估任务 id=%s 已删除，跳过完成状态写入", task_id)
            return
        raise
