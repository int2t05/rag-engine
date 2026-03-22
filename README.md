# RAG Engine

基于 **FastAPI** 与 **LangChain 1.x（LCEL）** 的检索增强生成（RAG）全栈示例：用户注册登录、知识库与文档处理、向量检索、对话流式回答、可选 RAG 评估。前端为 **Next.js 14**。

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

## 英文说明

见 [README.en.md](README.en.md)。

## 许可证

以仓库内 `LICENSE` 为准（若未提供则视为未声明）。
