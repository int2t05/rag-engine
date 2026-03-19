# RAG 对话流程说明

## 概述

RAG（Retrieval-Augmented Generation）对话流程包含以下核心步骤：

```
创建对话(关联知识库) → 发送消息 → 历史问题重写 → 相似度检索 → LLM生成 → 流式返回 → 引用展示
```

系统使用 LangChain 的 `create_history_aware_retriever` 实现历史感知检索，通过 SSE 流式返回 LLM 回答。

---

## 完整流程图

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                              前端                                          │
│  chatApi.create({title, knowledge_base_ids})     // 创建对话，关联知识库                   │
│  chatApi.sendMessage(chatId, messages)            // 发送消息，SSE 流式接收               │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                                   │
                                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                     FastAPI Chat API                                     │
│                                                                                          │
│  POST /api/chat/{chat_id}/messages                                                       │
│  messages 格式: {"messages": [{"role": "user"|"assistant", "content": "..."}, ...]}     │
│                                                                                          │
│  返回: StreamingResponse (text/event-stream)                                             │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                                   │
                                                   ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       chat_service.py: generate_response()                                        │
│                                                                                                                │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │  Step 1: 持久化消息到 MySQL                                                                          │ │
│  │    user_message = Message(role="user", content=query)                                               │ │
│  │    bot_message = Message(role="assistant", content="")  // 占位符，后续更新                            │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                   │                                                               │
│                                                   ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │  Step 2: 加载知识库和向量存储                                                                          │ │
│  │    knowledge_bases = db.query(KnowledgeBase).filter(id.in_(kb_ids)).all()                            │ │
│  │    embeddings = EmbeddingsFactory.create()                                                           │ │
│  │    for kb in knowledge_bases:                                                                       │ │
│  │      vector_store = VectorStoreFactory.create(collection_name=f"kb_{kb.id}")                          │ │
│  │      vector_stores.append(vector_store)                                                               │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                   │                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │  Step 3: ⚠️ 只用第一个知识库的检索器（多知识库未实现）                                                   │ │
│  │    retriever = vector_stores[0].as_retriever()  // chat_service.py:99                                │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                   │                                                               │
│                                                   ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │  Step 4: 初始化 LLM                                                                                   │ │
│  │    llm = LLMFactory.create()  // 支持 OpenAI / DeepSeek / Ollama                                       │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                   │                                                               │
│                                                   ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │  Step 5: 历史感知问题重写 (create_history_aware_retriever)                                              │ │
│  │                                                                                                       │ │
│  │  系统提示词:                                                                                          │ │
│  │  "Given a chat history and the latest user question which might reference context                      │ │
│  │   in the chat history, formulate a standalone question which can be understood                          │ │
│  │   without the chat history. Do NOT answer the question, just reformulate it if needed."                │ │
│  │                                                                                                       │ │
│  │  例: 历史: "法国的首都是什么？" → 用户: "那里说什么语言？"                                                │ │
│  │       重写: "法国首都是哪里？那里说什么语言？"                                                           │ │
│  │                                                                                                       │ │
│  │  retriever = create_history_aware_retriever(llm, base_retriever, contextualize_prompt)               │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                   │                                                               │
│                                                   ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │  Step 6: 构建 QA 链提示词                                                                              │ │
│  │                                                                                                       │ │
│  │  系统提示词 (qa_system_prompt):                                                                        │ │
│  │  "You are given a user question, and please write clean, concise and accurate answer.                  │ │
│  │   You will be given related contexts numbered sequentially starting from 1.                              │ │
│  │   Please cite them using [citation:N] at the end of each sentence where applicable.                     │ │
│  │   ... Remember: Cite contexts by their position number..."                                             │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                   │                                                               │
│                                                   ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │  Step 7: 构建 RAG 链并流式执行                                                                          │ │
│  │                                                                                                       │ │
│  │  rag_chain = create_retrieval_chain(history_aware_retriever, question_answer_chain)                   │ │
│  │                                                                                                       │ │
│  │  async for chunk in rag_chain.astream({"input": query, "chat_history": chat_history}):                 │ │
│  │    if "context" in chunk:                                                                             │ │
│  │      // Base64 编码的引用上下文                                                                        │ │
│  │      yield f"data: {json.dumps({'text': base64_context + '__LLM_RESPONSE__'})}\n"                     │ │
│  │    if "answer" in chunk:                                                                             │ │
│  │      // LLM 回答分块                                                                                  │ │
│  │      yield f"data: {json.dumps({'text': answer_chunk})}\n"                                            │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                   │                                                               │
│                                                   ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │  Step 8: 更新 AI 消息到数据库                                                                          │ │
│  │    bot_message.content = full_response  // 包含 base64 上下文 + LLM 回答                                 │ │
│  │    db.commit()                                                                                       │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 核心代码

