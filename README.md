# RAG Engine

基于 RAG（Retrieval-Augmented Generation）的智能知识库问答系统（FastAPI + Next.js）。

**语言切换 Language:** [简体中文](README.md) · [English](README.en.md)

---

## 学习来源

设计与实现参考 [rag-web-ui/rag-web-ui](https://github.com/rag-web-ui/rag-web-ui)。更多技术说明见 [`docs/README.md`](./docs/README.md)（文档索引，中文）。

---

## 功能概览

- **知识库**：多格式文档上传、分块、向量化（Chroma）、任务状态
- **对话**：多轮 RAG、引用标注 `[citation:N]`、SSE 流式输出
- **模型配置**：用户侧多组 LLM/嵌入配置，数据库存储
- **评估**：RAGAS 指标与任务（可选依赖）

---

## 技术架构（摘要）

| 层级 | 说明 |
|------|------|
| 前端 | Next.js（App Router） |
| 后端 | FastAPI，`app.modules` 按业务域，`app.shared` 共享基础设施 |
| 数据 | MySQL（元数据）、MinIO（对象）、**Chroma**（向量，MVP） |

更完整的后端分层见 [`docs/架构/后端项目架构说明.md`](./docs/架构/后端项目架构说明.md)。

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

## 快速开始

### 环境

- Python **3.11**（推荐 Conda：`backend/environment.yml`，环境名 `p311`）
- Node.js 18+
- MySQL 8、MinIO、Chroma（可用 `docker-compose.infra.yml` 起基础设施）

### 配置

```bash
cp .env.example .env
# 编辑 .env：数据库、MinIO、Chroma 等
```

### 启动

```bash
docker compose -f docker-compose.infra.yml up -d

# 后端（建议在 conda p311 中）
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 前端
cd frontend
pnpm install
pnpm dev
```

- API 文档：http://localhost:8000/docs  

---

## 仓库结构（简）

```
rag-engine/
├── backend/app/
│   ├── modules/       # 业务域：auth、knowledge、chat、evaluation、llm_config
│   ├── shared/        # 嵌入、LLM、向量库、运行时配置加载
│   ├── models/        # SQLAlchemy ORM
│   ├── schemas/       # Pydantic
│   ├── api/           # 依赖、错误映射；api_v1 汇总路由
│   └── main.py
├── frontend/
├── docs/              # 架构说明、业务流程索引（中文为主）
└── docker-compose.infra.yml
```

---

## 相关资源

- [LangChain](https://python.langchain.com/) · [RAGAS](https://docs.ragas.io/) · [Chroma](https://docs.trychroma.com/)
- [FastAPI](https://fastapi.tiangolo.com/)

---

## 许可证

本项目仅供学习交流使用。

## 致谢

- [rag-web-ui/rag-web-ui](https://github.com/rag-web-ui/rag-web-ui)
- [FastAPI](https://fastapi.tiangolo.com/) · [LangChain](https://python.langchain.com/) · [ChromaDB](https://www.trychroma.com/)
