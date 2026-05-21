# RAG Engine

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![LangChain](https://img.shields.io/badge/LangChain-1.x-1C3C3C?logo=langchain&logoColor=white)](https://python.langchain.com/)
[![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Chroma](https://img.shields.io/badge/Vector-Chroma-FF6F00?logo=chromadb&logoColor=white)](https://www.trychroma.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**检索增强生成（RAG）全栈工程模板** — 从用户认证、知识库管理、文档解析与向量化，到混合检索、流式对话与 RAGAS 评估，一个仓库闭环跑通。

> English version: [README.en.md](README.en.md)

## 为什么值得关注

- **端到端可运行**：认证 → 知识库/文档处理 → 向量检索 → 流式对话（SSE）→ 可选评估，全链路闭环，适合作为二次开发的起点。
- **可配置检索管线**：通过 `RagPipelineOptions` 统一控制查询重写、混合检索（稠密 + BM25 / RRF）、多路召回、FlashRank 重排、父子分块展开等策略，关闭即回退到向量检索 + `top_k` 主路径。
- **模型配置存库**：LLM / Embedding 的 Endpoint 与密钥存在数据库（非仅环境变量），支持 OpenAI 兼容 API 与 Ollama 等后端随时切换。
- **数据面分层**：MySQL（业务元数据）、Chroma（向量）、MinIO（原始文件），职责清晰，替换或扩展存储实现成本低。
- **前后端分离**：FastAPI REST + SSE 后端，Next.js 14 (App Router) + Tailwind 前端，独立部署。

## 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| API 框架 | FastAPI + Pydantic v2 | REST 接口、配置管理、lifespan 启动 |
| RAG 框架 | LangChain 1.x (LCEL) | 检索管线、文档处理、链式调用 |
| 向量存储 | Chroma | 向量索引与相似度检索 |
| 关系数据库 | MySQL + SQLAlchemy 2 + Alembic | 业务数据、迁移管理 |
| 对象存储 | MinIO | 原始文件存储 |
| 评估（可选） | RAGAS | RAG 质量评估 |
| 前端 | Next.js 14 + React 18 + Tailwind | Web UI |

## 快速开始

### 1. 启动基础设施

```bash
docker compose -f docker-compose.infra.yml up -d   # MySQL + Chroma + MinIO
```

### 2. 启动后端

```bash
cd backend
conda env create -f environment.yml    # 或 python -m venv .venv && pip install -r requirements.txt
conda activate p311
# 在项目根目录复制 .env.example 为 .env，填写数据库、密钥等配置
cd ..
uvicorn app.main:app --reload --app-dir backend
```

浏览器打开 http://127.0.0.1:8000/docs 查看 Swagger API 文档。

### 3. 配置模型

对话与嵌入使用的 LLM / Embedding 参数保存在数据库的「模型配置」中。在应用内创建并启用配置后即可使用。详见 [docs/业务流程/RAG评估与配置说明.md](docs/业务流程/RAG评估与配置说明.md)。

### 4. 启动前端

```bash
cd frontend
pnpm install
pnpm dev
```

## API 概览

所有接口前缀 `/api`：

| 路由 | 说明 |
|------|------|
| `/api/auth` | 注册、登录、JWT 鉴权 |
| `/api/knowledge-base` | 知识库管理、文档上传与处理、检索 |
| `/api/chat` | 对话与会话管理（SSE 流式回答） |
| `/api/evaluation` | RAGAS 评估任务与结果 |
| `/api/llm-configs` | 用户级 LLM / Embedding 配置 |

## 仓库结构

```
rag-engine/
├── backend/                   # FastAPI 应用
│   └── app/
│       ├── api/               # 路由与依赖注入
│       ├── core/              # 配置、异常、MinIO 初始化
│       ├── db/                # 数据库会话与迁移
│       ├── models/            # SQLAlchemy 模型
│       ├── modules/           # 业务模块（auth, kb, chat, evaluation, llm_config）
│       ├── schemas/           # Pydantic 请求/响应模型
│       ├── shared/            # RAG 管线、去重、分块等共享逻辑
│       └── startup/           # 启动脚本（迁移等）
├── frontend/                  # Next.js 14 前端
├── docs/                      # 架构、业务流程、开发路线等文档
├── docker-compose.infra.yml   # 基础设施编排
├── docker-compose.dev.yml     # 开发环境编排（含 nginx）
└── .env.example               # 环境变量模板
```

## 文档索引

| 文档 | 内容 |
|------|------|
| [docs/总览/00 项目总览.md](docs/总览/00%20项目总览.md) | 目标、边界、技术选型 |
| [docs/总览/01 开发路线.md](docs/总览/01%20开发路线.md) | 建议迭代顺序 |
| [docs/架构/后端项目架构说明.md](docs/架构/后端项目架构说明.md) | 后端分层与模块职责 |
| [docs/架构/API路由.md](docs/架构/API路由.md) | 路由与实现对照 |
| [docs/业务流程/00-业务流程总览与索引.md](docs/业务流程/00-业务流程总览与索引.md) | 各模块业务流程 |
| [docs/业务流程/RAG评估与配置说明.md](docs/业务流程/RAG评估与配置说明.md) | 模型配置与评估实践 |
| [frontend/docs/](frontend/docs/README.md) | 前端设计思路与架构 |

## 许可证

[MIT License](LICENSE) — 详见仓库内 `LICENSE` 文件。
