# RAG 入门知识

## 什么是 RAG

**RAG（Retrieval-Augmented Generation）** 指在调用大语言模型生成答案之前，先从外部知识库（常为向量数据库）**检索**与问题相关的文本片段，再把片段作为**上下文**一并交给模型，从而减少幻觉、并支持私有文档。

典型流水线：

1. **索引**：文档切分 → 嵌入 → 存入向量库（本项目使用 Chroma，见 [Chroma 文档](https://docs.trychroma.com/)）。
2. **检索**：用户问题（可经历史重写）→ 相似度检索 → 得到若干 chunk。
3. **生成**：将 chunk 与问题拼入提示词 → LLM 流式输出；常要求带引用编号（如 `[citation:1]`）。

## 与本项目对应的实现

- 分块与嵌入：`modules/knowledge/document_processor.py`
- 检索与 LCEL 链：`modules/chat/rag_service.py`（LangChain 1.x，见 [LangChain 文档](https://python.langchain.com/docs/)）
- 向量存储抽象：`shared/vector_store/`

## 延伸阅读

| 资源 | 说明 |
|------|------|
| [LangChain RAG 概念](https://python.langchain.com/docs/concepts/rag/) | 框架内术语与模式 |
| [OpenAI Embeddings 指南](https://platform.openai.com/docs/guides/embeddings) | 嵌入向量的一般说明（第三方兼容 API 思路类似） |
| [RAGAS](https://docs.ragas.io/) | 检索质量与答案质量评估 |
