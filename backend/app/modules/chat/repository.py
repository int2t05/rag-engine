"""
对话（Chat）数据访问
==================
封装 Chat / 与知识库多对多校验相关的查询。
"""

from __future__ import annotations

from typing import List, Optional, Sequence

from sqlalchemy.orm import Session, joinedload

from app.models.chat import Chat
from app.models.knowledge import KnowledgeBase


class ChatRepository:
    """对话仓储。"""

    def __init__(self, db: Session) -> None:
        self.db = db

    def list_knowledge_bases_for_user(
        self, kb_ids: Sequence[int], user_id: int
    ) -> List[KnowledgeBase]:
        """校验并返回用户拥有的、且 ID 在 kb_ids 中的知识库列表。"""
        if not kb_ids:
            return []
        return (
            self.db.query(KnowledgeBase)
            .filter(
                KnowledgeBase.id.in_(kb_ids),
                KnowledgeBase.user_id == user_id,
            )
            .all()
        )

    def add_chat(self, chat: Chat) -> None:
        """添加对话。"""
        self.db.add(chat)

    def list_chats_for_user(
        self, user_id: int, skip: int = 0, limit: int = 100
    ) -> List[Chat]:
        """获取当前用户的对话列表，支持分页。"""
        return (
            self.db.query(Chat)
            .filter(Chat.user_id == user_id)
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_chats_by_ids_for_user(
        self, chat_ids: Sequence[int], user_id: int
    ) -> List[Chat]:
        """获取当前用户的对话列表，支持批量查询。"""
        if not chat_ids:
            return []
        return (
            self.db.query(Chat)
            .filter(Chat.id.in_(chat_ids), Chat.user_id == user_id)
            .all()
        )

    def get_by_id_for_user(self, chat_id: int, user_id: int) -> Optional[Chat]:
        """获取当前用户的对话。"""
        return (
            self.db.query(Chat)
            .filter(Chat.id == chat_id, Chat.user_id == user_id)
            .first()
        )

    def get_with_knowledge_bases(self, chat_id: int, user_id: int) -> Optional[Chat]:
        """获取当前用户的对话，并关联知识库。"""
        return (
            self.db.query(Chat)
            .options(joinedload(Chat.knowledge_bases))
            .filter(Chat.id == chat_id, Chat.user_id == user_id)
            .first()
        )

    def delete_chat(self, chat: Chat) -> None:
        """删除对话。"""
        self.db.delete(chat)
