# RAG Engine

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![LangChain](https://img.shields.io/badge/LangChain-1.x-1C3C3C?logo=langchain&logoColor=white)](https://python.langchain.com/)
[![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Chroma](https://img.shields.io/badge/Vector-Chroma-FF6F00?logo=chromadb&logoColor=white)](https://www.trychroma.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**A full-stack RAG (Retrieval-Augmented Generation) template** — auth, knowledge bases, document ingestion, hybrid retrieval, streaming chat, and optional RAGAS evaluation, all in one repo.

> 中文版：[README.md](README.md)

## Why This Project

- **End-to-end runnable**: Auth → KB & document processing → vector retrieval → streaming chat (SSE) → optional evaluation. A complete closed loop ready for customization.
- **Configurable retrieval pipeline**: `RagPipelineOptions` toggles query rewriting, hybrid search (dense + BM25 / RRF), multi-route retrieval, FlashRank reranking, and parent-child chunk expansion. Disable features to fall back to simple vector search + `top_k`.
- **Model configs in the DB**: LLM and embedding endpoints/secrets are stored per-user in the database (not just env vars), making it easy to switch between OpenAI-compatible APIs and Ollama.
- **Separated storage**: MySQL (business metadata), Chroma (vectors), MinIO (raw files) — each layer replaceable independently.
- **Decoupled frontend**: FastAPI REST + SSE backend, Next.js 14 (App Router) + Tailwind frontend, deployed separately.

## Stack

| Layer | Tech | Purpose |
|-------|------|---------|
| API | FastAPI + Pydantic v2 | REST endpoints, config, lifespan hooks |
| RAG | LangChain 1.x (LCEL) | Retrieval pipeline, doc processing, chaining |
| Vector DB | Chroma | Vector indexing & similarity search |
| Relational DB | MySQL + SQLAlchemy 2 + Alembic | Business data & migrations |
| Object Store | MinIO | Raw file storage |
| Evaluation | RAGAS (optional) | RAG quality metrics |
| Frontend | Next.js 14 + React 18 + Tailwind | Web UI |

## Quick Start

### 1. Infrastructure

```bash
docker compose -f docker-compose.infra.yml up -d   # MySQL + Chroma + MinIO
```

### 2. Backend

```bash
cd backend
conda env create -f environment.yml    # or: python -m venv .venv && pip install -r requirements.txt
conda activate p311
# Copy .env.example to .env at repo root and fill in MYSQL_*, SECRET_KEY, MINIO_*, CHROMA_*, etc.
cd ..
uvicorn app.main:app --reload --app-dir backend
```

Open http://127.0.0.1:8000/docs for the Swagger API docs.

### 3. Model Configuration

LLM and embedding endpoints are stored in the database (per-user "LLM config"). Create and enable a config in-app before using RAG. See [docs/业务流程/RAG评估与配置说明.md](docs/业务流程/RAG评估与配置说明.md) (Chinese).

### 4. Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

## API Overview

All endpoints prefixed with `/api`:

| Prefix | Description |
|--------|-------------|
| `/api/auth` | Registration, login, JWT |
| `/api/knowledge-base` | KB management, doc upload/processing, retrieval |
| `/api/chat` | Chat sessions with SSE streaming |
| `/api/evaluation` | RAGAS evaluation tasks & results |
| `/api/llm-configs` | Per-user LLM/embedding configs |

## Repository Structure

```
rag-engine/
├── backend/                   # FastAPI application
│   └── app/
│       ├── api/               # Routes & dependency injection
│       ├── core/              # Config, exceptions, MinIO init
│       ├── db/                # DB sessions & migrations
│       ├── models/            # SQLAlchemy models
│       ├── modules/           # Business modules (auth, kb, chat, evaluation, llm_config)
│       ├── schemas/           # Pydantic request/response models
│       ├── shared/            # RAG pipeline, dedup, chunking utilities
│       └── startup/           # Startup scripts (migrations, etc.)
├── frontend/                  # Next.js 14 frontend
├── docs/                      # Architecture, workflows, roadmap (Chinese)
├── docker-compose.infra.yml   # Infrastructure services
├── docker-compose.dev.yml     # Dev environment (with nginx)
└── .env.example               # Environment variable template
```

## Documentation

| Document | Content |
|----------|---------|
| [docs/总览/00 项目总览.md](docs/总览/00%20项目总览.md) | Goals, scope, tech decisions |
| [docs/总览/01 开发路线.md](docs/总览/01%20开发路线.md) | Suggested iteration roadmap |
| [docs/架构/后端项目架构说明.md](docs/架构/后端项目架构说明.md) | Backend architecture & module responsibilities |
| [docs/架构/API路由.md](docs/架构/API路由.md) | Route-to-implementation reference |
| [docs/业务流程/00-业务流程总览与索引.md](docs/业务流程/00-业务流程总览与索引.md) | Business flow index |
| [frontend/docs/](frontend/docs/README.md) | Frontend design & architecture |

## License

[MIT License](LICENSE) — see the `LICENSE` file in this repository.
