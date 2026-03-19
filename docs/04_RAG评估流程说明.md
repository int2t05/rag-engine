# RAG 评估流程说明

## 概述

RAG 评估用于量化评估系统检索质量（Retrieval）和生成质量（Generation），帮助发现知识库构建质量、检索策略、提示词等方面的不足。

本系统基于 **RAGAS**（RAG Assessment）框架实现，覆盖质量指标和能力指标两大体系。

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              RAG 评估体系                                                │
│                                                                                         │
│  ┌─────────────────────────────┐    ┌─────────────────────────────┐                    │
│  │  质量指标（Quality Metrics） │    │  能力指标（Capability Metrics）│                    │
│  │                             │    │                             │                    │
│  │  • 上下文相关性              │    │  • 对噪声的鲁棒性             │                    │
│  │  • 答案忠实度（Faithfulness）│    │  • 负面信息排除能力           │                    │
│  │  • 答案相关性               │    │  • 信息整合能力               │                    │
│  └─────────────────────────────┘    └─────────────────────────────┘                    │
│                                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │  评估工具：RAGAS (RAG Assessment) - 行业标杆开源 RAG 评估框架                       │   │
│  │  支持：LLM-as-Judge / 无需人工标注 / LangChain 无缝集成 / 持续迭代优化               │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 评估指标体系

### 质量指标

质量指标是衡量 RAG 系统基础能力的核心，覆盖「检索-生成-最终效果」全链路，是评估的必选指标。

#### 上下文相关性（Context Relevance）

- **核心定义**：衡量检索环节召回的上下文片段，与用户问题的匹配程度，核心判断标准是「召回的内容是否包含回答用户问题所需的有效信息」。
- **核心作用**：直接反映检索环节的精准度，是 RAG 系统效果的基础——若召回内容与问题无关，后续生成环节再优化也无法避免幻觉与答非所问。
- **异常根因**：指标偏低通常对应分块策略不合理、嵌入模型适配性差、检索策略单一、查询优化不足等检索环节问题。

#### 答案忠实度（Answer Faithfulness）

- **核心定义**：也叫事实一致性，衡量生成的答案与召回上下文的忠实程度，核心判断标准是「答案中的所有事实信息，是否都能在召回的上下文中找到明确依据，无编造、篡改、过度引申、无中生有的内容」。
- **核心作用**：是 RAG 系统防控幻觉的核心指标，直接决定回答的可靠性与安全性。
- **异常根因**：指标偏低通常对应 Prompt 约束不足、模型对齐能力弱、召回内容噪声过多、缺少事实校验环节等生成环节问题。

#### 答案相关性（Answer Relevance）

- **核心定义**：衡量生成的最终答案与用户原始问题的匹配程度，核心判断标准是「答案是否准确、完整、清晰地回应用户的核心需求，无答非所问，信息遗漏、过度冗余、过于笼统/细节的问题」。
- **核心作用**：是 RAG 系统最终效果的直接体现，决定用户的使用体验。
- **异常根因**：指标偏低通常对应 Prompt 输出约束不足、模型对用户需求的理解能力弱、信息整合能力不足等问题。

### 能力指标

能力指标用于衡量 RAG 系统在非理想、复杂业务场景下的综合表现，是评估系统生产级可用性的核心标准。

#### 对噪声的鲁棒性

- **核心定义**：当召回的上下文中混入与问题无关的冗余内容、干扰信息时，RAG 系统依然能精准提取有效信息、生成准确答案的抗干扰能力。
- **核心作用**：验证系统在混合检索、多路召回等真实生产场景下的稳定性，避免因少量噪声内容导致回答偏离核心需求。
- **评估方式**：在召回上下文中加入与问题无关的干扰片段，对比加入前后答案忠实度、相关性的衰减幅度。

#### 负面信息的排除能力

- **核心定义**：也叫拒答能力/反事实鲁棒性，指当用户问题在知识库中无相关信息、问题本身存在错误/误导性、或涉及知识库外的内容时，系统能否正确执行兜底拒答，而非编造虚假答案的能力。
- **核心作用**：是防控幻觉的关键补充指标，避免系统在无有效信息时"强行回答"导致的虚假内容。
- **评估方式**：用知识库外的无答案问题、反事实误导性问题进行测试，统计系统正确拒答的占比。

#### 信息整合能力

- **核心定义**：当回答用户问题所需的核心信息，分散在多个不同的上下文片段、不同文档、不同章节中时，系统能否将碎片化的信息完整提取、逻辑整合，形成连贯、完整、准确的答案的能力。
- **核心作用**：衡量系统处理复杂多文档问答、长文本推理的能力，适配企业级知识库、多文档汇总等真实场景。
- **评估方式**：用需要结合多个不连续片段内容才能完整回答的问题进行测试，统计答案的信息完整度、逻辑连贯性。

### 评估工具对比

| 工具 | 核心定位 | 特点 |
|------|----------|------|
| **RAGAS** | RAG 评估行业标杆 | 全链路客观指标 + LLM 智能评估 + 自动测试集生成 + LangChain 集成 |
| **TruLens** | 全栈可观测 RAG 框架 | RAG Triad 体系 + 全链路跟踪 + 多版本对比 + 可视化仪表盘 |
| **ARES** | 远程 RAG 评估 | 远程访问接口（当前仓库版本无 RAG 评估能力）|

---

