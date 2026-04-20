# 田沛康 | AI应用开发（后端/全栈）

**联系方式**：18819761202 | 2103859514@qq.com | 广州 | Github：https://github.com/int2t05（开源项目：ForgeAgent / RAG Engine）

---

## 教育经历

华南理工大学 | 计算机科学与技术 | 本科（在读）| 2023.09-2027.07

核心课程：人工智能、数据库原理、Python程序设计、计算机网络

---

## 专业技能

### AI核心开发
- 掌握 LangChain/LangGraph框架、Prompt工程、Functinon Calling
- 熟练 搭建RAG全流程（ETL/Embedding/混合检索/Rerank）、开发多Agent协作应用
- 熟悉 RAGAS自动化评估、MCP/Agent Skills开发

### 后端开发
- 掌握 Python3.11+/Asyncio、FastAPI、SQLAlchemy2.0异步开发
-  熟练 Pydantic数据校验、MySQL/SQLite数据库开发、Redis缓存队列
- 了解 ChromaDB/Milvus向量库、MinIO对象存储、Elasticsearch

### 工程化部署
- 熟悉 Docker 容器化和 Nginx 反向代理部署，编写 Dockerfile 打包项目，通过 Serverless 平台快速上线
- 熟悉 Vibe Coding、SDD、Harness Engineering 等多种 AI 编程模式，能利用 Spec-Kit、OpenSpec 等工具驱动 AI 完成大型项目

---

## 项目经历

### ForgeAgent - 企业级AI智能体 | 后端开发
**Github**：https://github.com/int2t05/ForgeAgent | 2024.x - 至今

- **项目简介**：基于 Python + FastAPI + LangGraph 构建的企业级 AI 智能体。采用 Plan-and-Execute + ReAct 双模式，支持多轮对话、记忆持久化、RAG 知识库检索与 MCP 协议扩展，可自主调用工具完成复杂任务，如联网搜索、资源下载、文档生成等。技术栈：Python3.11+/FastAPI/LangGraph/LangChain/React18+TS/SQLite

- **技术亮点**：
  ● 设计分层多Agent协作架构，拆分Planner/Actor/Learner职责，支持复杂任务拆分并行执行，集成Checkpoint持久化，服务重启后对话上下文恢复率达99%+
  ● 融合RAG知识库与工具调用，基于LCEL构建RAG Chain实现混合检索+Rerank，通过@Tool注解开发6种内置工具，结合参数校验规避工具调用幻觉
  ● 搭建多维度记忆系统，通过会话黑板跨轮次共享数据、LLM摘要压缩超长会话、本地Token计数截断，精准控制上下文长度
  ● 优化工程稳定性，实现SSE流式输出让用户等待感知时间减少80%，引入熔断器+重试机制保障LLM调用稳定性，支持Skill目录热加载快速扩展Agent能力

---

### RAG Engine - 检索增强生成引擎 | 后端开发
**Github**：https://github.com/int2t05/RAG-ENGINE | 2024.x - 至今

- **项目简介**：基于FastAPI+LangChain(LCEL)构建的RAG引擎后端服务，提供知识库管理、智能对话和RAGAS评估功能，支持多知识库、流式对话与多模型切换。技术栈：FastAPI/SQLAlchemy/MySQL/ChromaDB/LangChain(LCEL)/RAGAS/MinIO

- **技术亮点**：
  ● 设计Advanced RAG检索流水线，集成RecursiveCharacterTextSplitter语义分块+父子分块策略，构建混合检索（向量+BM25）、RRF多路召回融合、Rerank重排序完整链路，知识问答准确率提升45%+
  ● 基于RAGAS实现faithfulness、answer_relevancy、context_precision、context_recall、answer_correctness全链路自动化评估，支持评估数据自动生成与批量测试
  ● 实现EmbeddingsFactory/LLMFactory工厂模式，支持OpenAI API与Ollama本地模型无缝切换，通过API调用成本分析实现模型性价比优化
  ● 构建完整知识库生态：多知识库隔离、文档ETL流水线、元数据自动标注、流式对话+引用溯源，满足企业级知识库场景需求

---

## 个人优势

- 具备扎实的计算机专业基础，具备良好的工程化思维和开源协作能力
- 具备 **AI Agent 全栈开发能力**，从需求分析、架构设计、AI应用开发、前端界面到部署运维均能独立完成
- 自主学习能力强，能独立阅读 LangChain 等官方文档快速掌握新技术；善于利用 Claude Code 等 AI 工具辅助学习,持续跟进 AI大模型、Agent Skills 生态的最新发展
