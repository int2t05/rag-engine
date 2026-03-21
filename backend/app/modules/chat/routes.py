"""
对话 API
========
对话的 CRUD 以及发送消息获取 RAG 回答。
发送消息接口返回 SSE 流，前端通过 useChat 接收流式内容。
"""

from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
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
    db: Session = Depends(get_db),
    chat_id: int,
    body: StreamMessagesRequest,
    current_user: User = Depends(get_current_user),
    rt: AiRuntimeSettings = Depends(require_active_ai_runtime),
) -> StreamingResponse:
    """
    发送消息并获取 RAG 流式回答（SSE）。
    rt 由依赖注入；set/reset 必须在流式生成器同一上下文中完成。
    """
    try:
        _, knowledge_base_ids, messages = get_stream_context(
            db, current_user.id, chat_id, body
        )
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from e
    except BadRequestError as e:
        raise HTTPException(status_code=400, detail=e.detail) from e

    async def response_stream():
        tok = set_ai_runtime_token(rt)
        try:
            async for chunk in generate_response(
                query=body.messages[-1].content,
                messages=messages,
                knowledge_base_ids=knowledge_base_ids,
                chat_id=chat_id,
                db=db,
            ):
                yield chunk
        finally:
            reset_ai_runtime_token(tok)

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