## 评估流程图

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           前端                                                   │
│                                                                                                  │
│  1. 创建评估任务                                                                        │
│     POST /api/evaluation                             // 指定知识库或对话                           │
│                                                                                                  │
│  2. 选择评估类型                                                                        │
│     retrieval  |  generation  |  full                                                 │
│                                                                                                  │
│  3. 传入测试集或自动生成                                                                │
│     {queries: [{q: "...", ground_truth: ["doc1", "doc2"]}]}                               │
│                                                                                                  │
│  4. 获取评估结果                                                                        │
│     GET /api/evaluation/{task_id}/results                                                         │
│                                                                                                  │
│  5. 对比历史评估                                                                         │
│     GET /api/evaluation?kb_id=1&compare=true                                                   │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                    │
                                                    ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     FastAPI Evaluation API                                       │
│                                                                                                  │
│  POST /api/evaluation                           // 创建评估任务                                  │
│  GET  /api/evaluation                           // 列表（支持分页/过滤）                           │
│  GET  /api/evaluation/{task_id}                  // 单个任务详情                                  │
│  POST /api/evaluation/{task_id}/run              // 触发执行（后台）                               │
│  GET  /api/evaluation/{task_id}/results          // 获取评估结果                                   │
│  DELETE /api/evaluation/{task_id}                // 删除任务                                      │
│                                                                                                  │
│  POST /api/evaluation/{task_id}/test-set        // 手动添加测试用例                              │
│  POST /api/evaluation/{task_id}/test-set/generate // LLM 自动生成测试集                            │
│                                                                                                  │
│  GET  /api/evaluation/compare                    // 对比多个任务结果                               │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                    │
                                    ┌───────────────┴───────────────┐
                                    ▼                               ▼
                    ┌──────────────────────────┐    ┌──────────────────────────┐
                    │   检索评估器               │    │   生成评估器               │
                    │   RetrievalEvaluator      │    │   GenerationEvaluator    │
                    │                          │    │                          │
                    │ similarity_search_with_   │    │ LLM-as-Judge 评判         │
                    │ score(query, k)           │    │ Faithfulness / Relevance │
                    │ 计算 P@K / R@K / MRR /    │    │                          │
                    │ NDCG@K                    │    │ 调用同一 LLM Factory       │
                    └──────────────────────────┘    └──────────────────────────┘
                                    │                               │
                                    └───────────────┬───────────────┘
                                                    ▼
                                    ┌──────────────────────────┐
                                    │   评估报告生成            │
                                    │                          │
                                    │  • 汇总统计               │
                                    │  • 各维度分项得分          │
                                    │  • 与历史对比              │
                                    │  • 改进建议                │
                                    └──────────────────────────┘
```

---

## 核心模块设计

### 1. 核心代码文件

```
backend/app/
├── models/evaluation.py                           # 数据库模型（3张表）
├── api/api_v1/evaluation.py                       # FastAPI 端点
└── services/evaluation/
    ├── ragas_eval_service.py                      # RAGAS 评估核心引擎
    ├── evaluation_service.py                      # 评估任务执行服务
    └── run_evaluation.py                          # 独立运行脚本（可无 API 运行）
```

### 2. 数据模型

```python
# backend/app/models/evaluation.py

from sqlalchemy import Column, Integer, String, ForeignKey, Text, DateTime, JSON, Float, Enum
from sqlalchemy.orm import relationship
from app.models.base import Base, TimestampMixin, BEIJING_TZ
import enum

class EvaluationType(str, enum.Enum):
    RETRIEVAL = "retrieval"          # 仅检索评估
    GENERATION = "generation"        # 仅生成评估
    FULL = "full"                    # 完整 RAG 评估

class EvaluationStatus(str, enum.Enum):
    PENDING = "pending"              # 等待执行
    RUNNING = "running"              # 执行中
    COMPLETED = "completed"          # 已完成
    FAILED = "failed"               # 失败

class EvaluationTask(Base, TimestampMixin):
    """
    评估任务
    一次评估任务包含多个测试用例，可针对一个知识库或一个对话进行评估
    """
    __tablename__ = "evaluation_tasks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)                        # 任务名称
    description = Column(Text)                                        # 任务描述
    evaluation_type = Column(String(20), nullable=False)               # retrieval / generation / full

    # 评估范围：关联知识库或对话
    knowledge_base_id = Column(Integer, ForeignKey("knowledge_bases.id"), nullable=True)
    chat_id = Column(Integer, ForeignKey("chats.id"), nullable=True)

    # 评估配置
    retrieval_top_k = Column(Integer, default=5)                     # 检索 K 值
    chunk_size = Column(Integer, default=1000)                        # 分块大小（用于评估时重新分块）
    chunk_overlap = Column(Integer, default=200)                      # 分块重叠

    # 状态
    status = Column(String(20), default=EvaluationStatus.PENDING)
    error_message = Column(Text, nullable=True)

    # 汇总结果（评估完成后写入）
    summary = Column(JSON, nullable=True)  # {
                                           #   "retrieval": {"precision_at_k": {...}, "mrr": ..., "ndcg_at_k": ...},
                                           #   "generation": {"faithfulness": ..., "answer_relevance": ..., "context_relevance": ...},
                                           #   "rag": {"ragas_f1": ..., "noise_score": ...}
                                           # }

    created_by = Column(Integer, ForeignKey("users.id"))
    user = relationship("User")

    # 关联测试用例
    test_cases = relationship("EvaluationTestCase", back_populates="task",
                              cascade="all, delete-orphan")

    # 关联评估结果
    results = relationship("EvaluationResult", back_populates="task",
                           cascade="all, delete-orphan")


