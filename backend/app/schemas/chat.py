"""
对话与消息相关 Pydantic 模型
===========================
"""

from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class MessageBase(BaseModel):
    """消息基础字段"""

    content: str
    role: str  # "user" 或 "assistant"


class MessageCreate(MessageBase):
    """创建消息时的请求体"""

    chat_id: int


class MessageResponse(MessageBase):
    """消息的 API 响应格式"""

    id: int
    chat_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ChatBase(BaseModel):
    """对话基础字段"""

    title: str


class ChatCreate(ChatBase):
    """创建对话时的请求体，需指定关联的知识库 ID 列表"""

    knowledge_base_ids: List[int]


class ChatUpdate(ChatBase):
    """更新对话时的请求体"""

    knowledge_base_ids: Optional[List[int]] = None


class ChatResponse(ChatBase):
    """对话的 API 响应格式，包含消息列表"""

    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime
    messages: List[MessageResponse] = []
    knowledge_base_ids: List[int] = []

    class Config:
        from_attributes = True
