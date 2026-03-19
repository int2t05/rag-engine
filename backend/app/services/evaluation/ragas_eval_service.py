"""
RAGAS 评估服务（优化版）
=======================
基于 RAGAS 0.1.x API 的 RAG 评估实现。

评估指标：
  - 上下文相关性 (Context Relevance)
  - 答案忠实度 (Answer Faithfulness)
  - 答案相关性 (Answer Relevancy)
  - 上下文精确率 (Context Precision)
  - 上下文召回率 (Context Recall)

API 参考：https://docs.ragas.io/

依赖：
  pip install ragas langchain-openai
"""

import os
import json
import logging
import asyncio
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field, asdict
from datetime import datetime

# RAGAS 核心
from ragas import evaluate, EvaluationDataset
from ragas.metrics import (
    Faithfulness,
    AnswerRelevancy,
    ContextPrecision,
    ContextRecall,
    ContextRelevance,
)
from ragas.llms import LangchainLLMWrapper

# LangChain
from langchain_openai import ChatOpenAI
from langchain_core.documents import Document as LangchainDocument

from app.core.config import settings
from app.services.llm.llm_factory import LLMFactory
from app.services.embedding.embedding_factory import EmbeddingsFactory
from app.services.vector_store import VectorStoreFactory

logger = logging.getLogger(__name__)


# ============================================================
# 数据结构
# ============================================================

@dataclass
class EvaluationSample:
    """
    单个评估样本（符合 RAGAS 标准格式）

    RAGAS 字段映射：
      question     -> 用户问题
      answer       -> LLM 生成的回答
      contexts     -> 检索到的上下文列表
      ground_truth -> 参考答案（部分指标需要）
    """
    question: str
    answer: str
    contexts: List[str]
    ground_truth: str = ""

    def to_ragas_dict(self) -> Dict[str, Any]:
        return {
            "question": self.question,
            "answer": self.answer,
            "contexts": self.contexts,
            "ground_truth": self.ground_truth,
        }


@dataclass
class EvaluationResult:
    """单个样本的评估结果"""
    sample: EvaluationSample

    # 核心指标（RAGAS）
    context_relevance: Optional[float] = None   # 上下文相关性
    faithfulness: Optional[float] = None       # 答案忠实度
    answer_relevance: Optional[float] = None   # 答案相关性（RAGAS: AnswerRelevancy）
    context_precision: Optional[float] = None  # 上下文精确率
    context_recall: Optional[float] = None     # 上下文召回率

    # 综合分（三个核心指标的平均）
    ragas_score: Optional[float] = None

    # 每项指标的详细评判说明
    judge_notes: Dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "question": self.sample.question,
            "answer": self.sample.answer,
            "contexts": self.sample.contexts,
            "ground_truth": self.sample.ground_truth,
            "metrics": {
                "context_relevance": self.context_relevance,
                "faithfulness": self.faithfulness,
                "answer_relevance": self.answer_relevance,
                "context_precision": self.context_precision,
                "context_recall": self.context_recall,
                "ragas_score": self.ragas_score,
            },
            "judge_notes": self.judge_notes,
        }


@dataclass
class EvaluationReport:
    """评估报告（多样本汇总）"""
    results: List[EvaluationResult]
    started_at: datetime = field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None

    # 汇总统计
    total: int = 0
    passed: int = 0
    failed: int = 0
    pass_rate: float = 0.0
    duration_seconds: float = 0.0

    avg_context_relevance: float = 0.0
    avg_faithfulness: float = 0.0
    avg_answer_relevance: float = 0.0
    avg_context_precision: float = 0.0
    avg_context_recall: float = 0.0
    avg_ragas_score: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "summary": {
                "total": self.total,
                "passed": self.passed,
                "failed": self.failed,
                "pass_rate": round(self.pass_rate, 4),
                "duration_seconds": round(self.duration_seconds, 2),
                "avg_context_relevance": round(self.avg_context_relevance, 4),
                "avg_faithfulness": round(self.avg_faithfulness, 4),
                "avg_answer_relevance": round(self.avg_answer_relevance, 4),
                "avg_context_precision": round(self.avg_context_precision, 4),
                "avg_context_recall": round(self.avg_context_recall, 4),
                "avg_ragas_score": round(self.avg_ragas_score, 4),
            },
            "samples": [r.to_dict() for r in self.results],
        }


# ============================================================
# 核心评估引擎
# ============================================================