class EvaluationTestCase(Base, TimestampMixin):
    """
    评估测试用例
    每个测试用例 = 一个问题 + 期望的参考答案/相关文档
    """
    __tablename__ = "evaluation_test_cases"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("evaluation_tasks.id"), nullable=False)

    # 输入
    query = Column(Text, nullable=False)                              # 测试问题

    # 期望输出（人工标注或自动生成）
    ground_truth_docs = Column(JSON, nullable=True)                   # ["doc1 content", "doc2 content"]
    ground_truth_answer = Column(Text, nullable=True)                 # 期望的完整回答

    # 自动生成的辅助信息
    auto_generated = Column(Integer, default=0)                       # 是否为 LLM 自动生成
    generation_prompt = Column(Text, nullable=True)                    # 生成时使用的 prompt

    task = relationship("EvaluationTask", back_populates="test_cases")
    results = relationship("EvaluationResult", back_populates="test_case")


class EvaluationResult(Base, TimestampMixin):
    """
    单个测试用例的评估结果
    """
    __tablename__ = "evaluation_results"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("evaluation_tasks.id"), nullable=False)
    test_case_id = Column(Integer, ForeignKey("evaluation_test_cases.id"), nullable=False)

    # 检索结果
    retrieved_docs = Column(JSON, nullable=True)   # [{"content": "...", "score": 0.95}, ...]
    retrieval_metrics = Column(JSON, nullable=True) # {"precision_at_5": 0.8, "recall_at_5": 0.6, "mrr": 0.5, "ndcg_at_5": 0.75}

    # 生成结果
    generated_answer = Column(Text, nullable=True)
    generation_metrics = Column(JSON, nullable=True)  # {"faithfulness": 0.9, "answer_relevance": 0.85, "context_relevance": 0.8}

    # 综合结果
    rag_metrics = Column(JSON, nullable=True)  # {"ragas_f1": 0.82, "noise_score": 0.1}

    # LLM 评判详情（用于调试）
    llm_judge_output = Column(Text, nullable=True)

    task = relationship("EvaluationTask", back_populates="results")
    test_case = relationship("EvaluationTestCase", back_populates="results")
```

---

### 2. 检索评估器

```python
# backend/app/services/evaluation/retrieval_evaluator.py

from typing import List, Dict, Any, Tuple
from langchain_core.documents import Document
from app.services.vector_store import VectorStoreFactory
from app.services.embedding.embedding_factory import EmbeddingsFactory
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)


