"""
RAG 对话服务（核心）
===================
Native 路径：单次向量检索 → 上下文构建 → LLM 流式生成 → Base64 引用载荷。
可选能力由 `RagOrchestrator` 按前端 `rag_options` 串联（与 LangChain RAG 教程中
检索前/后处理一致：查询变换、多查询、混合检索、重排、父子块展开等）。

流程概览：
1. 保存用户消息和占位 AI 消息到数据库
2. 为每个有文档的知识库创建向量存储
3. 构建 RagContext，执行模块化检索流水线（默认等价于纯向量 top_k）
4. 将检索结果作为上下文，构建 QA 提示词，要求 LLM 用 [citation:N] 引用
5. 流式返回：先返回 Base64 编码的引用上下文，再逐块返回 LLM 回答
6. 将完整回答写回 AI 消息的 content
"""

import json
import logging
import base64
from typing import List, AsyncGenerator, Any, Awaitable, Callable, Optional

import httpx
from openai import APIConnectionError, APITimeoutError
from sqlalchemy.orm import Session
from langchain_core.prompts import (
    ChatPromptTemplate,
    MessagesPlaceholder,
)
from langchain_core.messages import HumanMessage, AIMessage
from langchain_core.output_parsers import StrOutputParser

from app.models.chat import Message
from app.models.knowledge import KnowledgeBase, Document
from app.shared.vector_store import VectorStoreFactory
from app.shared.embedding.embedding_factory import EmbeddingsFactory
from app.shared.llm.llm_factory import LLMFactory
from app.schemas.rag_pipeline import RagPipelineOptions
from app.modules.chat.rag.context import RagContext
from app.modules.chat.rag.orchestrator import RagOrchestrator

logger = logging.getLogger(__name__)

_CANCELLED_SUFFIX = "\n\n（已停止生成）"
_STOPPED_ONLY = "（已停止生成）"


def _deepest_cause(exc: BaseException) -> BaseException:
    """返回最底层的异常。"""
    cur: BaseException = exc
    while getattr(cur, "__cause__", None) is not None:
        cur = cur.__cause__  # type: ignore[assignment]
    return cur


def _is_llm_connection_error(exc: BaseException) -> bool:
    """OpenAI / httpx 连接层失败（非业务 4xx/5xx 正文）。"""
    if isinstance(exc, (APIConnectionError, APITimeoutError)):
        return True
    cur: Optional[BaseException] = exc
    while cur is not None:
        if isinstance(
            cur,
            (
                httpx.ConnectError,
                httpx.ConnectTimeout,
                httpx.ReadTimeout,
                httpx.WriteTimeout,
                httpx.PoolTimeout,
            ),
        ):
            return True
        cur = cur.__cause__
    return False


def _format_rag_user_message(exc: BaseException) -> str:
    """将 LLM 调用异常转为面向用户的中文说明（不暴露堆栈）。"""
    root = _deepest_cause(exc)
    if isinstance(exc, APIConnectionError) or isinstance(root, httpx.ConnectError):
        return (
            "无法连接到模型服务（网络不可达或 TLS 失败）。请检查："
            "① 模型配置中的 API Base 是否可在本机访问；"
            "② 是否需要设置 HTTP_PROXY / HTTPS_PROXY；"
            "③ 系统或公司代理是否拦截了该 HTTPS 请求。"
        )
    if isinstance(exc, APITimeoutError) or isinstance(
        root, (httpx.TimeoutException, httpx.ConnectTimeout)
    ):
        return "连接模型服务超时，请稍后重试或检查网络与 API 地址。"
    return f"生成回答时出错：{exc}"


def _format_docs(docs: List[Any]) -> str:
    """将检索到的文档列表格式化为上下文字符串"""
    return "\n\n".join(
        f"[citation:{i+1}]\n{doc.page_content}" for i, doc in enumerate(docs)
    )


def _serialize_context(context_docs: List[Any]) -> str:
    """将上下文文档列表序列化为 Base64 编码的 JSON"""
    serializable = [
        {"page_content": doc.page_content, "metadata": dict(doc.metadata or {})}
        for doc in context_docs
    ]
    # default=str：避免 metadata 中含 datetime 等无法 JSON 化的对象导致整段引用失败
    return json.dumps({"context": serializable}, ensure_ascii=False, default=str)


