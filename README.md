# RAG Engine

基于 **FastAPI** 与 **LangChain 1.x（LCEL）** 的检索增强生成（RAG）全栈示例：用户注册登录、知识库与文档处理、向量检索、对话流式回答、可选 RAG 评估。前端为 **Next.js 14**。

## 项目特点

- **端到端可运行**：认证、知识库与文档处理、向量存储、对话与引用展示、可选评估在同一仓库内闭环，适合作为可二次开发的全栈模板。
- **多知识库与流式体验**：对话可关联多个知识库；回答以 **SSE** 流式输出，前端可展示引用并跳转分块/文档详情。
- **模型配置用户级落地**：LLM / 嵌入的 Endpoint 与密钥等存在数据库（非仅环境变量），便于切换 **OpenAI 兼容 API** 与 **Ollama** 等后端。
- **可选 RAG 评估**：基于 **RAGAS** 的评估任务与指标，与对话侧共用 `RagPipelineOptions`，便于对比不同检索策略。
- **安全与可对接**：注册/登录与 **JWT**；业务 API 默认需 Bearer；根路径提供 **OpenAPI（Swagger）** 与 ReDoc，便于联调与生成客户端。

## 技术特点

- **LCEL 与可配置检索管线**：`RagPipelineOptions` 统一开关——查询重写、多知识库合并去重、**混合检索**（稠密 + BM25 / RRF）、多路召回、**FlashRank 重排**、**父子分块**展开为父块全文等；未开启时以向量检索 + `top_k` 为主路径。
- **数据面分层**：业务与分块元数据在 **MySQL**，向量在 **Chroma**，原始文件在 **MinIO**，职责清晰，便于替换或扩展存储实现。
- **检索结果去重**：对同一 `chunk_id` 或父子展开后的父块做合并，减轻重复片段对上下文与引用的干扰（见 `backend/app/shared/rag_dedupe.py`）。
- **类型与契约**：配置与 API 以 **Pydantic v2** 为主；迁移由 **Alembic** 在应用生命周期内执行，与 FastAPI `lifespan` 集成。
- **前后端形态**：后端 **REST**（资源与任务）+ 对话 **SSE**（流式 token）；前端 **Next.js 14**（App Router）与 Tailwind，与后端分离部署。

## 技术栈（与官方文档）