class RetrievalEvaluator:
    """
    检索评估器
    计算 Precision@K, Recall@K, MRR, NDCG@K
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

    def evaluate(self, query: str, ground_truth_docs: List[str]) -> Dict[str, Any]:
        """
        评估单个查询的检索质量

        参数:
            query: 测试问题
            ground_truth_docs: 人工标注的相关文档内容列表

        返回:
            {
                "retrieved_docs": [{"content": "...", "score": 0.95}, ...],
                "metrics": {
                    "precision_at_k": 0.8,
                    "recall_at_k": 0.6,
                    "mrr": 0.5,
                    "ndcg_at_k": 0.75,
                }
            }
        """
        # 1. 执行相似度检索
        retrieved_docs_with_scores = self.vector_store.similarity_search_with_score(
            query, k=self.top_k
        )

        retrieved_docs = [
            {"content": doc.page_content, "score": float(score)}
            for doc, score in retrieved_docs_with_scores
        ]

        # 2. 计算检索指标
        metrics = self._calculate_metrics(retrieved_docs, ground_truth_docs)

        return {
            "retrieved_docs": retrieved_docs,
            "metrics": metrics,
        }

    def _calculate_metrics(
        self,
        retrieved_docs: List[Dict],
        ground_truth_docs: List[str],
    ) -> Dict[str, float]:
        """计算各项检索指标"""

        # 判断检索结果是否与 ground truth 相似（模糊匹配）
        def is_relevant(retrieved: str, truth_list: List[str], threshold: float = 0.7) -> bool:
            """简单关键词重叠 + 长度比例判断是否相关"""
            retrieved_lower = retrieved.lower()
            for truth in truth_list:
                truth_lower = truth.lower()
                # 计算重叠词比例
                retrieved_words = set(retrieved_lower.split())
                truth_words = set(truth_lower.split())
                if not truth_words:
                    continue
                overlap = len(retrieved_words & truth_words) / len(truth_words)
                if overlap >= threshold:
                    return True
                # 长度比例检查
                if min(len(retrieved), len(truth)) / max(len(retrieved), len(truth)) > 0.6:
                    if any(word in retrieved_lower for word in truth_lower.split()[:5]):
                        return True
            return False

        # 计算 relevant 数量
        relevant_count = sum(
            1 for doc in retrieved_docs
            if is_relevant(doc["content"], ground_truth_docs)
        )

        k = len(retrieved_docs)
        truth_count = len(ground_truth_docs)

        # Precision@K
        precision_at_k = relevant_count / k if k > 0 else 0.0

        # Recall@K
        recall_at_k = relevant_count / truth_count if truth_count > 0 else 0.0

        # MRR (Mean Reciprocal Rank)
        mrr = 0.0
        for i, doc in enumerate(retrieved_docs):
            if is_relevant(doc["content"], ground_truth_docs):
                mrr = 1.0 / (i + 1)
                break

        # NDCG@K
        ndcg_at_k = self._calculate_ndcg(retrieved_docs, ground_truth_docs, k)

        return {
            "precision_at_k": round(precision_at_k, 4),
            "recall_at_k": round(recall_at_k, 4),
            "mrr": round(mrr, 4),
            "ndcg_at_k": round(ndcg_at_k, 4),
            "relevant_count": relevant_count,
            "total_retrieved": k,
            "total_ground_truth": truth_count,
        }

    def _calculate_ndcg(
        self,
        retrieved_docs: List[Dict],
        ground_truth_docs: List[str],
        k: int,
    ) -> float:
        """计算 NDCG@K"""
        def is_relevant(retrieved: str, truth_list: List[str]) -> bool:
            retrieved_lower = retrieved.lower()
            for truth in truth_list:
                truth_lower = truth.lower()
                retrieved_words = set(retrieved_lower.split())
                truth_words = set(truth_lower.split())
                if not truth_words:
                    continue
                overlap = len(retrieved_words & truth_words) / len(truth_words)
                if overlap >= 0.7:
                    return True
            return False

        # DCG@K
        dcg = 0.0
        for i, doc in enumerate(retrieved_docs[:k]):
            rel = 1.0 if is_relevant(doc["content"], ground_truth_docs) else 0.0
            dcg += rel / (i + 1)  # 按排名位置折扣

        # IDCG@K（理想情况：所有相关文档排在最前）
        ideal_relevant = min(len(ground_truth_docs), k)
        idcg = sum(1.0 / (i + 1) for i in range(ideal_relevant))

        return dcg / idcg if idcg > 0 else 0.0
```

---

### 3. 生成评估器（LLM-as-Judge）

```python
# backend/app/services/evaluation/generation_evaluator.py

from typing import List, Dict, Any
from langchain_core.language_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate
from app.services.llm.llm_factory import LLMFactory
import logging

logger = logging.getLogger(__name__)


class GenerationEvaluator:
    """
    生成评估器（LLM-as-Judge）
    评估 Faithfulness、Answer Relevance、Context Relevance
    """

    # LLM 评判提示词
    FAITHFULNESS_PROMPT = ChatPromptTemplate.from_messages([
        ("system",
         "You are an expert evaluator assessing whether an AI-generated answer is faithful "
         "to the given context. An answer is faithful if it only contains information "
         "that can be derived from the context (no hallucinations, no contradictions).\n\n"
         "Context:\n{context}\n\n"
         "Answer:\n{answer}\n\n"
         "Respond with a JSON object: {{\"score\": <0.0-1.0>, \"reason\": \"<brief explanation>\"}}"
         "\nScore: 1.0 means completely faithful, 0.0 means completely unfaithful."),
        ("human", "Evaluate the faithfulness of this answer."),
    ])

    ANSWER_RELEVANCE_PROMPT = ChatPromptTemplate.from_messages([
        ("system",
         "You are an expert evaluator assessing whether an AI-generated answer is relevant "
         "to the user's question. A relevant answer directly addresses the question's intent.\n\n"
         "Question:\n{question}\n\n"
         "Answer:\n{answer}\n\n"
         "Respond with a JSON object: {{\"score\": <0.0-1.0>, \"reason\": \"<brief explanation>\"}}"
         "\nScore: 1.0 means highly relevant, 0.0 means completely irrelevant."),
        ("human", "Evaluate the answer relevance to the question."),
    ])

    CONTEXT_RELEVANCE_PROMPT = ChatPromptTemplate.from_messages([
        ("system",
         "You are an expert evaluator assessing whether the retrieved context is relevant "
         "to the user's question. Relevant context provides useful information to answer it.\n\n"
         "Question:\n{question}\n\n"
         "Context:\n{context}\n\n"
         "Respond with a JSON object: {{\"score\": <0.0-1.0>, \"reason\": \"<brief explanation>\"}}"
         "\nScore: 1.0 means highly relevant, 0.0 means completely irrelevant."),
        ("human", "Evaluate the context relevance to the question."),
    ])

    def __init__(self, llm: BaseChatModel = None):
        self.llm = llm or LLMFactory.create(temperature=0)

    async def evaluate(
        self,
        question: str,
        answer: str,
        context_docs: List[Dict[str, Any]],
        ground_truth_answer: str = None,
    ) -> Dict[str, Any]:
        """
        评估生成质量

        参数:
            question: 用户问题
            answer: LLM 生成的回答
            context_docs: [{"content": "...", "metadata": {...}}, ...]
            ground_truth_answer: 期望的参考答案（可选，用于对比）

        返回:
            {
                "faithfulness": 0.9,
                "answer_relevance": 0.85,
                "context_relevance": 0.8,
                "ragas_f1": 0.82,
                "noise_score": 0.1,
                "llm_judge_output": {...},
            }
        """
        import json

        context_text = "\n---\n".join([
            f"[{i+1}] {doc['content']}" for i, doc in enumerate(context_docs)
        ])

        results = {}

        # 1. Faithfulness
        try:
            faithfulness_response = await self.llm.ainvoke(
                self.FAITHFULNESS_PROMPT.format(context=context_text, answer=answer)
            )
            faithfulness_data = json.loads(faithfulness_response.content)
            results["faithfulness"] = faithfulness_data["score"]
            results["faithfulness_reason"] = faithfulness_data["reason"]
        except Exception as e:
            logger.warning(f"Faithfulness evaluation failed: {e}")
            results["faithfulness"] = None

        # 2. Answer Relevance
        try:
            relevance_response = await self.llm.ainvoke(
                self.ANSWER_RELEVANCE_PROMPT.format(question=question, answer=answer)
            )
            relevance_data = json.loads(relevance_response.content)
            results["answer_relevance"] = relevance_data["score"]
            results["answer_relevance_reason"] = relevance_data["reason"]
        except Exception as e:
            logger.warning(f"Answer relevance evaluation failed: {e}")
            results["answer_relevance"] = None

        # 3. Context Relevance
        try:
            ctx_response = await self.llm.ainvoke(
                self.CONTEXT_RELEVANCE_PROMPT.format(question=question, context=context_text)
            )
            ctx_data = json.loads(ctx_response.content)
            results["context_relevance"] = ctx_data["score"]
            results["context_relevance_reason"] = ctx_data["reason"]
        except Exception as e:
            logger.warning(f"Context relevance evaluation failed: {e}")
            results["context_relevance"] = None

        # 4. RAGAS-style 综合指标
        valid_scores = [v for v in [
            results.get("faithfulness"),
            results.get("answer_relevance"),
            results.get("context_relevance"),
        ] if v is not None]

        if valid_scores:
            # RAGAS F1 = 调和平均
            results["ragas_f1"] = round(
                len(valid_scores) / sum(1.0 / s for s in valid_scores), 4
            )
        else:
            results["ragas_f1"] = None

        # 5. Noise Score = 回答中未引用上下文的部分估算
        results["noise_score"] = self._estimate_noise_score(answer, context_text)

        return results

    def _estimate_noise_score(self, answer: str, context: str) -> float:
        """
        估算回答中的噪声比例（混入的非上下文信息）
        简化版本：基于回答长度和上下文重叠度估算
        """
        if not answer or not context:
            return 0.5

        answer_words = set(answer.lower().split())
        context_words = set(context.lower().split())

        if not answer_words:
            return 0.0

        # 计算上下文覆盖度
        overlap_ratio = len(answer_words & context_words) / len(answer_words)
        # 噪声分 = 未覆盖部分
        noise_score = round(1.0 - overlap_ratio, 4)
        return max(0.0, min(1.0, noise_score))
```

---

### 4. 评估服务（主流程）

```python
# backend/app/services/evaluation/evaluation_service.py

import json
import logging
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from datetime import datetime

from app.models.evaluation import (
    EvaluationTask, EvaluationTestCase, EvaluationResult,
    EvaluationType, EvaluationStatus
)
from app.models.knowledge import KnowledgeBase, Document
from app.models.chat import Chat
from app.services.vector_store import VectorStoreFactory
from app.services.embedding.embedding_factory import EmbeddingsFactory
from app.services.llm.llm_factory import LLMFactory
from app.core.config import settings
from langchain_core.documents import Document as LangchainDocument

from .retrieval_evaluator import RetrievalEvaluator
from .generation_evaluator import GenerationEvaluator

logger = logging.getLogger(__name__)


class EvaluationService:
    """
    评估服务：协调检索评估和生成评估的完整流程
    """

    def __init__(self, db: Session):
        self.db = db

    async def run_evaluation_task(self, task_id: int) -> Dict[str, Any]:
        """
        执行评估任务

        流程:
        1. 加载评估任务和测试用例
        2. 初始化评估器
        3. 对每个测试用例执行评估
        4. 汇总结果并写入数据库
        """
        task = self.db.query(EvaluationTask).get(task_id)
        if not task:
            raise ValueError(f"Task {task_id} not found")

        task.status = EvaluationStatus.RUNNING
        self.db.commit()

        try:
            # 确定评估范围
            if task.evaluation_type in (EvaluationType.RETRIEVAL, EvaluationType.FULL):
                if not task.knowledge_base_id:
                    raise ValueError("Retrieval evaluation requires knowledge_base_id")
                retrieval_evaluator = RetrievalEvaluator(
                    kb_id=task.knowledge_base_id,
                    top_k=task.retrieval_top_k,
                )
            else:
                retrieval_evaluator = None

            if task.evaluation_type in (EvaluationType.GENERATION, EvaluationType.FULL):
                generation_evaluator = GenerationEvaluator()
                llm = LLMFactory.create(temperature=0, streaming=False)
            else:
                generation_evaluator = None

            # 加载知识库的文档用于生成评估
            if generation_evaluator and task.knowledge_base_id:
                kb_docs = self._load_kb_documents(task.knowledge_base_id)
            else:
                kb_docs = []

            all_results = []
            retrieval_metrics_list = []
            generation_metrics_list = []
            rag_metrics_list = []

            for test_case in task.test_cases:
                result = await self._evaluate_single_case(
                    test_case=test_case,
                    retrieval_evaluator=retrieval_evaluator,
                    generation_evaluator=generation_evaluator,
                    llm=llm,
                    kb_docs=kb_docs,
                )
                all_results.append(result)

                if result.get("retrieval_metrics"):
                    retrieval_metrics_list.append(result["retrieval_metrics"])
                if result.get("generation_metrics"):
                    generation_metrics_list.append(result["generation_metrics"])
                if result.get("rag_metrics"):
                    rag_metrics_list.append(result["rag_metrics"])

            # 计算汇总统计
            summary = self._compute_summary(
                retrieval_metrics_list,
                generation_metrics_list,
                rag_metrics_list,
            )

            # 写入结果
            task.summary = summary
            task.status = EvaluationStatus.COMPLETED
            self.db.commit()

            return {"task_id": task_id, "status": "completed", "summary": summary}

        except Exception as e:
            logger.error(f"Evaluation task {task_id} failed: {e}")
            task.status = EvaluationStatus.FAILED
            task.error_message = str(e)
            self.db.commit()
            raise

    async def _evaluate_single_case(
        self,
        test_case: EvaluationTestCase,
        retrieval_evaluator,
        generation_evaluator,
        llm,
        kb_docs: List,
    ) -> Dict[str, Any]:
        """对单个测试用例执行评估"""

        result_record = EvaluationResult(
            task_id=test_case.task_id,
            test_case_id=test_case.id,
        )
        self.db.add(result_record)

        eval_result = {}

        # 检索评估
        if retrieval_evaluator:
            retrieval_result = retrieval_evaluator.evaluate(
                query=test_case.query,
                ground_truth_docs=test_case.ground_truth_docs or [],
            )
            eval_result["retrieved_docs"] = retrieval_result["retrieved_docs"]
            eval_result["retrieval_metrics"] = retrieval_result["metrics"]
            result_record.retrieved_docs = retrieval_result["retrieved_docs"]
            result_record.retrieval_metrics = retrieval_result["metrics"]
        else:
            eval_result["retrieved_docs"] = []
            eval_result["retrieval_metrics"] = {}

        # 生成评估
        if generation_evaluator and eval_result.get("retrieved_docs"):
            context_docs = [
                {"content": doc["content"], "metadata": {}}
                for doc in eval_result["retrieved_docs"]
            ]

            # 构建 QA 链生成回答
            generated_answer = await self._generate_answer(
                question=test_case.query,
                context_docs=context_docs,
                llm=llm,
            )

            generation_result = await generation_evaluator.evaluate(
                question=test_case.query,
                answer=generated_answer,
                context_docs=context_docs,
                ground_truth_answer=test_case.ground_truth_answer,
            )

            eval_result["generated_answer"] = generated_answer
            eval_result["generation_metrics"] = {
                k: v for k, v in generation_result.items()
                if k in ("faithfulness", "answer_relevance", "context_relevance", "ragas_f1", "noise_score")
            }
            eval_result["rag_metrics"] = {
                "ragas_f1": generation_result.get("ragas_f1"),
                "noise_score": generation_result.get("noise_score"),
            }

            result_record.generated_answer = generated_answer
            result_record.generation_metrics = eval_result["generation_metrics"]
            result_record.rag_metrics = eval_result["rag_metrics"]
            result_record.llm_judge_output = json.dumps(generation_result, ensure_ascii=False)

        self.db.commit()
        return eval_result

    async def _generate_answer(
        self,
        question: str,
        context_docs: List[Dict],
        llm,
    ) -> str:
        """使用 LLM 根据上下文生成回答"""
        from langchain_core.prompts import ChatPromptTemplate
        from langchain.chains.combine_documents import create_stuff_documents_chain

        context_text = "\n\n".join([doc["content"] for doc in context_docs])

        prompt = ChatPromptTemplate.from_messages([
            ("system",
             "You are a helpful assistant. Use the following context to answer the question.\n\n"
             "Context:\n{context}\n\n"
             "Answer based on the context above. If the context doesn't contain enough "
             "information to answer the question, say so."),
            ("human", "{question}"),
        ])

        chain = create_stuff_documents_chain(
            llm, prompt, document_variable_name="context"
        )

        response = await chain.ainvoke({
            "question": question,
            "context": [LangchainDocument(page_content=doc["content"]) for doc in context_docs],
        })
        return response

    def _load_kb_documents(self, kb_id: int) -> List[str]:
        """加载知识库所有文档内容"""
        docs = self.db.query(Document).filter(
            Document.knowledge_base_id == kb_id
        ).all()
        return [doc.file_path for doc in docs]

    def _compute_summary(
        self,
        retrieval_metrics_list: List[Dict],
        generation_metrics_list: List[Dict],
        rag_metrics_list: List[Dict],
    ) -> Dict[str, Any]:
        """计算所有测试用例的平均指标"""

        def avg(lst, key):
            vals = [item.get(key) for item in lst if item.get(key) is not None]
            return round(sum(vals) / len(vals), 4) if vals else None

        summary = {}

        if retrieval_metrics_list:
            summary["retrieval"] = {
                "precision_at_k": avg(retrieval_metrics_list, "precision_at_k"),
                "recall_at_k": avg(retrieval_metrics_list, "recall_at_k"),
                "mrr": avg(retrieval_metrics_list, "mrr"),
                "ndcg_at_k": avg(retrieval_metrics_list, "ndcg_at_k"),
                "sample_count": len(retrieval_metrics_list),
            }

        if generation_metrics_list:
            summary["generation"] = {
                "faithfulness": avg(generation_metrics_list, "faithfulness"),
                "answer_relevance": avg(generation_metrics_list, "answer_relevance"),
                "context_relevance": avg(generation_metrics_list, "context_relevance"),
                "sample_count": len(generation_metrics_list),
            }

        if rag_metrics_list:
            summary["rag"] = {
                "ragas_f1": avg(rag_metrics_list, "ragas_f1"),
                "noise_score": avg(rag_metrics_list, "noise_score"),
                "sample_count": len(rag_metrics_list),
            }

        return summary

    async def auto_generate_test_set(
        self,
        task_id: int,
        num_cases: int = 10,
    ) -> List[EvaluationTestCase]:
        """
        使用 LLM 自动从知识库文档中生成测试用例
        """
        task = self.db.query(EvaluationTask).get(task_id)
        if not task or not task.knowledge_base_id:
            raise ValueError("Task requires knowledge_base_id for auto-generation")

        # 1. 从知识库采样文档片段
        embeddings = EmbeddingsFactory.create()
        vector_store = VectorStoreFactory.create(
            store_type=settings.VECTOR_STORE_TYPE,
            collection_name=f"kb_{task.knowledge_base_id}",
            embedding_function=embeddings,
        )

        # 随机采样一些查询
        kb_docs = self.db.query(Document).filter(
            Document.knowledge_base_id == task.knowledge_base_id
        ).limit(20).all()

        # 2. 用 LLM 生成问答对
        llm = LLMFactory.create(temperature=0.3)
        test_cases = []

        from langchain_core.prompts import ChatPromptTemplate

        GENERATE_PROMPT = ChatPromptTemplate.from_messages([
            ("system",
             "You are an expert at generating test questions for a RAG system. "
             "Based on the following document content, generate {num} question-answer pairs "
             "that test whether a RAG system can correctly retrieve and answer using this content.\n\n"
             "For each pair, provide:\n"
             "1. A specific question that can be answered from the document\n"
             "2. The relevant document content (exact text or summary)\n\n"
             "Return a JSON array of {{\"question\": \"...\", \"ground_truth_docs\": [\"...\"], \"ground_truth_answer\": \"...\"}}"),
            ("human", "Document:\n{doc_content}"),
        ])

        for doc in kb_docs:
            if len(test_cases) >= num_cases:
                break

            try:
                # 获取文档片段
                chunks = vector_store.similarity_search(doc.file_name, k=3)
                doc_content = "\n".join([c.page_content for c in chunks]) or doc.file_name

                response = await llm.ainvoke(
                    GENERATE_PROMPT.format(doc_content=doc_content, num=num_cases)
                )

                import json
                pairs = json.loads(response.content)

                for pair in pairs:
                    test_case = EvaluationTestCase(
                        task_id=task_id,
                        query=pair["question"],
                        ground_truth_docs=pair.get("ground_truth_docs", []),
                        ground_truth_answer=pair.get("ground_truth_answer", ""),
                        auto_generated=1,
                        generation_prompt=GENERATE_PROMPT.format(doc_content=doc_content, num=num_cases),
                    )
                    test_cases.append(test_case)

            except Exception as e:
                logger.warning(f"Failed to generate test case from doc {doc.id}: {e}")
                continue

        self.db.add_all(test_cases)
        self.db.commit()

        return test_cases
```

---

### 5. API 端点

```python
# backend/app/api/api_v1/evaluation.py

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db.session import get_db
from app.models.user import User
from app.core.security import get_current_user
from app.models.evaluation import (
    EvaluationTask, EvaluationTestCase, EvaluationResult,
    EvaluationType, EvaluationStatus
)
from app.services.evaluation.evaluation_service import EvaluationService

router = APIRouter()


# ---- Schemas ----

class TestCaseCreate(BaseModel):
    query: str
    ground_truth_docs: Optional[List[str]] = None
    ground_truth_answer: Optional[str] = None


class EvaluationTaskCreate(BaseModel):
    name: str
    description: Optional[str] = None
    evaluation_type: EvaluationType
    knowledge_base_id: Optional[int] = None
    chat_id: Optional[int] = None
    retrieval_top_k: int = 5
    chunk_size: int = 1000
    chunk_overlap: int = 200
    test_cases: Optional[List[TestCaseCreate]] = None


class EvaluationTaskResponse(BaseModel):
    id: int
    name: str
    status: str
    evaluation_type: str
    summary: Optional[dict]
    test_case_count: int


class EvaluationResultResponse(BaseModel):
    query: str
    retrieval_metrics: Optional[dict]
    generated_answer: Optional[str]
    generation_metrics: Optional[dict]
    rag_metrics: Optional[dict]


# ---- Routes ----

@router.post("/", response_model=EvaluationTaskResponse)
async def create_evaluation_task(
    task_in: EvaluationTaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """创建评估任务"""
    service = EvaluationService(db)

    task = EvaluationTask(
        name=task_in.name,
        description=task_in.description,
        evaluation_type=task_in.evaluation_type,
        knowledge_base_id=task_in.knowledge_base_id,
        chat_id=task_in.chat_id,
        retrieval_top_k=task_in.retrieval_top_k,
        chunk_size=task_in.chunk_size,
        chunk_overlap=task_in.chunk_overlap,
        created_by=current_user.id,
        status=EvaluationStatus.PENDING,
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    # 添加测试用例
    if task_in.test_cases:
        test_cases = [
            EvaluationTestCase(
                task_id=task.id,
                query=tc.query,
                ground_truth_docs=tc.ground_truth_docs,
                ground_truth_answer=tc.ground_truth_answer,
            )
            for tc in task_in.test_cases
        ]
        db.add_all(test_cases)
        db.commit()

    return EvaluationTaskResponse(
        id=task.id,
        name=task.name,
        status=task.status,
        evaluation_type=task.evaluation_type,
        summary=task.summary,
        test_case_count=len(task_in.test_cases) if task_in.test_cases else 0,
    )


@router.post("/{task_id}/run")
async def run_evaluation(
    task_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """触发评估执行（后台）"""
    task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="评估任务不存在")

    if task.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="无权限执行此评估任务")

    if task.status == EvaluationStatus.RUNNING:
        raise HTTPException(status_code=400, detail="评估任务正在执行中")

    # 后台执行
    async def _run():
        service = EvaluationService(db)
        await service.run_evaluation_task(task_id)

    background_tasks.add_task(_run)

    return {"message": "评估任务已启动", "task_id": task_id}


@router.post("/{task_id}/test-set/generate")
async def generate_test_set(
    task_id: int,
    num_cases: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """自动生成测试集（LLM 生成问题）"""
    task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="评估任务不存在")

    service = EvaluationService(db)
    test_cases = await service.auto_generate_test_set(task_id, num_cases=num_cases)

    return {
        "message": f"已生成 {len(test_cases)} 个测试用例",
        "test_case_ids": [tc.id for tc in test_cases],
    }


@router.get("/{task_id}/results", response_model=List[EvaluationResultResponse])
async def get_evaluation_results(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取评估结果详情"""
    results = db.query(EvaluationResult).filter(
        EvaluationResult.task_id == task_id
    ).all()

    test_cases = {tc.id: tc for tc in db.query(EvaluationTestCase).filter(
        EvaluationTestCase.task_id == task_id
    ).all()}

    return [
        EvaluationResultResponse(
            query=test_cases[r.test_case_id].query if r.test_case_id in test_cases else "",
            retrieval_metrics=r.retrieval_metrics,
            generated_answer=r.generated_answer,
            generation_metrics=r.generation_metrics,
            rag_metrics=r.rag_metrics,
        )
        for r in results
    ]


