"""
RAG 评估相关模型
"""

from sqlalchemy import Column, Integer, String, ForeignKey, Text, DateTime, JSON, Float
from sqlalchemy.orm import relationship
from app.models.base import Base, TimestampMixin


class EvaluationTask(Base, TimestampMixin):
    """
    RAG 评估任务
    """
    __tablename__ = "evaluation_tasks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    # 评估范围
    knowledge_base_id = Column(Integer, ForeignKey("knowledge_bases.id"), nullable=True)

    # 评估配置
    top_k = Column(Integer, default=5)
    evaluation_type = Column(String(50), default="full")  # retrieval / generation / full
    # 可选：自定义要计算的指标名列表（JSON 数组），为空则按 evaluation_type 默认指标
    evaluation_metrics = Column(JSON, nullable=True)

    # 状态
    status = Column(String(20), default="pending")  # pending / running / completed / failed
    error_message = Column(Text, nullable=True)

    # 汇总结果
    summary = Column(JSON, nullable=True)

    # 使用哪个 LLM 评估
    llm_provider = Column(String(50), nullable=True)

    created_by = Column(Integer, ForeignKey("users.id"))
    user = relationship("User")

    # 测试用例
    test_cases = relationship(
        "EvaluationTestCase",
        back_populates="task",
        cascade="all, delete-orphan"
    )
    results = relationship(
        "EvaluationResult",
        back_populates="task",
        cascade="all, delete-orphan"
    )


class EvaluationTestCase(Base, TimestampMixin):
    """
    评估测试用例
    """
    __tablename__ = "evaluation_test_cases"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("evaluation_tasks.id"), nullable=False)

    # 问题
    query = Column(Text, nullable=False)

    # 参考答案（可选）
    reference = Column(Text, nullable=True)

    # 来源
    source = Column(String(50), default="manual")  # manual / auto_generated
    auto_generated = Column(Integer, default=0)

    task = relationship("EvaluationTask", back_populates="test_cases")
    results = relationship("EvaluationResult", back_populates="test_case")


class EvaluationResult(Base, TimestampMixin):
    """
    单个测试用例的评估结果
    """
    __tablename__ = "evaluation_results"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("evaluation_tasks.id"), nullable=False)
    test_case_id = Column(Integer, ForeignKey("evaluation_test_cases.id"), nullable=True)

    # 检索结果
    retrieved_contexts = Column(JSON, nullable=True)

    # 生成结果
    generated_answer = Column(Text, nullable=True)

    # 评估指标
    context_relevance = Column(Float, nullable=True)
    faithfulness = Column(Float, nullable=True)
    answer_relevance = Column(Float, nullable=True)
    context_recall = Column(Float, nullable=True)
    context_precision = Column(Float, nullable=True)
    ragas_score = Column(Float, nullable=True)

    # 通过状态
    passed = Column(Integer, nullable=True)

    # LLM 评判详情
    judge_details = Column(JSON, nullable=True)

    task = relationship("EvaluationTask", back_populates="results")
    test_case = relationship("EvaluationTestCase", back_populates="results")
