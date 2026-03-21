"""
对话 API
========
对话的 CRUD 以及发送消息获取 RAG 回答。
发送消息接口返回 SSE 流，前端通过 useChat 接收流式内容。
"""

from typing import List, Any
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from app.db.session import get_db
from app.models.user import User
from app.models.chat import Chat, Message
from app.models.knowledge import KnowledgeBase
from app.schemas.chat import (
    ChatCreate,
    ChatResponse,
    ChatUpdate,
    MessageCreate,
    MessageResponse,
)
from app.core.security import get_current_user
from app.schemas.ai_runtime import AiRuntimeSettings
from app.services.chat_service import generate_response
from app.services.ai_runtime_context import reset_ai_runtime_token, set_ai_runtime_token
from app.api.deps import require_active_ai_runtime

router = APIRouter()

_BATCH_DELETE_CHATS_MAX = 100


class BatchDeleteChatsRequest(BaseModel):
    """批量删除对话请求体"""

    chat_ids: List[int]


@router.post("", response_model=ChatResponse)
def create_chat(
    *,
    db: Session = Depends(get_db),
    chat_in: ChatCreate,
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    创建新对话
    校验 knowledge_base_ids 均存在且属于当前用户，建立多对多关联
    """
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

    chat = Chat(
        title=chat_in.title,
        user_id=current_user.id,
    )
    chat.knowledge_bases = knowledge_bases

    db.add(chat)
    db.commit()
    db.refresh(chat)
    return chat


@router.get("", response_model=List[ChatResponse])
def get_chats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """获取当前用户的对话列表，支持分页"""
    chats = (
        db.query(Chat)
        .filter(Chat.user_id == current_user.id)
        .offset(skip)
        .limit(limit)
        .all()
    )
    return chats


@router.post("/batch-delete")
def batch_delete_chats(
    *,
    db: Session = Depends(get_db),
    body: BatchDeleteChatsRequest,
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    批量删除对话（仅当前用户拥有的）；级联删除消息。
    """
    raw_ids = list(dict.fromkeys(body.chat_ids))
    ids = [i for i in raw_ids if i > 0]
    if not ids:
        raise HTTPException(status_code=400, detail="请提供至少一个有效的 chat_id")
    if len(ids) > _BATCH_DELETE_CHATS_MAX:
        raise HTTPException(
            status_code=400,
            detail=f"单次最多删除 {_BATCH_DELETE_CHATS_MAX} 个对话",
        )

    chats = (
        db.query(Chat)
        .filter(Chat.id.in_(ids), Chat.user_id == current_user.id)
        .all()
    )
    deleted_ids = [c.id for c in chats]
    for c in chats:
        db.delete(c)
    db.commit()

    not_found = [i for i in ids if i not in deleted_ids]
    return {"deleted": deleted_ids, "not_found": not_found}


@router.get("/{chat_id}", response_model=ChatResponse)
def get_chat(
    *,
    db: Session = Depends(get_db),
    chat_id: int,
    current_user: User = Depends(get_current_user)
) -> Any:
    """获取单条对话详情"""
    chat = (
        db.query(Chat)
        .filter(Chat.id == chat_id, Chat.user_id == current_user.id)
        .first()
    )
    if not chat:
        raise HTTPException(status_code=404, detail="未找到聊天")
    return chat


@router.post("/{chat_id}/messages")
async def create_message(
    *,
    db: Session = Depends(get_db),
    chat_id: int,
    messages: dict,
    current_user: User = Depends(get_current_user),
    rt: AiRuntimeSettings = Depends(require_active_ai_runtime),
) -> StreamingResponse:
    """
    发送消息并获取 RAG 流式回答

    messages 格式：{"messages": [{"role": "user|assistant", "content": "..."}, ...]}
    会取最后一条 user 消息作为当前问题，连同历史一起传给 chat_service
    返回 SSE 流，格式符合 Vercel AI SDK
    """
    chat = (
        db.query(Chat)
        .options(joinedload(Chat.knowledge_bases))
        .filter(Chat.id == chat_id, Chat.user_id == current_user.id)
        .first()
    )
    if not chat:
        raise HTTPException(status_code=404, detail="未找到聊天")

    last_message = messages["messages"][-1]
    if last_message["role"] != "user":
        raise HTTPException(status_code=400, detail="最后一条消息必须来自用户")

    knowledge_base_ids = [kb.id for kb in chat.knowledge_bases]

    # rt 由 Depends(require_active_ai_runtime) 保证；set/reset 必须在流式生成器同一上下文中
    async def response_stream():
        tok = set_ai_runtime_token(rt)
        try:
            async for chunk in generate_response(
                query=last_message["content"],
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
def delete_chat(
    *,
    db: Session = Depends(get_db),
    chat_id: int,
    current_user: User = Depends(get_current_user)
) -> Any:
    """删除对话（级联删除消息）"""
    chat = (
        db.query(Chat)
        .filter(Chat.id == chat_id, Chat.user_id == current_user.id)
        .first()
    )
    if not chat:
        raise HTTPException(status_code=404, detail="未找到聊天")

    db.delete(chat)
    db.commit()
    return {"status": "success"}
