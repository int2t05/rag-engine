# RAG Engine

基于 RAG (Retrieval-Augmented Generation) 技术的智能知识库问答系统。

---

## 学习来源

本项目的设计与实现参考了 [rag-web-ui/rag-web-ui](https://github.com/rag-web-ui/rag-web-ui)，这是一个优秀的开源 RAG Web UI 项目，提供了完整的学习路径和工程实践参考。

### 核心学习点

| 模块 | 学习来源 | 本项目实现 |
|------|----------|-----------|
| **整体架构** | [RAG Web UI 架构设计](https://github.com/rag-web-ui/rag-web-ui) | FastAPI + LangChain + 向量数据库 |
| **文档处理流程** | [文档上传与异步处理](https://github.com/rag-web-ui/rag-web-ui/blob/main/docs/tutorial/README.md) | MinIO 存储 → 后台异步处理 → 分块向量化 |
| **RAG 对话流程** | [RAG 教程](https://github.com/rag-web-ui/rag-web-ui/blob/main/docs/tutorial/README.md) | 历史感知检索 → 上下文组装 → 流式生成 |
| **引用标注机制** | [引用格式设计](https://github.com/rag-web-ui/rag-web-ui/blob/main/docs/tutorial/README.md) | `[citation:N]` 格式 + 前端弹窗展示 |
| **Factory 模式** | [向量库/模型工厂](https://github.com/rag-web-ui/rag-web-ui) | 向量数据库、Embedding、LLM 可插拔 |
| **RAGAS 评估** | 项目自身扩展 | 评估指标：上下文相关性、忠实度、答案相关性 |

> 详细的学习笔记和最佳实践请参考 [docs](./docs/) 目录下的文档：
> - [RAG 对话业务流程最佳实践](./docs/RAG对话业务流程最佳实践.md)
> - [文档上传与向量化业务流程最佳实践](./docs/文档上传与向量化业务流程最佳实践.md)
> - [RAG 评估业务流程最佳实践](./docs/RAG评估业务流程最佳实践.md)
> - [用户认证业务流程最佳实践](./docs/用户认证业务流程最佳实践.md)

---

## 功能特性

### 知识库管理
- 多格式文档支持 (PDF、DOCX、Markdown、TXT)
- 文档自动分块和向量化
- 增量更新机制（基于 Hash 对比）
- 异步处理 + 状态轮询

### RAG 对话
- 基于知识库的智能问答
- 多轮对话支持（历史感知检索）
- 引用来源展示 `[citation:N]`
- 流式响应（SSE）

### 模型支持
- **LLM**: OpenAI、DeepSeek、Ollama、Zhipu
- **Embedding**: OpenAI、DashScope、Ollama、Zhipu
- **向量库**: ChromaDB、Qdrant

### 评估体系
- RAGAS 评估框架
- 多维度指标：Context Relevance、Faithfulness、Answer Relevancy
- 评估报告生成

---

## 技术架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              系统架构                                        │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐                      ┌──────────────┐
  │    前端      │ ◀────── SSE ──────▶ │    后端      │
  │  (Next.js)   │                      │  (FastAPI)   │
  └──────────────┘                      └──────┬───────┘
                                                 │
                    ┌────────────────────────────┼────────────────────────────┐
                    │                            │                            │
                    ▼                            ▼                            ▼
            ┌──────────────┐            ┌──────────────┐            ┌──────────────┐
            │    MySQL     │            │   MinIO      │            │  Vector Store│
            │  (元数据)     │            │  (文件存储)   │            │ (Chroma/Qdr)│
            └──────────────┘            └──────────────┘            └──────────────┘
```

---

## 快速开始

### 环境要求

- Python 3.9+
- Node.js 18+
- MySQL 8.0+
- MinIO
- ChromaDB / Qdrant

### 配置

```bash
# 复制环境配置
cp .env.example .env

# 编辑 .env 配置数据库、API密钥等
```

### 启动服务

```bash
# 启动基础设施 (MySQL, MinIO, ChromaDB)
docker compose -f docker-compose.infra.yml up -d

# 启动后端
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 启动前端 (新终端)
cd frontend
pnpm install
pnpm dev
```

---

## 项目结构

```
rag-engine/
├── backend/
│   ├── app/
│   │   ├── api/api_v1/      # API 路由
│   │   ├── core/            # 核心配置 (config, security)
│   │   ├── models/          # 数据库模型
│   │   ├── schemas/          # Pydantic schemas
│   │   ├── services/         # 业务逻辑
│   │   │   ├── chat_service.py      # RAG 对话核心
│   │   │   ├── document_processor.py # 文档处理
│   │   │   └── evaluation/           # RAGAS 评估
│   │   └── main.py
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── app/             # Next.js App Router
│       └── components/      # UI 组件
├── docs/                    # 业务流程最佳实践文档
├── docker-compose.yml
└── README.md
```

---

## API 文档

启动服务后访问：

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

---

## 相关资源

### 学习资料
- [RAG Web UI 教程](https://github.com/rag-web-ui/rag-web-ui/blob/main/docs/tutorial/README.md)
- [LangChain 文档](https://python.langchain.com/)
- [RAGAS 评估框架](https://docs.ragas.io/)
- [ChromaDB 文档](https://docs.trychroma.com/)

### 推荐延伸阅读
- [Understanding RAG: Retrieval-Augmented Generation](https://arxiv.org/abs/2312.10911)
- [RAGAS: Automated Evaluation of Retrieval Augmented Generation](https://arxiv.org/abs/2309.15217)

---

## 许可证

本项目仅供学习交流使用。

---

## 致谢

- [rag-web-ui/rag-web-ui](https://github.com/rag-web-ui/rag-web-ui) - 主要学习来源
- [FastAPI](https://fastapi.tiangolo.com/)
- [LangChain](https://python.langchain.com/)
- [ChromaDB](https://www.trychroma.com/)