@router.get("/compare")
async def compare_evaluations(
    task_ids: str = Query(..., description="逗号分隔的任务ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """对比多个评估任务的结果"""
    task_id_list = [int(id.strip()) for id in task_ids.split(",")]

    tasks = db.query(EvaluationTask).filter(
        EvaluationTask.id.in_(task_id_list)
    ).all()

    comparison = {
        "tasks": [
            {
                "id": t.id,
                "name": t.name,
                "evaluation_type": t.evaluation_type,
                "status": t.status,
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "summary": t.summary,
            }
            for t in tasks
        ]
    }

    # 计算改进建议
    if len(tasks) >= 2:
        summaries = [t.summary for t in tasks if t.summary]
        if summaries:
            latest = summaries[-1]
            previous = summaries[-2] if len(summaries) > 1 else latest

            suggestions = []

            # 检索质量分析
            if latest.get("retrieval") and previous.get("retrieval"):
                p_recall = latest["retrieval"].get("recall_at_k", 0)
                prev_recall = previous["retrieval"].get("recall_at_k", 0)
                if p_recall < 0.5:
                    suggestions.append("Recall 较低，建议调整 chunk_size 或增加文档覆盖")
                if p_recall < prev_recall:
                    suggestions.append("Recall 相比上次下降，检查是否有文档删除或分块变化")

            # 生成质量分析
            if latest.get("generation"):
                faithfulness = latest["generation"].get("faithfulness", 1.0)
                if faithfulness and faithfulness < 0.7:
                    suggestions.append("Faithfulness 较低，可能存在幻觉，建议检查检索质量或调整提示词")
                answer_rel = latest["generation"].get("answer_relevance", 1.0)
                if answer_rel and answer_rel < 0.6:
                    suggestions.append("Answer Relevance 较低，可能问题与文档不匹配")

            if latest.get("rag", {}).get("ragas_f1"):
                ragas = latest["rag"]["ragas_f1"]
                if ragas and ragas < 0.5:
                    suggestions.append("RAGAS F1 较低，建议全面检查检索和生成流程")

            comparison["suggestions"] = suggestions

    return comparison


@router.get("/", response_model=List[EvaluationTaskResponse])
async def list_evaluation_tasks(
    kb_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """列出评估任务（支持按知识库过滤）"""
    query = db.query(EvaluationTask).filter(EvaluationTask.created_by == current_user.id)
    if kb_id:
        query = query.filter(EvaluationTask.knowledge_base_id == kb_id)

    tasks = query.offset(skip).limit(limit).all()

    result = []
    for t in tasks:
        tc_count = db.query(EvaluationTestCase).filter(
            EvaluationTestCase.task_id == t.id
        ).count()
        result.append(EvaluationTaskResponse(
            id=t.id,
            name=t.name,
            status=t.status,
            evaluation_type=t.evaluation_type,
            summary=t.summary,
            test_case_count=tc_count,
        ))

    return result
```

---

## 评估类型说明

| 评估类型 | 评估内容 | 所需数据 |
|----------|----------|----------|
| `retrieval` | Precision@K, Recall@K, MRR, NDCG@K | `ground_truth_docs` 人工标注 |
| `generation` | Faithfulness, Answer Relevance, Context Relevance | 检索结果 + LLM 评判 |
| `full` | 检索 + 生成 + RAGAS F1 | `ground_truth_docs` 人工标注 |

---

## 典型使用流程

### 1. 手动创建含标注数据的评估任务

```bash
# 创建评估任务
POST /api/evaluation
{
  "name": "KB-1 Q1 评估",
  "evaluation_type": "full",
  "knowledge_base_id": 1,
  "retrieval_top_k": 5,
  "test_cases": [
    {
      "query": "法国的首都是什么？",
      "ground_truth_docs": ["法国的首都是巴黎，位于法国北部..."],
      "ground_truth_answer": "法国的首都是巴黎。"
    },
    {
      "query": "谁发明了相对论？",
      "ground_truth_docs": ["阿尔伯特·爱因斯坦在1905年提出狭义相对论..."],
      "ground_truth_answer": "阿尔伯特·爱因斯坦。"
    }
  ]
}

# 触发评估
POST /api/evaluation/1/run

# 查看结果
GET /api/evaluation/1/results
```

### 2. 自动生成测试集 + 评估

```bash
# 创建空评估任务
POST /api/evaluation
{
  "name": "KB-1 自动评估",
  "evaluation_type": "retrieval",
  "knowledge_base_id": 1
}

# 自动生成 20 个测试用例
POST /api/evaluation/1/test-set/generate?num_cases=20

# 执行评估
POST /api/evaluation/1/run
```

### 3. 对比历史评估

```bash
GET /api/evaluation/compare?task_ids=1,2,3
```

---

## 业务改进建议

### 🔴 高优先级

| 问题 | 建议 |
|------|------|
| 无 ground truth 标注时 retrieval 指标无法计算 | 默认使用 `generation` 类型评估，检索评估需要人工标注或自动生成 relevance labels |
| LLM-as-Judge 评判成本高 | 对 `retrieval` 类型的评估跳过 generation 阶段；评估结果可缓存 |
| 评估任务无并发控制 | 添加评估任务并发上限（如最多 3 个同时运行），避免数据库/向量库压力 |

### 🟡 中优先级

| 问题 | 建议 |
|------|------|
| 自动生成测试集的质量不可控 | 添加 LLM 生成的测试用例评分，过滤低质量用例 |
| 无定时评估任务 | 支持 Cron 调度，定期对知识库进行评估并记录趋势 |
| 评估结果无告警 | 当指标低于阈值（如 Recall<0.3）时发送通知 |

### 🟢 低优先级

| 问题 | 建议 |
|------|------|
| 测试用例无法批量导入 | 支持 CSV/Excel 批量导入测试集 |
| 无可视化报表 | 前端添加雷达图、趋势折线图展示评估结果 |
| 无法针对特定分块策略评估 | 评估时支持指定不同的 chunk_size/overlap，对比效果 |
