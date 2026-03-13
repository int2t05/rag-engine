from fastapi import APIRouter
from app.api.api_v1 import auth, knowledge_base

api_router = APIRouter()

# include_route 将子路由注册到父路由中
# prefix 路径前缀，多层注册时会叠加
# tags Swagger 文档中的分组标签
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(
    knowledge_base.router, prefix="/knowledge-base", tags=["knowledge-base"]
)
