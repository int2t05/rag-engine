"""
对话 API
========
对话的 CRUD 以及发送消息获取 RAG 回答。
发送消息接口返回 SSE 流，前端通过 useChat 接收流式内容。
"""

from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from starlette.requests import Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import require_active_ai_runtime
from app.core.exceptions import BadRequestError, ResourceNotFoundError
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.ai_runtime import AiRuntimeSettings
from app.schemas.chat import (
    ChatCreate,
    ChatResponse,
    StreamMessagesRequest,
)
from app.shared.ai_runtime_context import reset_ai_runtime_token, set_ai_runtime_token
from app.modules.chat import (
    batch_delete_chats,
    create_chat,
    delete_chat,
    get_chat,
    get_stream_context,
    list_chats,
)
from app.modules.chat.rag_service import generate_response

router = APIRouter()

_BATCH_DELETE_CHATS_MAX = 100


class BatchDeleteChatsRequest(BaseModel):
    """批量删除对话请求体"""

    chat_ids: List[int]


@router.post("", response_model=ChatResponse)
def create_chat_endpoint(
    *,
    db: Session = Depends(get_db),
    chat_in: ChatCreate,
    current_user: User = Depends(get_current_user),
) -> Any:
    """创建新对话；校验知识库均属于当前用户。"""
    try:
        return create_chat(db, current_user.id, chat_in)
    except BadRequestError as e:
        raise HTTPException(status_code=400, detail=e.detail) from e


@router.get("", response_model=List[ChatResponse])
def list_chats_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """当前用户的对话列表（分页）。"""
    return list_chats(db, current_user.id, skip=skip, limit=limit)


@router.post("/batch-delete")
def batch_delete_chats_endpoint(
    *,
    db: Session = Depends(get_db),
    body: BatchDeleteChatsRequest,
    current_user: User = Depends(get_current_user),
) -> Any:
    """批量删除对话（级联消息）。"""
    try:
        return batch_delete_chats(
            db, current_user.id, body.chat_ids, _BATCH_DELETE_CHATS_MAX
        )
    except BadRequestError as e:
        raise HTTPException(status_code=400, detail=e.detail) from e


@router.get("/{chat_id}", response_model=ChatResponse)
def get_chat_endpoint(
    *,
    db: Session = Depends(get_db),
    chat_id: int,
    current_user: User = Depends(get_current_user),
) -> Any:
    """单条对话详情。"""
    try:
        return get_chat(db, current_user.id, chat_id)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from e


@router.post("/{chat_id}/messages")
async def create_message_endpoint(
    *,
    request: Request,
    db: Session = Depends(get_db),
    chat_id: int,
    body: StreamMessagesRequest,
    current_user: User = Depends(get_current_user),
    rt: AiRuntimeSettings = Depends(require_active_ai_runtime),
) -> StreamingResponse:
    """
    发送消息并获取 RAG 流式回答（SSE）。

    业务流程：
    1. 依赖注入：db / current_user / rt（AI 运行时配置）
    2. 权限校验：查询对话归属，组装历史消息上下文
    3. 流式生成：yield SSE 格式的增量回答
    4. 上下文清理：流结束后重置 AI 运行时 token
    """

    # 1. 获取对话上下文：验证用户对对话的所有权
    try:
        _, knowledge_base_ids, messages, rag_options = get_stream_context(
            db, current_user.id, chat_id, body
        )
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from e
    except BadRequestError as e:
        raise HTTPException(status_code=400, detail=e.detail) from e

    # 2. 定义客户端断开连接检查函数（供 generate_response 轮询）
    async def disconnect_check() -> bool:
        return await request.is_disconnected()

    # 3. 流式生成器：在同一上下文中设置 / 重置 AI runtime token
    # yield 每个 SSE chunk 给客户端，直到 LLM 输出完毕或客户端断开
    async def response_stream():
        # 将 rt 存入 ContextVar，使其在异步调用链中全局可访问
        tok = set_ai_runtime_token(rt)
        try:
            async for chunk in generate_response(
                query=body.messages[-1].content,  # 用户当前输入作为 query
                messages=messages,  # 整理后的历史消息（含 system prompt）
                knowledge_base_ids=knowledge_base_ids,  # RAG 检索使用的知识库列表
                chat_id=chat_id,  # 关联对话 ID
                db=db,  # 复用已有会话（注意事务边界）
                client_disconnected=disconnect_check,  # 断开检测（节省服务端资源）
                rag_options=rag_options,
            ):
                yield chunk
        finally:
            # 无论正常结束还是异常中断，必须重置 token，避免 ContextVar 污染后续请求
            reset_ai_runtime_token(tok)

    # 4. 返回 SSE 流响应
    return StreamingResponse(
        response_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.delete("/{chat_id}")
def delete_chat_endpoint(
    *,
    db: Session = Depends(get_db),
    chat_id: int,
    current_user: User = Depends(get_current_user),
) -> Any:
    """删除对话。"""
    try:
        delete_chat(db, current_user.id, chat_id)
        return {"status": "success"}
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from e