class RagasEvaluator:
    """
    基于 RAGAS 0.1.x 的评估器

    使用 LangchainLLMWrapper 封装 LLM，符合 RAGAS 官方推荐用法。
    """

    def __init__(
        self,
        llm=None,
        model_name: str = None,
        temperature: float = 0.0,
    ):
        """
        初始化评估器

        参数:
            llm: LangChain LLM 实例，默认使用 LLMFactory
            model_name: 评估用模型名，默认使用 settings.OPENAI_MODEL
            temperature: LLM 温度，默认 0.0 保证评估稳定性
        """
        # 评估用 LLM（temperature=0 保证一致性）
        if llm is None:
            llm = LLMFactory.create(temperature=temperature, streaming=False)

        self.model_name = model_name or settings.OPENAI_MODEL
        self.evaluator_llm = LangchainLLMWrapper(llm)

        # 初始化 RAGAS 指标（使用官方推荐的 LangchainLLMWrapper）
        self._init_metrics()

    def _init_metrics(self):
        """初始化 RAGAS 评估指标"""
        # 上下文相关性：检索到的上下文与问题的相关程度
        self.context_relevance = ContextRelevance(llm=self.evaluator_llm)

        # 答案忠实度：回答是否忠实于检索到的上下文
        self.faithfulness = Faithfulness(llm=self.evaluator_llm)

        # 答案相关性：回答与问题的相关程度
        self.answer_relevancy = AnswerRelevancy(llm=self.evaluator_llm)

        # 上下文精确率：相关上下文在检索结果中的排名
        self.context_precision = ContextPrecision(llm=self.evaluator_llm)

        # 上下文召回率：检索到的上下文覆盖参考答案的程度
        self.context_recall = ContextRecall(llm=self.evaluator_llm)

    async def evaluate_samples(
        self,
        samples: List[EvaluationSample],
        metrics: Optional[List[str]] = None,
    ) -> EvaluationReport:
        """
        对一批样本进行评估

        参数:
            samples: 评估样本列表
            metrics: 要评估的指标列表，默认 ["context_relevance", "faithfulness", "answer_relevance"]

        返回:
            EvaluationReport: 评估报告
        """
        if not samples:
            raise ValueError("samples cannot be empty")

        metrics = metrics or ["context_relevance", "faithfulness", "answer_relevance"]
        report = EvaluationReport(results=[], started_at=datetime.now())

        # 构建 RAGAS 数据集（使用标准字段名）
        data_dict = {
            "question": [s.question for s in samples],
            "answer": [s.answer for s in samples],
            "contexts": [s.contexts for s in samples],
            "ground_truth": [s.ground_truth for s in samples],
        }
        dataset = EvaluationDataset.from_dict(data_dict)

        # 选择要使用的指标
        metric_map = {
            "context_relevance": self.context_relevance,
            "faithfulness": self.faithfulness,
            "answer_relevance": self.answer_relevance,
            "context_precision": self.context_precision,
            "context_recall": self.context_recall,
        }

        selected_metrics = []
        for m in metrics:
            if m in metric_map:
                selected_metrics.append(metric_map[m])

        if not selected_metrics:
            raise ValueError(f"No valid metrics. Available: {list(metric_map.keys())}")

        logger.info(
            f"开始 RAGAS 评估: {len(samples)} 个样本, "
            f"指标={list(metric_map.keys())}"
        )

        # 执行 RAGAS 评估
        try:
            result = evaluate(dataset=dataset, metrics=selected_metrics)
        except Exception as e:
            logger.error(f"RAGAS evaluate() failed: {e}")
            raise RuntimeError(f"RAGAS evaluation failed: {e}") from e

        # 解析结果
        scores_df = result.to_pandas()

        # 解析每个样本的结果
        field_map = {
            "context_relevance": "context_relevance",
            "faithfulness": "faithfulness",
            "answer_relevancy": "answer_relevance",
            "context_precision": "context_precision",
            "context_recall": "context_recall",
        }

        for i, sample in enumerate(samples):
            eval_result = EvaluationResult(sample=sample)

            if i < len(scores_df):
                row = scores_df.iloc[i]

                eval_result.context_relevance = self._safe_float(
                    row.get("context_relevance")
                )
                eval_result.faithfulness = self._safe_float(
                    row.get("faithfulness")
                )
                eval_result.answer_relevance = self._safe_float(
                    row.get("answer_relevancy")
                )
                eval_result.context_precision = self._safe_float(
                    row.get("context_precision")
                )
                eval_result.context_recall = self._safe_float(
                    row.get("context_recall")
                )

            # 计算综合分
            valid_scores = [
                v for v in [
                    eval_result.context_relevance,
                    eval_result.faithfulness,
                    eval_result.answer_relevance,
                ] if v is not None
            ]
            if valid_scores:
                eval_result.ragas_score = round(
                    sum(valid_scores) / len(valid_scores), 4
                )

            # 生成评判说明
            eval_result.judge_notes = {
                "context_relevance": self._score_note(eval_result.context_relevance),
                "faithfulness": self._score_note(eval_result.faithfulness),
                "answer_relevance": self._score_note(eval_result.answer_relevance),
            }

            report.results.append(eval_result)

        # 计算汇总
        report.completed_at = datetime.now()
        report.duration_seconds = (
            report.completed_at - report.started_at
        ).total_seconds()
        self._compute_summary(report)

        logger.info(
            f"RAGAS 评估完成: {report.total} 样本, "
            f"avg_ragas_score={report.avg_ragas_score:.4f}, "
            f"pass_rate={report.pass_rate*100:.1f}%"
        )

        return report

    def _safe_float(self, value, default: float = None) -> Optional[float]:
        """安全转换为浮点数"""
        if value is None:
            return default
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    def _score_note(self, score: Optional[float]) -> str:
        """根据分数生成评判说明"""
        if score is None:
            return "N/A"
        if score >= 0.9:
            return "优秀"
        elif score >= 0.7:
            return "良好"
        elif score >= 0.5:
            return "一般"
        else:
            return "较差，需改进"

    def _compute_summary(self, report: EvaluationReport):
        """计算汇总统计"""
        n = len(report.results)
        report.total = n
        if n == 0:
            return

        def avg(key):
            vals = [getattr(r, key) for r in report.results if getattr(r, key) is not None]
            return sum(vals) / len(vals) if vals else 0.0

        report.avg_context_relevance = avg("context_relevance")
        report.avg_faithfulness = avg("faithfulness")
        report.avg_answer_relevance = avg("answer_relevance")
        report.avg_context_precision = avg("context_precision")
        report.avg_context_recall = avg("context_recall")
        report.avg_ragas_score = avg("ragas_score")

        # 通过标准：三个核心指标均 >= 0.6
        for r in report.results:
            cr = r.context_relevance or 0
            fa = r.faithfulness or 0
            ar = r.answer_relevance or 0
            if cr >= 0.6 and fa >= 0.6 and ar >= 0.6:
                report.passed += 1
            else:
                report.failed += 1

        report.pass_rate = report.passed / n if n > 0 else 0.0