### 1. 创建对话 (`backend/app/api/api_v1/chat.py`)

```python
@router.post("/", response_model=ChatResponse)
def create_chat(
    *,
    db: Session = Depends(get_db),
    chat_in: ChatCreate,
    current_user: User = Depends(get_current_user)
) -> Any:
    # 校验所有知识库存在且属于当前用户
    knowledge_bases = (
        db.query(KnowledgeBase)
        .filter(
            KnowledgeBase.id.in_(chat_in.knowledge_base_ids),
            KnowledgeBase.user_id == current_user.id,
        )
        .all()
    )
    if len(knowledge_bases) != len(chat_in.knowledge_base_ids):
        raise HTTPException(status_code=400, detail="未找到一个或多个知识库")

    # 创建对话并关联知识库（多对多）
    chat = Chat(title=chat_in.title, user_id=current_user.id)
    chat.knowledge_bases = knowledge_bases
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return chat
```

### 2. 发送消息 (`backend/app/api/api_v1/chat.py`)

```python
@router.post("/{chat_id}/messages")
async def create_message(
    *,
    db: Session = Depends(get_db),
    chat_id: int,
    messages: dict,
    current_user: User = Depends(get_current_user)
) -> StreamingResponse:
    # 加载对话及关联的知识库
    chat = (
        db.query(Chat)
        .options(joinedload(Chat.knowledge_bases))
        .filter(Chat.id == chat_id, Chat.user_id == current_user.id)
        .first()
    )
    if not chat:
        raise HTTPException(status_code=404, detail="未找到聊天")

    # 取出最后一条用户消息作为当前问题
    last_message = messages["messages"][-1]
    if last_message["role"] != "user":
        raise HTTPException(status_code=400, detail="最后一条消息必须来自用户")

    knowledge_base_ids = [kb.id for kb in chat.knowledge_bases]

    # SSE 流式响应
    async def response_stream():
        async for chunk in generate_response(
            query=last_message["content"],
            messages=messages,
            knowledge_base_ids=knowledge_base_ids,
            chat_id=chat_id,
            db=db,
        ):
            yield chunk

    return StreamingResponse(
        response_stream(),
        media_type="text/event-stream",
    )
```

### 3. RAG 核心逻辑 (`backend/app/services/chat_service.py`)

