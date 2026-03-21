# 后端 Model 与 Schema 设计总结

本文汇总 **SQLAlchemy 模型**（`app/models`）与 **Pydantic Schema**（`app/schemas`）的职责划分；表名以迁移与模型为准。

## ORM 模型（主要表）

| 表名 | 模型 | 说明 |
|------|------|------|
| `users` | `User` | 用户；`active_llm_embedding_config_id` 指向当前启用的模型配置 |
| `llm_embedding_configs` | `LlmEmbeddingConfig` | 用户多套 LLM/嵌入 JSON 配置 |
| `knowledge_bases` | `KnowledgeBase` | 知识库，归属用户 |
| `documents` | `Document` | 已处理文档元数据（MinIO 路径、哈希等） |
| `document_uploads` | `DocumentUpload` | 上传过程记录 |
| `processing_tasks` | `ProcessingTask` | 文档处理任务状态 |
| `document_chunks` | `DocumentChunk` | 分块级元数据 |
| `chats` | `Chat` | 对话会话 |
| `messages` | `Message` | 单条消息 |
| `evaluation_tasks` | `EvaluationTask` | 评估任务 |
| `evaluation_test_cases` | `EvaluationTestCase` | 评估用例 |
| `evaluation_results` | `EvaluationResult` | 评估结果 |

时间戳等公共字段见 `app/models/base.py`。

## Pydantic Schema

`app/schemas` 下按域划分（如 `user.py`、`knowledge.py`、`chat.py`、`evaluation.py`、`llm_embedding_config.py`），用于：

- API 请求体验证与响应序列化（[Pydantic v2](https://docs.pydantic.dev/latest/)）；
- 与 OpenAPI 文档自动生成配合（[FastAPI](https://fastapi.tiangolo.com/tutorial/body/)）。

**运行时 AI 配置** 使用 `schemas/ai_runtime.py` 中的 `AiRuntimeSettings`，与数据库 `config_json` 对齐，供工厂类创建 LangChain 模型。

## 与迁移的关系

物理 schema 以 **Alembic** 迁移为准（[文档](https://alembic.sqlalchemy.org/en/latest/)）；修改模型后应生成新版本迁移脚本，避免环境与代码不一致。