def _stream_chunk_to_text(chunk: Any) -> str:
    """将 LCEL / 聊天模型流式块统一为纯文本（兼容 str 与带 content 的消息块）。"""
    if chunk is None:
        return ""
    if isinstance(chunk, str):
        return chunk
    content = getattr(chunk, "content", None)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: List[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                t = block.get("text")
                if t is not None:
                    parts.append(str(t))
                else:
                    parts.append(str(block))
            else:
                parts.append(str(block))
        return "".join(parts)
    return str(chunk)


async def generate_response(
    query: str,
    messages: dict,
    knowledge_base_ids: List[int],
    chat_id: int,
    db: Session,
    client_disconnected: Optional[Callable[[], Awaitable[bool]]] = None,
    rag_options: Optional[RagPipelineOptions] = None,
) -> AsyncGenerator[str, None]:
    """
    生成 RAG 流式回答

    rag_options:
        未传或 None 时使用默认 Native：top_k=4、无查询重写、仅首个有向量数据的库。
    """

    async def _client_gone() -> bool:
        """检查客户端是否已断开"""
        if client_disconnected is None:
            return False
        try:
            return await client_disconnected()
        except Exception:
            return False

    stream_finished_ok = False
    opts = rag_options or RagPipelineOptions()

    try:
        # 1. 持久化用户消息和占位 AI 消息
        user_message = Message(content=query, role="user", chat_id=chat_id)
        db.add(user_message)
        db.commit()

        bot_message = Message(content="", role="assistant", chat_id=chat_id)
        db.add(bot_message)
        db.commit()

        # 2. 加载知识库和向量存储（仅包含有已入库文档的库）
        knowledge_bases = (
            db.query(KnowledgeBase)
            .filter(KnowledgeBase.id.in_(knowledge_base_ids))
            .all()
        )

        embeddings = EmbeddingsFactory.create()

        kb_ids_for_store: List[int] = []
        vector_stores: List[Any] = []
        for kb in knowledge_bases:
            documents = (
                db.query(Document).filter(Document.knowledge_base_id == kb.id).all()
            )
            if documents:
                vector_store = VectorStoreFactory.create(
                    collection_name=f"kb_{kb.id}",
                    embedding_function=embeddings,
                )
                logger.debug("集合 %s 文档数: %d", f"kb_{kb.id}", vector_store.count())
                kb_ids_for_store.append(kb.id)
                vector_stores.append(vector_store)

        if not vector_stores:
            error_msg = "我没有任何知识基础来帮助回答你的问题。"
            yield f"data: {json.dumps({'text': error_msg}, ensure_ascii=False)}\n"
            yield "data: [DONE]\n"  # 结束标记
            bot_message.content = error_msg  # type: ignore
            db.commit()
            stream_finished_ok = True
            return

        llm = LLMFactory.create()

        qa_prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "You are given a user question, and please write clean, concise and accurate answer to the question. "
                    "You will be given a set of related contexts to the question, which are numbered sequentially starting from 1. "
                    "Each context has an implicit reference number based on its position in the array (first context is 1, second is 2, etc.). "
                    "Please use these contexts and cite them using the format [citation:x] at the end of each sentence where applicable. "
                    "Your answer must be correct, accurate and written by an expert using an unbiased and professional tone. "
                    "Please limit to 1024 tokens. Do not give any information that is not related to the question, and do not repeat. "
                    "Say 'information is missing on' followed by the related topic, if the given context do not provide sufficient information. "
                    "If a sentence draws from multiple contexts, please list all applicable citations, like [citation:1][citation:2]. "
                    "Other than code and specific names and citations, your answer must be written in the same language as the question. "
                    "Be concise.\n\n{context}\n\n"
                    "Remember: Cite contexts by their position number (1 for first context, 2 for second, etc.) and don't blindly "
                    "repeat the contexts verbatim.",
                ),
                MessagesPlaceholder("chat_history"),
                ("human", "{question}"),
            ]
        )

        answer_chain = qa_prompt | llm | StrOutputParser()

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

        if await _client_gone():
            bot_message.content = _STOPPED_ONLY  # type: ignore
            db.commit()
            yield "data: [DONE]\n"
            return

        # 3. 模块化检索（Native + 可选：重写 / 多路 / 多库 / 混合 / 父子 / 重排）
        ctx = RagContext(
            query=query,
            messages=messages,
            chat_history=chat_history,
            knowledge_base_ids=knowledge_base_ids,
            db=db,
            knowledge_bases=knowledge_bases,
            kb_ids_for_store=kb_ids_for_store,
            vector_stores=vector_stores,
            options=opts,
        )
        await RagOrchestrator.run_retrieval_pipeline(ctx)
        retrieved_docs = ctx.retrieved_docs

        full_response = ""
        base64_context = base64.b64encode(
            _serialize_context(retrieved_docs).encode()
        ).decode()
        separator = "__LLM_RESPONSE__"
        if await _client_gone():
            bot_message.content = _STOPPED_ONLY  # type: ignore
            db.commit()
            yield "data: [DONE]\n"
            return

        yield f"data: {json.dumps({'text': base64_context + separator}, ensure_ascii=False)}\n"
        full_response += base64_context + separator

        async for chunk in answer_chain.astream(
            {
                "context": _format_docs(retrieved_docs),
                "question": query,
                "chat_history": chat_history,
            }
        ):
            if await _client_gone():
                if full_response.strip():
                    bot_message.content = full_response + _CANCELLED_SUFFIX  # type: ignore
                else:
                    bot_message.content = _STOPPED_ONLY  # type: ignore
                db.commit()
                yield "data: [DONE]\n"
                return
            piece = _stream_chunk_to_text(chunk)
            if not piece:
                continue
            full_response += piece
            try:
                yield f"data: {json.dumps({'text': piece}, ensure_ascii=False)}\n"
            except (GeneratorExit, ConnectionError, BrokenPipeError, OSError):
                if full_response.strip():
                    bot_message.content = full_response + _CANCELLED_SUFFIX  # type: ignore
                else:
                    bot_message.content = _STOPPED_ONLY  # type: ignore
                db.commit()
                raise

        bot_message.content = full_response  # type: ignore
        db.commit()
        stream_finished_ok = True

    except Exception as e:
        error_message = _format_rag_user_message(e)
        if _is_llm_connection_error(e):
            logger.warning("RAG LLM 连接失败: %s", e)
        else:
            logger.exception("RAG 响应生成失败")
        yield f"data: {json.dumps({'text': error_message}, ensure_ascii=False)}\n"

        db.commit()
        if "bot_message" in locals():
            bot_message.content = error_message  # type: ignore
            db.commit()
    finally:
        if (
            not stream_finished_ok
            and "bot_message" in locals()
            and bot_message is not None
        ):
            content = getattr(bot_message, "content", None)
            if content is None or (isinstance(content, str) and not content.strip()):
                try:
                    bot_message.content = _STOPPED_ONLY  # type: ignore
                    db.commit()
                except Exception:
                    logger.exception("写入中断占位消息失败")
        db.close()
