"""
OpenAPI 路由汇总
供外部系统通过 X-API-Key 调用，不依赖 JWT。
"""
from fastapi import APIRouter

from app.api.openapi import knowledge

router = APIRouter()
router.include_router(knowledge.router, prefix="/knowledge", tags=["knowledge"]) 