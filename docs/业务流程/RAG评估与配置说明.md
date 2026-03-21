# RAG 评估与模型配置说明

## 模型配置（对话 / 嵌入 / 评估共用）

本项目中，**可变的 LLM 与嵌入参数（API Key、Base URL、模型名、provider 等）以用户为单位保存在数据库** 表 `llm_embedding_configs` 的 `config_json` 中；用户表 `users.active_llm_embedding_config_id` 指向当前启用配置。

加载逻辑见 `app/shared/ai_runtime_loader.py`，运行时通过 `ContextVar`（`app/shared/ai_runtime_context.py`）在请求内传递，供：

- `LLMFactory`（`app/shared/llm/llm_factory.py`）— 对话与 RAGAS 判分等；
- `EmbeddingsFactory`（`app/shared/embedding/embedding_factory.py`）— 文档向量化与需向量的指标。

支持的对话/嵌入 provider 以代码为准（例如 **openai**、**ollama**）；OpenAI 兼容网关可通过 `openai` + 自定义 `base_url` 接入。详见 [LangChain Chat models](https://python.langchain.com/docs/integrations/chat/) 与 [Embeddings](https://python.langchain.com/docs/integrations/text_embedding/)。

根目录 `.env.example` 中的 `CHAT_PROVIDER`、`OPENAI_*` 等变量可用于本地脚本或兼容旧说明；**以应用内「模型配置」与数据库为准** 完成上线配置。

## RAG 评估（RAGAS）

评估模块使用 **RAGAS**（[官方文档](https://docs.ragas.io/)），指标实现位于 `app/modules/evaluation/ragas_eval.py` 等。请确保：

1. 用户已配置并启用 LLM/嵌入；
2. 评估任务所用量与业务使用同一套运行时或明确区分的配置；
3. RAGAS 版本与 `requirements.txt` 中声明一致，避免 API 变更导致不兼容。

调试时可结合 [Pydantic Settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/) 与后端日志，确认加载到的 `AiRuntimeSettings` 字段正确。
