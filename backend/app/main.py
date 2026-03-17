"""
RAG Web UI 后端应用入口
=======================
这是整个后端的启动文件，负责：
1. 创建 FastAPI 应用实例
2. 注册所有 API 路由
3. 在应用启动时初始化 MinIO 和数据库迁移
"""

import logging

from app.api.api_v1.api import api_router

# from app.api.openapi.api import router as openapi_router
from app.core.config import settings
from app.core.minio import init_minio

from app.startup.migarate import DatabaseMigrator
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# 配置日志格式，方便调试时查看时间、模块名、日志级别和消息
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

# 创建 FastAPI 应用实例
# title 和 version 会显示在自动生成的 API 文档中
# openapi_url 指定 OpenAPI JSON 的访问路径
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册内部 API 路由（JWT 认证），前缀为 /api
# 包含：/api/auth、/api/knowledge-base、/api/chat、/api/api-keys
app.include_router(api_router, prefix=settings.API_V1_STR)

# 注册 OpenAPI 路由（API Key 认证），前缀为 /openapi
# 供外部系统通过 API Key 调用知识库查询功能
# app.include_router(openapi_router, prefix="/openapi")


@app.on_event("startup")
async def startup_event():
    """
    应用启动时执行的初始化操作：
    1. 初始化 MinIO：确保存储桶存在
    2. 运行数据库迁移：自动更新数据库表结构到最新版本
    """
    init_minio()
    migrator = DatabaseMigrator(settings.get_database_url)
    migrator.run_migrations()


@app.get("/")
def root():
    """根路径健康检查，返回欢迎消息"""
    return {"message": "Welcome to RAG Web UI API"}


@app.get("/api/health")
async def health_check():
    """
    健康检查接口
    Docker 和监控系统可以通过此接口判断服务是否正常运行
    """
    return {
        "status": "healthy",
        "version": settings.VERSION,
    }