```python
# ⚠️ 全局调试标志，生产环境应关闭
set_verbose(True)   # chat_service.py:38
set_debug(True)     # chat_service.py:39

async def generate_response(
    query: str, messages: dict, knowledge_base_ids: List[int], chat_id: int, db: Session
) -> AsyncGenerator[str, None]:
    # 1. 持久化用户消息和占位 AI 消息
    user_message = Message(content=query, role="user", chat_id=chat_id)
    db.add(user_message)
    db.commit()

    bot_message = Message(content="", role="assistant", chat_id=chat_id)
    db.add(bot_message)
    db.commit()

    # 2. 加载知识库和向量存储
    knowledge_bases = (
        db.query(KnowledgeBase)
        .filter(KnowledgeBase.id.in_(knowledge_base_ids))
        .all()
    )

    embeddings = EmbeddingsFactory.create()

    vector_stores = []
    for kb in knowledge_bases:
        documents = db.query(Document).filter(Document.knowledge_base_id == kb.id).all()
        if documents:
            vector_store = VectorStoreFactory.create(
                store_type=settings.VECTOR_STORE_TYPE,
                collection_name=f"kb_{kb.id}",
                embedding_function=embeddings,
            )
            vector_stores.append(vector_store)

    if not vector_stores:
        error_msg = "我没有任何知识基础来帮助回答你的问题。"
        yield f"data: {json.dumps({'text': error_msg})}\n"
        yield "data: [DONE]\n"
        bot_message.content = error_msg
        db.commit()
        return

    # 3. ⚠️ 只用第一个知识库的检索器（多库检索未实现）
    retriever = vector_stores[0].as_retriever()

    llm = LLMFactory.create()

    # 4. 历史感知问题重写
    contextualize_q_system_prompt = (
        "Given a chat history and the latest user question "
        "which might reference context in the chat history, "
        "formulate a standalone question which can be understood "
        "without the chat history. Do NOT answer the question, just "
        "reformulate it if needed and otherwise return it as is."
    )
    contextualize_q_prompt = ChatPromptTemplate.from_messages([
        ("system", contextualize_q_system_prompt),
        MessagesPlaceholder("chat_history"),
        ("human", "{input}"),
    ])

    history_aware_retriever = create_history_aware_retriever(
        llm, retriever, contextualize_q_prompt
    )

    # 5. QA 系统提示
    qa_system_prompt = (
        "You are given a user question, and please write clean, concise and accurate answer to the question. "
        "You will be given related contexts numbered sequentially starting from 1. "
        "Each context has an implicit reference number based on its position in the array (first context is 1, second is 2, etc.). "
        "Please use these contexts and cite them using the format [citation:x] at the end of each sentence where applicable. "
        "Your answer must be correct, accurate and written by an expert using an unbiased and professional tone. "
        "Please limit to 1024 tokens. Do not give any information that is not related to the question, and do not repeat. "
        "Say 'information is missing on' followed by the related topic, if the given context do not provide sufficient information. "
        "If a sentence draws from multiple contexts, please list all applicable citations, like [citation:1][citation:2]. "
        "Other than code and specific names and citations, your answer must be written in the same language as the question. "
        "Be concise.\n\nContext: {context}\n\n"
        "Remember: Cite contexts by their position number (1 for first context, 2 for second, etc.)..."
    )
    qa_prompt = ChatPromptTemplate.from_messages([
        ("system", qa_system_prompt),
        MessagesPlaceholder("chat_history"),
        ("human", "{input}"),
    ])

    question_answer_chain = create_stuff_documents_chain(
        llm, qa_prompt, document_variable_name="context"
    )

    rag_chain = create_retrieval_chain(history_aware_retriever, question_answer_chain)

    # 6. 构建 chat_history
    chat_history = []
    for message in messages["messages"]:
        if message["role"] == "user":
            chat_history.append(HumanMessage(content=message["content"]))
        elif message["role"] == "assistant":
            if "__LLM_RESPONSE__" in message["content"]:
                message["content"] = message["content"].split("__LLM_RESPONSE__")[-1]
            chat_history.append(AIMessage(content=message["content"]))

    # 7. 流式执行 RAG 链
    full_response = ""
    async for chunk in rag_chain.astream({"input": query, "chat_history": chat_history}):
        if "context" in chunk:
            # Base64 编码引用上下文
            serializable_context = []
            for context in chunk["context"]:
                serializable_doc = {
                    "page_content": context.page_content,
                    "metadata": context.metadata,
                }
                serializable_context.append(serializable_doc)

            escaped_context = json.dumps({"context": serializable_context})
            base64_context = base64.b64encode(escaped_context.encode()).decode()
            separator = "__LLM_RESPONSE__"
            yield f"data: {json.dumps({'text': base64_context + separator})}\n"
            full_response += base64_context + separator

        if "answer" in chunk:
            answer_chunk = chunk["answer"]
            full_response += answer_chunk
            yield f"data: {json.dumps({'text': answer_chunk})}\n"

    # 8. 更新 AI 消息
    bot_message.content = full_response
    db.commit()
```

