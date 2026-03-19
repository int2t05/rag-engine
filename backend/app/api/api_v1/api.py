"""
API v1 路由汇总
==============
将所有子路由模块注册到主路由器。
最终路由结构：
  /api/auth/*           - 认证（注册、登录、Token）
  /api/knowledge-base/* - 知识库 CRUD、文档上传、处理、检索
  /api/chat/*           - 对话 CRUD、发送消息（流式 RAG 回答）
  /api/api-keys/*       - API 密钥管理
"""

from fastapi import APIRouter
from app.api.api_v1 import auth, knowledge_base, chat,api_keys

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(knowledge_base.router, prefix="/knowledge-base", tags=["knowledge-base"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(api_keys.router, prefix="/api-keys", tags=["api-keys"])
