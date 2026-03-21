# RAG Engine

An intelligent knowledge-base Q&A system built on **RAG (Retrieval-Augmented Generation)** — **FastAPI** backend and **Next.js** frontend.

**Language / 语言:** [简体中文](README.md) · [English](README.en.md)

---

## Origin & references

Design and implementation draw from [rag-web-ui/rag-web-ui](https://github.com/rag-web-ui/rag-web-ui). Additional technical notes (mostly Chinese) live under [`docs/`](./docs/README.md).

---

## Features

- **Knowledge base**: multi-format upload, chunking, vectorization (**Chroma**), task status
- **Chat**: multi-turn RAG, citation markers `[citation:N]`, SSE streaming
- **Model config**: per-user LLM / embedding profiles stored in the database
- **Evaluation**: RAGAS metrics and tasks (optional dependencies)

---

## Architecture (summary)

| Layer | Stack |
|-------|--------|
| Frontend | Next.js (App Router) |
| Backend | FastAPI — `app.modules` (domains), `app.shared` (shared infra) |
| Data | MySQL (metadata), MinIO (objects), **Chroma** (vectors, MVP) |

See [`docs/架构/后端项目架构说明.md`](./docs/架构/后端项目架构说明.md) for backend layout (Chinese).

```
┌─────────────┐     ┌─────────────┐     ┌──────────┐     ┌─────────────┐
│  Frontend   │────▶│  FastAPI    │────▶│  MySQL   │     │   MinIO     │
│  Next.js    │ SSE │  modules +  │     │          │     │  (objects)  │
│             │◀────│  shared     │────▶│          │     └─────────────┘
└─────────────┘     └──────┬──────┘     └──────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Chroma    │
                    │  (vectors)  │
                    └─────────────┘
```

---

## Quick start

### Requirements

- Python **3.11** (Conda recommended: `backend/environment.yml`, env name `p311`)
- Node.js 18+
- MySQL 8, MinIO, Chroma (e.g. `docker-compose.infra.yml`)

### Configuration

```bash
cp .env.example .env
# Edit .env: database, MinIO, Chroma, etc.
```

### Run

```bash
docker compose -f docker-compose.infra.yml up -d

# Backend (prefer conda env p311)
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
pnpm install
pnpm dev
```

- API docs: http://localhost:8000/docs  

---

## Repository layout

```
rag-engine/
├── backend/app/
│   ├── modules/       # Domains: auth, knowledge, chat, evaluation, llm_config
│   ├── shared/        # Embeddings, LLM, vector store, runtime config
│   ├── models/        # SQLAlchemy ORM
│   ├── schemas/       # Pydantic
│   ├── api/           # Dependencies, error mapping; api_v1 router aggregation
│   └── main.py
├── frontend/
├── docs/              # Architecture notes, flow index (Chinese)
└── docker-compose.infra.yml
```

---

## Resources

- [LangChain](https://python.langchain.com/) · [RAGAS](https://docs.ragas.io/) · [Chroma](https://docs.trychroma.com/)
- [FastAPI](https://fastapi.tiangolo.com/)

---

## License

For learning and communication only.

## Acknowledgements

- [rag-web-ui/rag-web-ui](https://github.com/rag-web-ui/rag-web-ui)
- [FastAPI](https://fastapi.tiangolo.com/) · [LangChain](https://python.langchain.com/) · [ChromaDB](https://www.trychroma.com/)
