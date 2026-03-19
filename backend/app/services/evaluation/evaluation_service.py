"""
RAG 评估执行服务
================
根据《RAG评估业务流程最佳实践》实现后台异步评估逻辑。

对每个测试用例执行：
1. 检索 - RetrievalForEvaluation：使用知识库向量存储检索 top_k 相关文档
2. 生成 - AnswerGenerator：基于上下文生成答案（仅依据上下文原则）
3. 评估 - RagasEvaluator：Context Relevance、Faithfulness、Answer Relevancy 等
4. 保存 - 写入 EvaluationResult，判定 passed 状态

通过标准：三个核心指标均 ≥ 0.6
"""

import time
from typing import List, Optional, Any

from sqlalchemy.orm import Session
from langchain_core.messages import HumanMessage

from app.db.session import SessionLocal
from app.core.config import settings
from app.models.evaluation import (
    EvaluationTask,
    EvaluationTestCase,
    EvaluationResult,
)
from app.models.knowledge import KnowledgeBase, Document

from app.services.vector_store import VectorStoreFactory
from app.services.embedding.embedding_factory import EmbeddingsFactory
from app.services.llm.llm_factory import LLMFactory
from app.services.evaluation.evaluation_config import (
    get_metrics_for_type,
    EVALUATION_TYPE_NEEDS_GENERATION,
    EVALUATION_TYPE_NEEDS_RETRIEVAL,
)

# RAGAS 相关
_RAGAS_AVAILABLE = False
try:
    from ragas import evaluate
    from ragas.metrics import (
        faithfulness,
        answer_relevancy,
        context_precision,
        context_recall,
    )
    from datasets import Dataset
    from ragas.llms import LangchainLLMWrapper

    _RAGAS_AVAILABLE = True
except ImportError:
    pass

# 通过阈值（文档定义）
PASS_THRESHOLD = 0.6


def _retrieve(
    query: str,
    vector_store: Any,
    top_k: int,
) -> List[str]:
    """检索阶段：对 query 进行向量检索，返回 top_k 个文档片段文本。"""
    docs = vector_store.similarity_search(query, k=top_k)
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
    llm: Any,
    embeddings: Any,
    metrics_to_use: Optional[List[str]] = None,
) -> dict:
    """
    使用 RAGAS 评估单个样本。
    metrics_to_use: 可选，指定要评估的指标。None 表示全量评估。
    RAGAS 需要 answer 列，retrieval 类型传空字符串时，生成类指标将为 None。
    """
    if not _RAGAS_AVAILABLE:
        return {
            "context_relevance": None,
            "faithfulness": None,
            "answer_relevance": None,
            "context_precision": None,
            "context_recall": None,
            "ragas_score": None,
        }

    if not metrics_to_use:
        metrics_to_use = [
            "context_relevance",
            "context_precision",
            "context_recall",
            "faithfulness",
            "answer_relevance",
        ]

    try:
        # 构建 RAGAS 数据集格式（HuggingFace Dataset）
        eval_data = {
            "question": [question],
            "contexts": [contexts],
            "answer": [answer],
            "ground_truth": [ground_truth or ""],
        }
        dataset = Dataset.from_dict(eval_data)

        ragas_llm = LangchainLLMWrapper(langchain_llm=llm)

        # 按需选择 RAGAS 指标（context_precision 依赖 answer，无答案时仅评估 context_recall）
        ragas_metrics = []
        if any(m in metrics_to_use for m in ("context_precision", "context_relevance")) and answer:
            ragas_metrics.append(context_precision)
        if "context_recall" in metrics_to_use:
            ragas_metrics.append(context_recall)
        if "faithfulness" in metrics_to_use:
            ragas_metrics.append(faithfulness)
        if "answer_relevance" in metrics_to_use:
            ragas_metrics.append(answer_relevancy)

        if not ragas_metrics:
            return {
                "context_relevance": None,
                "faithfulness": None,
                "answer_relevance": None,
                "context_precision": None,
                "context_recall": None,
                "ragas_score": None,
            }

        result = evaluate(
            dataset=dataset,
            metrics=ragas_metrics,
            llm=ragas_llm,
            embeddings=embeddings,
            show_progress=False,
        )

        # 提取分数（RAGAS 返回 dict 或具名结果对象）
        def _get_score(name: str) -> Optional[float]:
            val = getattr(result, name, None) if hasattr(result, name) else None
            if val is None and isinstance(result, dict):
                val = result.get(name)
            if val is None:
                return None
            if hasattr(val, "__iter__") and not isinstance(val, str):
                arr = list(val)
                return float(arr[0]) if arr else None
            try:
                return float(val)
            except (TypeError, ValueError):
                return None

        cp = _get_score("context_precision")
        cr = _get_score("context_recall")
        f = _get_score("faithfulness")
        ar = _get_score("answer_relevancy")

        # context_relevance 映射为 context_precision（文档中「上下文相关性」）
        context_relevance = cp
        ragas_score = None
        if f is not None and ar is not None and context_relevance is not None:
            ragas_score = (context_relevance + f + ar) / 3.0

        return {
            "context_relevance": context_relevance,
            "faithfulness": f,
            "answer_relevance": ar,
            "context_precision": cp,
            "context_recall": cr,
            "ragas_score": ragas_score,
        }
    except Exception as e:
        return {
            "context_relevance": None,
            "faithfulness": None,
            "answer_relevance": None,
            "context_precision": None,
            "context_recall": None,
            "ragas_score": None,
            "error": str(e),
        }


