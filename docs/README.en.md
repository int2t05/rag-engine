# Documentation index

**Language:** [中文](README.md) · [English](README.en.md)

---

## Current docs (in sync with the repo)

| Document | Description |
|----------|-------------|
| [Architecture (backend)](架构/后端项目架构说明.md) | Backend layout (`modules` / `shared`), API prefixes, lifespan, errors |
| [Business flows overview](业务流程/00-业务流程总览与索引.md) | Core flows, code entry points, link to architecture |
| [Project overview](总览/00%20项目总览.md) | Learning-oriented overview (some paths may predate the latest backend; trust source code) |
| [Roadmap](总览/01%20开发路线.md) | Development roadmap |
| [RAG basics](总览/02%20RAG%20入门知识.md) | RAG introduction |
| [Model & schema notes](总览/03%20后端Model与Schema设计总结.md) | ORM & schema notes |

## Removed topic guides

Long-form “best practice” guides that lived at the repo root were removed. For behavior and contracts, use:

- **Swagger UI / ReDoc**: `/docs`, `/redoc` after starting the API
- **Source**: `backend/app/modules/` (domain), `backend/app/shared/` (shared infrastructure)

> Most narrative docs under `docs/总览/` are **Chinese**. Use browser translation or the structure above if you prefer English.

---

## External references

- [rag-web-ui tutorial](https://github.com/rag-web-ui/rag-web-ui/blob/main/docs/tutorial/README.md)
- [FastAPI](https://fastapi.tiangolo.com/)
- [LangChain](https://python.langchain.com/)
