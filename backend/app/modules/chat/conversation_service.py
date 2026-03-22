"""
对话 CRUD 与流式消息前置校验
==========================
路由层只负责 SSE；此处封装 ORM 访问与业务校验。
"""

from __future__ import annotations

from typing import Any, Dict, List, Tuple

from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError, ResourceNotFoundError
from app.models.chat import Chat
from app.modules.chat.repository import ChatRepository
from app.schemas.chat import ChatCreate, StreamMessagesRequest


def create_chat(db: Session, user_id: int, chat_in: ChatCreate) -> Chat:
    """创建对话并关联知识库；若任一知识库不存在或不属于用户则 400。"""
    repo = ChatRepository(db)
    kbs = repo.list_knowledge_bases_for_user(chat_in.knowledge_base_ids, user_id)
    if len(kbs) != len(chat_in.knowledge_base_ids):
        raise BadRequestError("未找到一个或多个知识库")

    chat = Chat(title=chat_in.title, user_id=user_id)
    chat.knowledge_bases = kbs
    repo.add_chat(chat)
    db.commit()
    db.refresh(chat)
    return chat


def list_chats(
    db: Session, user_id: int, skip: int = 0, limit: int = 100
) -> List[Chat]:
    """获取当前用户的对话列表，支持分页"""
    return ChatRepository(db).list_chats_for_user(user_id, skip=skip, limit=limit)


def batch_delete_chats(
    db: Session, user_id: int, chat_ids: List[int], max_batch: int
) -> dict:
    """批量删除对话；若对话不存在或不属于用户则 400。"""
    raw_ids = list(dict.fromkeys(chat_ids))  # 去重，保持顺序
    ids = [i for i in raw_ids if i > 0]
    if not ids:
        raise BadRequestError("请提供至少一个有效的 chat_id")
    if len(ids) > max_batch:
        raise BadRequestError(f"单次最多删除 {max_batch} 个对话")

    repo = ChatRepository(db)
    chats = repo.get_chats_by_ids_for_user(ids, user_id)
    deleted_ids = [c.id for c in chats]
    for c in chats:
        repo.delete_chat(c)
    db.commit()
    not_found = [i for i in ids if i not in deleted_ids]
    return {"deleted": deleted_ids, "not_found": not_found}


def get_chat(db: Session, user_id: int, chat_id: int) -> Chat:
    """获取单条对话详情"""
    chat = ChatRepository(db).get_by_id_for_user(chat_id, user_id)
    if not chat:
        raise ResourceNotFoundError("未找到聊天")
    return chat


def get_stream_context(
    db: Session, user_id: int, chat_id: int, body: StreamMessagesRequest
) -> Tuple[Chat, List[int], Dict[str, Any]]:
    """
    校验消息体并返回对话、知识库 ID 列表、供 generate_response 使用的 messages 字典。
    """
    chat = ChatRepository(db).get_with_knowledge_bases(chat_id, user_id)
    if not chat:
        raise ResourceNotFoundError("未找到聊天")
    if not body.messages:
        raise BadRequestError("messages 不能为空")
    last = body.messages[-1]
    if last.role != "user":
        raise BadRequestError("最后一条消息必须来自用户")
    kb_ids = [kb.id for kb in chat.knowledge_bases]
    messages_dict = {
        "messages": [{"role": m.role, "content": m.content} for m in body.messages]
    }
    return chat, kb_ids, messages_dict


def delete_chat(db: Session, user_id: int, chat_id: int) -> None:
    """删除单条对话"""
    repo = ChatRepository(db)
    chat = repo.get_by_id_for_user(chat_id, user_id)
    if not chat:
        raise ResourceNotFoundError("未找到聊天")
    repo.delete_chat(chat)
    db.commit()
