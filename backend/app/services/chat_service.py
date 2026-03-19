"""
RAG 对话服务（核心）
===================
实现完整的 RAG 流程：历史感知检索 → 上下文构建 → LLM 流式生成 → 引用格式化返回。

流程概览：
1. 保存用户消息和占位 AI 消息到数据库
2. 为每个知识库创建向量存储，构建检索器
3. 使用 LangChain 的 create_history_aware_retriever：根据对话历史重写问题
4. 用重写后的问题检索相关文档片段
5. 将检索结果作为上下文，构建 QA 提示词，要求 LLM 用 [citation:N] 引用
6. 流式返回：先返回 Base64 编码的引用上下文，再逐块返回 LLM 回答
7. 将完整回答写回 AI 消息的 content
"""

import json
import base64
from typing import List, AsyncGenerator
from sqlalchemy.orm import Session
from langchain_openai import ChatOpenAI
from langchain.chains import create_history_aware_retriever, create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import (
    ChatPromptTemplate,
    MessagesPlaceholder,
    PromptTemplate,
)
from langchain_core.messages import HumanMessage, AIMessage
from app.core.config import settings
from app.models.chat import Message
from app.models.knowledge import KnowledgeBase, Document
from langchain.globals import set_verbose, set_debug
from app.services.vector_store import VectorStoreFactory
from app.services.embedding.embedding_factory import EmbeddingsFactory
from app.services.llm.llm_factory import LLMFactory

# 设置 LangChain 的 全局调试
set_verbose(True)
set_debug(True)


async def generate_response(
    query: str, messages: dict, knowledge_base_ids: List[int], chat_id: int, db: Session
) -> AsyncGenerator[str, None]:
    """
    生成 RAG 流式回答

    参数：
        query: 用户当前问题
        messages: 完整对话历史
        knowledge_base_ids: 此对话关联的知识库 ID 列表
        chat_id: 对话 ID
        db: 数据库会话

    yield: 符合 Vercel AI SDK 协议的 SSE 文本块 流式传输
    """
    try:
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
            documents = (
                db.query(Document).filter(Document.knowledge_base_id == kb.id).all()
            )
            if documents:
                vector_store = VectorStoreFactory.create(
                    store_type=settings.VECTOR_STORE_TYPE,
                    collection_name=f"kb_{kb.id}",
                    embedding_function=embeddings,
                )
                print(f"集合 {f'kb_{kb.id}'} 计数:", vector_store.count())
                vector_stores.append(vector_store)

        if not vector_stores:
            error_msg = "我没有任何知识基础来帮助回答你的问题。"
            yield f'0:"{error_msg}"\n'
            yield 'd:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n'
            bot_message.content = error_msg  # type: ignore
            db.commit()
            return

        # 3. 使用第一个知识库的检索器（可扩展为多库合并）
        retriever = vector_stores[0].as_retriever()

        llm = LLMFactory.create()

        # 4. 历史感知问题重写：让 LLM 将对话中的指代（如"它"）转化为独立问题
        contextualize_q_system_prompt = (
            "Given a chat history and the latest user question "
            "which might reference context in the chat history, "
            "formulate a standalone question which can be understood "
            "without the chat history. Do NOT answer the question, just "
            "reformulate it if needed and otherwise return it as is."
        )
        contextualize_q_prompt = ChatPromptTemplate.from_messages(
            [
                ("system", contextualize_q_system_prompt),
                MessagesPlaceholder("chat_history"),
                ("human", "{input}"),
            ]
        )

        history_aware_retriever = create_history_aware_retriever(
            llm, retriever, contextualize_q_prompt
        )

        # 5. QA 系统提示：要求引用上下文，使用 [citation:N] 格式
        qa_system_prompt = (
            "You are given a user question, and please write clean, concise and accurate answer to the question. "
            "You will be given a set of related contexts to the question, which are numbered sequentially starting from 1. "
            "Each context has an implicit reference number based on its position in the array (first context is 1, second is 2, etc.). "
            "Please use these contexts and cite them using the format [citation:x] at the end of each sentence where applicable. "
            "Your answer must be correct, accurate and written by an expert using an unbiased and professional tone. "
            "Please limit to 1024 tokens. Do not give any information that is not related to the question, and do not repeat. "
            "Say 'information is missing on' followed by the related topic, if the given context do not provide sufficient information. "
            "If a sentence draws from multiple contexts, please list all applicable citations, like [citation:1][citation:2]. "
            "Other than code and specific names and citations, your answer must be written in the same language as the question. "
            "Be concise.\n\nContext: {context}\n\n"
            "Remember: Cite contexts by their position number (1 for first context, 2 for second, etc.) and don't blindly "
            "repeat the contexts verbatim."
        )
        qa_prompt = ChatPromptTemplate.from_messages(
            [
                ("system", qa_system_prompt),
                MessagesPlaceholder("chat_history"),
                ("human", "{input}"),
            ]
        )

        document_prompt = PromptTemplate.from_template("\n\n- {page_content}\n\n")

        question_answer_chain = create_stuff_documents_chain(
            llm,
            qa_prompt,
            document_variable_name="context",
            document_prompt=document_prompt,
        )

        rag_chain = create_retrieval_chain(
            history_aware_retriever,
            question_answer_chain,
        )

        # 6. 构建 chat_history 供 LangChain 使用
        chat_history = []
        for message in messages["messages"]:
            if message["role"] == "user":
                chat_history.append(HumanMessage(content=message["content"]))
            elif message["role"] == "assistant":
                if "__LLM_RESPONSE__" in message["content"]:
                    message["content"] = message["content"].split("__LLM_RESPONSE__")[
                        -1
                    ]
                chat_history.append(AIMessage(content=message["content"]))

        full_response = ""
        async for chunk in rag_chain.astream(  # 异步流式，逐步返回
            {"input": query, "chat_history": chat_history}
        ):
            # 7a. 先流式返回引用上下文（Base64） 序列化
            if "context" in chunk:
                serializable_context = []
                for context in chunk["context"]:  # document对象
                    serializable_doc = {
                        "page_content": context.page_content.replace('"', '\\"'),
                        "metadata": context.metadata,
                    }
                    serializable_context.append(serializable_doc)

                escaped_context = json.dumps({"context": serializable_context})
                base64_context = base64.b64encode(escaped_context.encode()).decode()
                separator = "__LLM_RESPONSE__"

                yield f'0:"{base64_context}{separator}"\n'
                full_response += base64_context + separator

            # 7b. 再流式返回 LLM 回答
            if "answer" in chunk:
                answer_chunk = chunk["answer"]
                full_response += answer_chunk
                escaped_chunk = answer_chunk.replace('"', '\\"').replace("\n", "\\n")
                yield f'0:"{escaped_chunk}"\n'

        # 8. 更新数据库中的 AI 消息
        bot_message.content = full_response  # type: ignore
        db.commit()

    except Exception as e:
        error_message = f"错误生成响应：{str(e)}"
        print(error_message)
        yield "3:{text}\n".format(text=error_message)

        db.commit()
        if "bot_message" in locals():  # 返回一个字典，包含当前作用域的所有局部变量
            bot_message.content = error_message  # type: ignore
            db.commit()
    finally:
        db.close()
