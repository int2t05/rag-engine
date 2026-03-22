"""
RAG评估相关 Pydantic 模型
=======================
"""

from typing import Optional, List, Literal
from pydantic import BaseModel, Field

# 评估类型
EvaluationType = Literal["full", "retrieval", "generation"]


class EvaluationJudgeConfig(BaseModel):
    """
    任务级 RAGAS 评分运行时：与当前用户「模型配置」合并，仅覆盖已填字段。
    可选填写专用 API Key；未填时对话/嵌入密钥仍来自全局「模型配置」。
    """

    chat_provider: Optional[Literal["openai", "ollama"]] = Field(
        default=None,
        description="评分用对话模型：OpenAI 兼容 API 或 Ollama",
    )
    embeddings_provider: Optional[Literal["openai", "ollama"]] = Field(
        default=None,
        description="评分用嵌入（answer_relevance / answer_correctness 等需要）",
    )

    openai_api_base: Optional[str] = None
    openai_api_key: Optional[str] = None
    openai_model: Optional[str] = None
    openai_embeddings_api_base: Optional[str] = None
    openai_embeddings_api_key: Optional[str] = None
    openai_embeddings_model: Optional[str] = None

    ollama_api_base: Optional[str] = None
    ollama_model: Optional[str] = None
    ollama_embeddings_api_base: Optional[str] = None
    ollama_embeddings_model: Optional[str] = None


class TestCaseCreate(BaseModel):
    """评估测试用例创建请求"""

    query: str
    reference: Optional[str] = None


class TestCaseBatchImport(BaseModel):
    """从 JSON 批量导入的测试用例列表（与创建任务时单条结构一致）"""

    test_cases: List[TestCaseCreate] = Field(
        ...,
        min_length=1,
        description="至少一条；空问题会在服务端跳过",
    )


class TestCaseBatchImportResult(BaseModel):
    """批量导入结果"""

    task_id: int
    imported: int
    skipped: int


class TestCaseResponse(BaseModel):
    """评估测试用例响应"""

    id: int
    query: str
    reference: Optional[str] = None

    class Config:
        from_attributes = True


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
    evaluation_metrics: Optional[List[str]] = Field(
        default=None,
        description="可选，指定一个或多个指标；不传则按 evaluation_type 默认集合",
    )
    judge_config: Optional[EvaluationJudgeConfig] = Field(
        default=None,
        description="可选，自定义 RAGAS 评分模型（与全局模型配置合并）",
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
    evaluation_metrics: Optional[List[str]] = None
    judge_config: Optional[dict] = None
    status: str
    error_message: Optional[str]
    summary: Optional[dict]
    test_cases: Optional[List["TestCaseResponse"]] = None

    class Config:
        from_attributes = True


class EvaluationResolveResponse(BaseModel):
    """
    GET /evaluation/resolve/{id}：任务不存在时仍返回 HTTP 200（ok=false），避免访问日志刷 404。
    存在时 ok=true 且带完整 task（与 GET /evaluation/{id} 一致）。
    """

    ok: bool
    task_id: int
    task: Optional[EvaluationTaskResponse] = None


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