---

## SSE 流格式

后端分两次 yield：

```
data: {"text": "Base64(JSON({context: [...]}))__LLM_RESPONSE__"}

data: {"text": "回答的第一部分..."}
data: {"text": "回答的第二部分..."}
data: {"text": "..."}
data: [DONE]
```

前端解析逻辑（`dashboard/chat/page.tsx`）：
1. 收到 `__LLM_RESPONSE__` 前的 Base64 内容 → decode → citations 数组
2. 后续内容累积为 LLM 回答文本
3. 解析 `[citation:N]` 格式的引用标记

---

## 数据库模型

```python
# backend/app/models/chat.py
class Chat(Base, TimestampMixin):
    __tablename__ = "chats"
    id = Column(Integer, primary_key=True)
    title = Column(String(255))
    user_id = Column(Integer, ForeignKey("users.id"))
    knowledge_bases = relationship(
        "KnowledgeBase",
        secondary="chat_knowledge_bases",  # 多对多关联表
        back_populates="chats"
    )
    messages = relationship("Message", back_populates="chat", cascade="all, delete-orphan")

class Message(Base, TimestampMixin):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True)
    chat_id = Column(Integer, ForeignKey("chats.id"))
    role = Column(String(50))      # "user" | "assistant"
    content = Column(LONGTEXT)     # 包含 base64 上下文 + LLM 回答
```

---

## LLM 支持

通过 `LLMFactory.create()` 支持多种 LLM：

| LLM 类型 | 配置键 | 说明 |
|----------|--------|------|
| OpenAI | `OPENAI_API_KEY` | GPT-4o / GPT-4-turbo |
| DeepSeek | `DEEPSEEK_API_KEY` | deepseek-chat |
| Ollama | `OLLAMA_BASE_URL` | 本地部署模型 |
| ZhipuAI | `ZHIPUAI_API_KEY` | 智谱 GLM |

---

## 业务改进建议

### 🔴 高优先级

| 问题 | 风险 | 建议 |
|------|------|------|
| **只使用第一个知识库的检索器** (`chat_service.py:99`) | 多知识库对话时其他 KB 完全被忽略，检索结果不完整 | 实现多库检索融合，如 RRF（Reciprocal Rank Fusion）算法合并多个 retriever 的结果 |
| **`set_verbose` 和 `set_debug` 全局标志未关闭** (`chat_service.py:38-39`) | 生产环境日志量巨大，影响性能，可能泄露内部信息 | 删除或注释这两行，仅在调试时启用 |
| **引用 `[citation:N]` 未在 UI 可点击** | 用户无法方便地跳转到引用来源 | 前端解析 `[citation:N]` 并渲染为可点击链接，滚动到对应引用位置 |

### 🟡 中优先级

| 问题 | 风险 | 建议 |
|------|------|------|
| **完整 base64 上下文随消息存储在 `Message.content`** | 数据库占用过大，消息列表查询慢 | 上下文应单独存储（如 `Message.context` 或独立表），只将纯文本回答存入 content |
| **无对话标题自动生成** | 用户需手动输入标题 | 首次消息后调用 LLM 生成简短标题 |
| **无引用来源文档高亮/定位** | 引用上下文无法追溯到原始文档 | 返回时附带 `source` 字段（文档名+chunk位置），前端可跳转 |
| **历史对话重载时上下文可能超限** | 长对话时 token 消耗成倍增长 | 实现对话历史截断策略（如保留最近 N 条消息或 token 上限） |

### 🟢 低优先级

| 问题 | 建议 |
|------|------|
| 支持流式中断（用户取消生成） | 添加 AbortController 支持 |
| 支持重新生成（不改变问题） | 提供重新生成按钮，复用历史重写后的问题 |
| RAG 检索结果无相关性阈值过滤 | 设置最低相似度分数，过低结果不参与生成 |
| 对话导出（Markdown/PDF） | 支持将对话历史导出为文档 |