# ============================================================
# 检索 + 生成（用于评估）
# ============================================================

class RetrievalForEvaluation:
    """
    评估专用检索封装
    """

    def __init__(self, kb_id: int, top_k: int = 5):
        self.kb_id = kb_id
        self.top_k = top_k
        self.embeddings = EmbeddingsFactory.create()
        self.vector_store = VectorStoreFactory.create(
            store_type=settings.VECTOR_STORE_TYPE,
            collection_name=f"kb_{kb_id}",
            embedding_function=self.embeddings,
        )

    def retrieve(self, query: str) -> List[str]:
        """检索相关文档片段"""
        docs_with_scores = self.vector_store.similarity_search_with_score(
            query, k=self.top_k
        )
        return [doc.page_content for doc, _ in docs_with_scores]


class AnswerGenerator:
    """
    评估专用回答生成器
    基于检索到的上下文生成回答
    """

    def __init__(self, llm=None):
        self.llm = llm or LLMFactory.create(temperature=0, streaming=False)

    async def generate(self, query: str, contexts: List[str]) -> str:
        """基于上下文生成回答"""
        from langchain_core.prompts import ChatPromptTemplate
        from langchain.chains.combine_documents import create_stuff_documents_chain

        context_text = "\n\n".join([
            f"[{i+1}] {ctx}" for i, ctx in enumerate(contexts)
        ])

        prompt = ChatPromptTemplate.from_messages([
            ("system",
             "You are a helpful assistant. Use ONLY the following context to answer the question. "
             "If the context does not contain enough information to answer the question, "
             "say 'I don't have enough information to answer this question.' "
             "Do NOT make up information that is not in the context.\n\n"
             "Context:\n{context}"),
            ("human", "{question}"),
        ])

        chain = create_stuff_documents_chain(
            self.llm, prompt, document_variable_name="context"
        )

        docs = [LangchainDocument(page_content=ctx) for ctx in contexts]
        response = await chain.ainvoke({"question": query, "context": docs})
        return response


# ============================================================
# 一站式评估流程
# ============================================================

class RAGEvaluator:
    """
    RAG 评估主流程
    给定知识库和问题，一站式完成：检索 → 生成 → RAGAS 评估
    """

    def __init__(self, kb_id: int, top_k: int = 5, llm=None):
        self.kb_id = kb_id
        self.top_k = top_k
        self.retriever = RetrievalForEvaluation(kb_id=kb_id, top_k=top_k)
        self.generator = AnswerGenerator(llm=llm)
        self.ragas_evaluator = RagasEvaluator(llm=llm)

    async def evaluate_queries(
        self,
        queries: List[str],
        references: Optional[List[str]] = None,
    ) -> EvaluationReport:
        """
        对多个问题进行评估

        参数:
            queries: 问题列表
            references: 参考答案列表（可选，与 queries 一一对应）

        返回:
            EvaluationReport: 评估报告
        """
        references = references or [""] * len(queries)
        samples: List[EvaluationSample] = []

        for query, reference in zip(queries, references):
            # 1. 检索
            contexts = self.retriever.retrieve(query)

            # 2. 生成
            answer = await self.generator.generate(query, contexts)

            # 3. 构建评估样本
            sample = EvaluationSample(
                question=query,
                answer=answer,
                contexts=contexts,
                ground_truth=reference,
            )
            samples.append(sample)

        # 4. RAGAS 评估
        report = await self.ragas_evaluator.evaluate_samples(samples)
        return report


