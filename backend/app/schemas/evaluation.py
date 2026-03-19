"""
RAG评估相关 Pydantic 模型
=======================
"""

from typing import Optional, List, Literal
from pydantic import BaseModel, Field

# 评估类型
EvaluationType = Literal["full", "retrieval", "generation"]


class TestCaseCreate(BaseModel):
    """评估测试用例创建请求"""

    query: str
    reference: Optional[str] = None


class EvaluationTaskCreate(BaseModel):
    """评估任务创建请求"""

    name: str
    description: Optional[str] = None
    knowledge_base_id: Optional[int] = None
    top_k: int = 5
    evaluation_type: EvaluationType = Field(
        default="full",
        description="full=完整评估 | retrieval=仅检索 | generation=仅生成",
    )
    test_cases: List[TestCaseCreate]


class EvaluationTaskResponse(BaseModel):
    """评估任务响应"""

    id: int
    name: str
    description: Optional[str]
    knowledge_base_id: Optional[int]
    top_k: int
    evaluation_type: str
    status: str
    error_message: Optional[str]
    summary: Optional[dict]

    class Config:
        from_attributes = True


class EvaluationResultResponse(BaseModel):
    """单个评估结果响应"""

    id: int
    task_id: int
    test_case_id: Optional[int]
    retrieved_contexts: Optional[list]
    generated_answer: Optional[str]
    context_relevance: Optional[float]
    faithfulness: Optional[float]
    answer_relevance: Optional[float]
    context_recall: Optional[float]
    context_precision: Optional[float]
    ragas_score: Optional[float]
    passed: Optional[int]
    judge_details: Optional[dict]

    class Config:
        from_attributes = True
