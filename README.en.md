# RAG Engine

A **FastAPI** + **LangChain 1.x (LCEL)** RAG stack: auth, knowledge bases, document ingestion, vector search, streaming chat, and optional RAG evaluation. The web UI uses **Next.js 14**.

## Stack (official docs)

| Layer | Tech | Docs |
|------|------|------|
| API | FastAPI, `lifespan` | [FastAPI](https://fastapi.tiangolo.com/), [lifespan events](https://fastapi.tiangolo.com/advanced/events/) |
| Config | Pydantic v2, pydantic-settings | [Pydantic](https://docs.pydantic.dev/latest/) |
| DB | SQLAlchemy 2, Alembic | [SQLAlchemy 2.0](https://docs.sqlalchemy.org/en/20/), [Alembic](https://alembic.sqlalchemy.org/en/latest/) |
| RAG | LangChain 1.x, LCEL | [LangChain Python](https://python.langchain.com/docs/) |
| Vectors | Chroma, langchain-chroma | [Chroma](https://docs.trychroma.com/), [Chroma integration](https://python.langchain.com/docs/integrations/vectorstores/chroma/) |
| Object storage | MinIO | [MinIO Python SDK](https://min.io/docs/minio/linux/developers/python/API.html) |
| Evaluation (optional) | RAGAS | [RAGAS](https://docs.ragas.io/) |
| Frontend | Next.js 14, React 18 | [Next.js](https://nextjs.org/docs) |

## Layout

```
rag-engine/
├── backend/
├── frontend/
├── docs/
├── docker-compose.infra.yml
├── docker-compose.dev.yml
└── .env.example
```

## Quick start

### Infra (MySQL, Chroma, MinIO)

```bash
docker compose -f docker-compose.infra.yml up -d
```

### Backend

```bash
cd backend
conda env create -f environment.yml
conda activate p311
# Copy .env.example to .env at repo root and set MYSQL_*, SECRET_KEY, MINIO_*, CHROMA_*, etc.
cd ..
uvicorn backend.app.main:app --reload --app-dir backend
```

- OpenAPI UI: <http://127.0.0.1:8000/docs>
- Health: `GET /api/health`

### Model settings (required for chat)

LLM and embedding endpoints are stored **in the database** (per-user “LLM config”), not only in `.env`. Enable a config in the app before using RAG. See [docs/业务流程/RAG评估与配置说明.md](docs/业务流程/RAG评估与配置说明.md) (Chinese).

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

## API prefix

Default API prefix: `/api` (`API_V1_STR`): `/auth`, `/knowledge-base`, `/chat`, `/evaluation`, `/llm-configs`.

## More docs

- [docs/README.md](docs/README.md) (index, Chinese)
- [Architecture](docs/架构/后端项目架构说明.md)
- [API routes](docs/架构/API路由.md) (Chinese, path reference)
- [Business flows](docs/业务流程/00-业务流程总览与索引.md)

## License

See `LICENSE` in the repository if present.
