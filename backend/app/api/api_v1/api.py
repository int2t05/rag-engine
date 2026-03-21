"""
API v1 路由汇总
==============
注册各业务模块的 FastAPI 路由器（实现位于 `app.modules`）。

路由结构：
  /api/auth/*            - 认证（注册、登录、Token）
  /api/knowledge-base/*  - 知识库 CRUD、文档上传、处理、检索
  /api/chat/*            - 对话 CRUD、发送消息（流式 RAG 回答）
  /api/evaluation/*      - RAG 评估任务与结果
  /api/llm-configs/*     - 用户 LLM/嵌入配置
"""

from fastapi import APIRouter

from app.modules.auth.routes import router as auth_router
from app.modules.chat.routes import router as chat_router
from app.modules.evaluation.routes import router as evaluation_router
from app.modules.knowledge.routes_documents import router as knowledge_documents_router
from app.modules.knowledge.routes_knowledge_base import router as knowledge_base_router
from app.modules.llm_config.routes import router as llm_config_router

api_router = APIRouter()

api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(knowledge_base_router, prefix="/knowledge-base", tags=["knowledge-base"])
api_router.include_router(
    knowledge_documents_router, prefix="/knowledge-base", tags=["knowledge-base"]
)
api_router.include_router(chat_router, prefix="/chat", tags=["chat"])
api_router.include_router(evaluation_router, prefix="/evaluation", tags=["evaluation"])
api_router.include_router(
    llm_config_router,
    prefix="/llm-configs",
    tags=["llm-configs"],
)
