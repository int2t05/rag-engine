"""
评估任务执行服务
"""

import logging
import asyncio
from typing import List
from sqlalchemy.orm import Session

from app.models.evaluation import EvaluationTask, EvaluationTestCase, EvaluationResult
from app.services.evaluation.ragas_eval_service import (
    RagasEvaluator,
    RetrievalForEvaluation,
    AnswerGenerator,
    EvaluationSample,
)

logger = logging.getLogger(__name__)


def run_evaluation_task(task_id: int):
    """
    评估任务入口（供 BackgroundTasks 调用）
    """
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        _run_evaluation_sync(task_id, db)
    except Exception as e:
        logger.error(f"Evaluation task {task_id} failed: {e}")
        task = db.query(EvaluationTask).get(task_id)
        if task:
            task.status = "failed"
            task.error_message = str(e)
            db.commit()
    finally:
        db.close()


def _run_evaluation_sync(task_id: int, db: Session):
    """同步执行评估"""
    task = db.query(EvaluationTask).get(task_id)
    if not task:
        raise ValueError(f"Task {task_id} not found")

    task.status = "running"
    db.commit()

    try:
        test_cases = db.query(EvaluationTestCase).filter(
            EvaluationTestCase.task_id == task_id
        ).all()

        if not test_cases:
            task.status = "failed"
            task.error_message = "No test cases found"
            db.commit()
            return

        # 逐个执行：检索 → 生成 → RAGAS 评估
        results_list = []
        for tc in test_cases:
            result = _evaluate_single_test_case(
                query=tc.query,
                reference=tc.reference or "",
                kb_id=task.knowledge_base_id,
                top_k=task.top_k,
                task_id=task_id,
                test_case_id=tc.id,
                db=db,
            )
            results_list.append(result)

        # 汇总
        _compute_and_save_summary(task, results_list, db)

        task.status = "completed"
        db.commit()
        logger.info(f"Evaluation task {task_id} completed: {len(results_list)} samples")

    except Exception as e:
        logger.error(f"Evaluation task {task_id} error: {e}")
        task.status = "failed"
        task.error_message = str(e)
        db.commit()
        raise


def _evaluate_single_test_case(
    query: str,
    reference: str,
    kb_id: int,
    top_k: int,
    task_id: int,
    test_case_id: int,
    db: Session,
):
    """执行单个测试用例的完整评估流程"""
    # 1. 检索
    retriever = RetrievalForEvaluation(kb_id=kb_id, top_k=top_k)
    contexts = retriever.retrieve(query)

    # 2. 生成
    generator = AnswerGenerator()
    answer = asyncio.run(generator.generate(query, contexts))

    # 3. RAGAS 评估
    sample = EvaluationSample(
        question=query,
        answer=answer,
        contexts=contexts,
        ground_truth=reference,
    )

    evaluator = RagasEvaluator()
    report = asyncio.run(evaluator.evaluate_samples([sample]))
    result_obj = report.results[0]

    # 4. 保存结果
    passed = 1 if (
        (result_obj.context_relevance or 0) >= 0.6 and
        (result_obj.faithfulness or 0) >= 0.6 and
        (result_obj.answer_relevance or 0) >= 0.6
    ) else 0

    result = EvaluationResult(
        task_id=task_id,
        test_case_id=test_case_id,
        retrieved_contexts=contexts,
        generated_answer=answer,
        context_relevance=result_obj.context_relevance,
        faithfulness=result_obj.faithfulness,
        answer_relevance=result_obj.answer_relevance,
        ragas_score=result_obj.ragas_score,
        passed=passed,
        judge_details=result_obj.judge_notes,
    )
    db.add(result)
    db.commit()
    db.refresh(result)

    return result


def _compute_and_save_summary(task: EvaluationTask, results: List[EvaluationResult], db: Session):
    """计算并保存汇总结果"""
    n = len(results)
    if n == 0:
        return

    avg_cr = sum(r.context_relevance or 0 for r in results) / n
    avg_fa = sum(r.faithfulness or 0 for r in results) / n
    avg_ar = sum(r.answer_relevance or 0 for r in results) / n
    avg_rs = sum(r.ragas_score or 0 for r in results) / n
    passed = sum(1 for r in results if r.passed)

    task.summary = {
        "total": n,
        "passed": passed,
        "failed": n - passed,
        "pass_rate": round(passed / n, 4),
        "avg_context_relevance": round(avg_cr, 4),
        "avg_faithfulness": round(avg_fa, 4),
        "avg_answer_relevance": round(avg_ar, 4),
        "avg_ragas_score": round(avg_rs, 4),
    }