| 层级 | 技术 | 官方文档 |
|------|------|----------|
| API | FastAPI、`lifespan` 启动钩子 | [FastAPI](https://fastapi.tiangolo.com/)、[Events / lifespan](https://fastapi.tiangolo.com/advanced/events/) |
| 配置 | Pydantic v2、`pydantic-settings` | [Pydantic](https://docs.pydantic.dev/latest/) |
| ORM / 迁移 | SQLAlchemy 2、Alembic | [SQLAlchemy 2.0](https://docs.sqlalchemy.org/en/20/)、[Alembic](https://alembic.sqlalchemy.org/en/latest/) |
| RAG | LangChain 1.x、LCEL | [LangChain Python](https://python.langchain.com/docs/) |
| 向量库 | Chroma、LangChain-Chroma | [Chroma](https://docs.trychroma.com/)、[集成文档](https://python.langchain.com/docs/integrations/vectorstores/chroma/) |
| 对象存储 | MinIO | [MinIO Python SDK](https://min.io/docs/minio/linux/developers/python/API.html) |
| 评估（可选） | RAGAS | [RAGAS](https://docs.ragas.io/) |
| 前端 | Next.js 14、React 18 | [Next.js](https://nextjs.org/docs) |

## 仓库结构

```
rag-engine/
├── backend/          # FastAPI 应用（见 backend/app）
├── frontend/         # Next.js 应用
├── docs/             # 架构、总览、业务流程等说明
├── docker-compose.infra.yml   # 仅基础设施：MySQL、Chroma、MinIO
├── docker-compose.dev.yml     # 含 nginx 的开发编排示例
└── .env.example      # 环境变量模板（复制为项目根目录 .env）
```

## 快速开始

### 1. 基础设施

使用 Docker 启动 MySQL、Chroma、MinIO（端口与 `backend/app/core/config.py` 默认值对齐时可省略部分变量）：

```bash
docker compose -f docker-compose.infra.yml up -d
```

### 2. 后端

```bash
cd backend
conda env create -f environment.yml   # 或 python -m venv .venv && pip install -r requirements.txt
conda activate p311
# 在项目根目录复制 .env.example 为 .env 并填写 MYSQL_*、SECRET_KEY、MINIO_*、CHROMA_* 等
cd ..
uvicorn backend.app.main:app --reload --app-dir backend
```

- API 文档：<http://127.0.0.1:8000/docs>（根路径 `/` 在浏览器中会重定向到 Swagger）
- 健康检查：`GET /api/health`

### 3. 模型配置（必需）

对话与嵌入使用的 **LLM / Embeddings 参数保存在数据库**（用户「模型配置」），通过 `active_llm_embedding_config_id` 关联；使用前请在应用内完成配置并启用。详见 [docs/业务流程/RAG评估与配置说明.md](docs/业务流程/RAG评估与配置说明.md)。

### 4. 前端

```bash
cd frontend
pnpm install
pnpm dev
```

## API 概览

前缀默认为 `/api`（`API_V1_STR`）：

| 前缀 | 说明 |
|------|------|
| `/api/auth` | 注册、登录、JWT |
| `/api/knowledge-base` | 知识库、文档上传与处理、检索 |
| `/api/chat` | 对话与流式 RAG |
| `/api/evaluation` | RAG 评估任务与结果 |
| `/api/llm-configs` | 用户 LLM / 嵌入配置 |

## 文档索引

- [docs/README.md](docs/README.md)
- [架构说明](docs/架构/后端项目架构说明.md)
- [API 路由一览](docs/架构/API路由.md)
- [业务流程总览](docs/业务流程/00-业务流程总览与索引.md)
- [项目总览与路线](docs/总览/)
- [开发路线（建议迭代顺序）](docs/总览/01%20开发路线.md)

## 待办事项（TODO）

以下为仓库级、可勾选推进的事项（与业务代码中的临时注释无关；以 Issue/里程碑跟踪更佳）。

- [ ] **测试与质量**：为后端核心服务（知识库处理、RAG 管线、鉴权）与前端关键页面补充自动化测试；建立最小可重复的集成测试（含本地基础设施）。
- [ ] **CI**：在推送/PR 上运行 lint、类型检查与测试；可选覆盖率报告。
- [ ] **生产与安全**：HTTPS、CORS 收紧、API 限流、密钥轮换；MySQL / Chroma / MinIO 备份与恢复演练。
- [ ] **文档与契约**：定期对照 `GET /docs` OpenAPI 与各模块 `docs/架构/API路由.md`、前端 `frontend/docs`，避免路径与字段漂移。

## 后续优化方向

面向中长期演进的改进方向（非承诺排期，便于规划与讨论）。

| 方向 | 说明 |
|------|------|
| **检索与向量** | 多向量库或集合策略、跨知识库重排与融合、热点查询缓存、检索参数与 `RagPipelineOptions` 的预设与 A/B。 |
| **RAG 与对话** | 多轮上下文压缩与摘要、引用策略与上下文窗口分配、查询改写与多路检索的默认策略调优。 |
| **可观测性** | 结构化日志、关键路径指标（延迟、Token、检索命中）、可选 OpenTelemetry 追踪。 |
| **评估与数据** | 评估集版本化、任务结果对比与回归、与线上对话抽样联动（在合规前提下）。 |
| **前端与体验** | 首屏与列表性能、流式与错误态体验、无障碍与可选国际化（i18n）。 |

更细的**建议迭代顺序**见 [docs/总览/01 开发路线.md](docs/总览/01%20开发路线.md)。

## 英文说明

见 [README.en.md](README.en.md)。

## 许可证

以仓库内 `LICENSE` 为准（若未提供则视为未声明）。