# ============================================================
# 独立运行入口
# ============================================================

async def run_demo():
    """
    RAGAS 最小化演示（使用模拟数据，无需知识库）
    """
    from app.core.config import settings

    test_samples = [
        EvaluationSample(
            question="法国的首都是什么？",
            answer="法国的首都是巴黎。巴黎位于法国北部，是法国最大的城市。",
            contexts=[
                "法国是欧洲西部的一个国家。巴黎是法国的首都，位于法国北部。",
                "法国的人口约6700万，首都是巴黎。",
                "法国的官方语言是法语，首都是巴黎。",
            ],
            ground_truth="法国的首都是巴黎。",
        ),
        EvaluationSample(
            question="水的沸点是多少？",
            answer="在标准大气压下，水的沸点是100°C。",
            contexts=[
                "水在不同气压下的沸点不同。在标准大气压（1 atm）下，水的沸点是100°C（212°F）。",
                "海拔越高，大气压越低，水的沸点就越低。",
            ],
            ground_truth="标准大气压下水的沸点是100°C。",
        ),
        EvaluationSample(
            question="谁发明了相对论？",
            answer="阿尔伯特·爱因斯坦在1905年提出了狭义相对论，1915年提出了广义相对论。",
            contexts=[
                "阿尔伯特·爱因斯坦（1879-1955）是二十世纪最重要的物理学家之一。",
                "爱因斯坦在1905年提出了狭义相对论，在1915年提出了广义相对论。",
                "相对论分为狭义相对论和广义相对论，是现代物理学的基石之一。",
            ],
            ground_truth="爱因斯坦发明了相对论。",
        ),
        EvaluationSample(
            question="Python 是谁发明的？",
            answer="Python 是由 Guido van Rossum 在1991年发明的。",
            contexts=[
                "JavaScript 是由 Brendan Eich 在1995年发明的。",
                "Python 是由 Guido van Rossum 在1991年发明的。",
                "Guido van Rossum 是荷兰程序员，Python 以 Monty Python 命名。",
            ],
            ground_truth="Guido van Rossum 发明了 Python。",
        ),
        EvaluationSample(
            question="光速是多少？",
            answer="光在真空中的速度约为 299,792,458 米/秒，通常近似为 3×10^8 米/秒。",
            contexts=[
                "光速在真空中的速度约为 299,792,458 米/秒。",
                "光速通常近似为 3×10^8 米/秒。",
                "根据爱因斯坦的相对论，没有任何物体可以超过光速。",
            ],
            ground_truth="光速约 3×10^8 米/秒。",
        ),
    ]

    print("=" * 60)
    print("RAGAS RAG 评估演示（模拟数据）")
    print("=" * 60)
    print(f"模型: {settings.OPENAI_MODEL}")
    print(f"样本数: {len(test_samples)}\n")

    evaluator = RagasEvaluator()
    report = await evaluator.evaluate_samples(test_samples)

    summary = report.to_dict()["summary"]

    print(f"总样本数  : {summary['total']}")
    print(f"通过数    : {summary['passed']}")
    print(f"失败数    : {summary['failed']}")
    print(f"通过率    : {summary['pass_rate']*100:.1f}%")
    print(f"耗时      : {summary['duration_seconds']:.2f}s\n")
    print("平均指标得分:")
    print(f"  上下文相关性 : {summary['avg_context_relevance']:.4f}")
    print(f"  答案忠实度   : {summary['avg_faithfulness']:.4f}")
    print(f"  答案相关性   : {summary['avg_answer_relevance']:.4f}")
    print(f"  RAGAS 综合分 : {summary['avg_ragas_score']:.4f}")

    print("\n" + "-" * 60)
    print("各样本详细结果:")
    print("-" * 60)

    for i, r in enumerate(report.results):
        print(f"\n[样本 {i+1}] {r.sample.question}")
        print(f"  回答: {r.sample.answer[:50]}...")
        print(f"  上下文相关性 : {r.context_relevance} ({r.judge_notes['context_relevance']})")
        print(f"  答案忠实度   : {r.faithfulness} ({r.judge_notes['faithfulness']})")
        print(f"  答案相关性   : {r.answer_relevance} ({r.judge_notes['answer_relevance']})")

    print("\n" + "=" * 60)
    print("评估完成")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(run_demo())