def _is_passed(scores: dict, eval_type: str = "full") -> int:
    """
    判定是否通过，按评估类型采用不同标准：
    - full: 三个核心指标均 ≥ 0.6
    - retrieval: 检索指标均 ≥ 0.6
    - generation: 生成指标均 ≥ 0.6
    """
    if eval_type == "retrieval":
        cr = scores.get("context_relevance") or scores.get("context_precision")
        cr_recall = scores.get("context_recall")
        vals = [cr, cr_recall]
        vals = [v for v in vals if v is not None]
        if not vals:
            return 0
        return 1 if all(v >= PASS_THRESHOLD for v in vals) else 0
    if eval_type == "generation":
        f = scores.get("faithfulness")
        ar = scores.get("answer_relevance")
        if f is None or ar is None:
            return 0
        return 1 if (f >= PASS_THRESHOLD and ar >= PASS_THRESHOLD) else 0
    # full
    cr = scores.get("context_relevance")
    f = scores.get("faithfulness")
    ar = scores.get("answer_relevance")
    if cr is None or f is None or ar is None:
        return 0
    return (
        1
        if (cr >= PASS_THRESHOLD and f >= PASS_THRESHOLD and ar >= PASS_THRESHOLD)
        else 0
    )


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

        task.status = "running"  # type: ignore
        db.commit()

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
                        store_type=settings.VECTOR_STORE_TYPE,
                        collection_name=f"kb_{task.knowledge_base_id}",
                        embedding_function=embeddings,
                    )

        # 用于生成的 LLM（非流式，temperature=0）
        llm = LLMFactory.create(temperature=0, streaming=False)

        # RAGAS 需要的 embeddings（若未安装 ragas，评估会跳过得分）
        embeddings = None
        if _RAGAS_AVAILABLE:
            embeddings = EmbeddingsFactory.create()

        top_k = task.top_k or 5
        eval_type = (task.evaluation_type or "full").lower()
        needs_retrieval = EVALUATION_TYPE_NEEDS_RETRIEVAL.get(eval_type, True)
        needs_generation = EVALUATION_TYPE_NEEDS_GENERATION.get(eval_type, True)
        metrics_for_type = get_metrics_for_type(eval_type)

        start_time = time.time()
        total_passed = 0
        scores_context = []
        scores_faith = []
        scores_answer = []
        scores_cp = []
        scores_cr = []

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
                llm=llm,
                embeddings=embeddings,
                metrics_to_use=metrics_for_type,
            )

            passed = _is_passed(scores, eval_type)
            total_passed += passed

            if scores.get("context_relevance") is not None:
                scores_context.append(scores["context_relevance"])
            if scores.get("context_precision") is not None:
                scores_cp.append(scores["context_precision"])
            if scores.get("context_recall") is not None:
                scores_cr.append(scores["context_recall"])
            if scores.get("faithfulness") is not None:
                scores_faith.append(scores["faithfulness"])
            if scores.get("answer_relevance") is not None:
                scores_answer.append(scores["answer_relevance"])

            # 3d. 保存结果（按类型只保留该类型的指标，其余置为 None）
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
                ragas_score=scores.get("ragas_score")
                if ("context_relevance" in metrics_for_type or "context_precision" in metrics_for_type)
                and "faithfulness" in metrics_for_type
                and "answer_relevance" in metrics_for_type
                else None,
                passed=passed,
                judge_details={k: v for k, v in scores.items() if k in metrics_for_type or k in ("ragas_score", "error")},
            )
            db.add(result)
            db.commit()

        # 4. 汇总统计，更新任务 summary 和 status（按评估类型返回对应指标）
        duration = time.time() - start_time
        n = len(test_cases)
        pass_rate = total_passed / n if n else 0
        avg_cr = sum(scores_context) / len(scores_context) if scores_context else None
        avg_f = sum(scores_faith) / len(scores_faith) if scores_faith else None
        avg_ar = sum(scores_answer) / len(scores_answer) if scores_answer else None
        avg_cp = sum(scores_cp) / len(scores_cp) if scores_cp else None
        avg_cr_val = sum(scores_cr) / len(scores_cr) if scores_cr else None

        base_summary: dict = {
            "total": n,
            "passed": total_passed,
            "failed": n - total_passed,
            "pass_rate": round(pass_rate, 4),
            "duration_seconds": round(duration, 2),
            "evaluation_type": eval_type,
        }
        if eval_type == "retrieval":
            base_summary["avg_context_relevance"] = round(avg_cr, 4) if avg_cr is not None else None
            base_summary["avg_context_precision"] = round(avg_cp, 4) if avg_cp is not None else None
            base_summary["avg_context_recall"] = round(avg_cr_val, 4) if avg_cr_val is not None else None
        elif eval_type == "generation":
            base_summary["avg_faithfulness"] = round(avg_f, 4) if avg_f is not None else None
            base_summary["avg_answer_relevance"] = round(avg_ar, 4) if avg_ar is not None else None
        else:
            base_summary["avg_context_relevance"] = round(avg_cr, 4) if avg_cr is not None else None
            base_summary["avg_faithfulness"] = round(avg_f, 4) if avg_f is not None else None
            base_summary["avg_answer_relevance"] = round(avg_ar, 4) if avg_ar is not None else None
            base_summary["avg_context_precision"] = round(avg_cp, 4) if avg_cp is not None else None
            base_summary["avg_context_recall"] = round(avg_cr_val, 4) if avg_cr_val is not None else None

        task.summary = base_summary  # type: ignore
        task.status = "completed"  # type: ignore
        db.commit()

    except Exception as e:
        task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
        if task:
            task.status = "failed"  # type: ignore
            task.error_message = str(e)  # type: ignore
            db.commit()
        raise
    finally:
        db.close()
