"""
RAG Web UI 后端应用入口
=======================
这是整个后端的启动文件，负责：
1. 创建 FastAPI 应用实例
2. 注册所有 API 路由
3. 在应用 lifespan 启动阶段初始化 MinIO 和数据库迁移
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from app.api.api_v1.api import api_router
from app.api.errors import http_exception_from_service
from app.core.config import settings
from app.core.exceptions import AppServiceError
from app.core.minio import init_minio
from app.startup.migrate import DatabaseMigrator

# 配置日志格式，方便调试时查看时间、模块名、日志级别和消息
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

# uvicorn app.main:app --reload


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    应用生命周期：启动时初始化 MinIO、执行 Alembic 迁移；关闭时无额外清理。
    使用 lifespan 替代已弃用的 @app.on_event("startup")（见 FastAPI 文档 Advanced → Events）。
    """
    init_minio()
    migrator = DatabaseMigrator(settings.get_database_url)
    migrator.run_migrations()
    yield


# 创建 FastAPI 应用实例
# title 和 version 会显示在自动生成的 API 文档中
# openapi_url 指定 OpenAPI JSON 的访问路径
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    # JWT 走 Authorization 头，无需 cookie；与 allow_origins=["*"] 同时开 credentials 易触发浏览器/中间件异常
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册内部 API 路由（JWT 认证），前缀为 /api
# 包含：/api/auth、/api/knowledge-base、/api/chat、/api/evaluation、/api/llm-configs
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.exception_handler(AppServiceError)
async def app_service_error_handler(request: Request, exc: AppServiceError) -> JSONResponse:
    """统一将服务层可预期异常映射为 JSON，与路由内手动 raise HTTPException 行为一致。"""
    http_exc = http_exception_from_service(exc)
    headers = dict(http_exc.headers) if http_exc.headers else None
    return JSONResponse(
        status_code=http_exc.status_code,
        content={"detail": http_exc.detail},
        headers=headers,
    )


@app.get("/")
def root(request: Request):
    """
    根路径：浏览器地址栏打开时重定向到 Swagger（/docs），避免只看到 JSON 误以为「一直加载」；
    curl / 脚本（Accept 不含 text/html 或显式要 JSON）仍返回 JSON。
    """
    accept = request.headers.get("accept") or ""
    if "text/html" in accept and "application/json" not in accept:
        return RedirectResponse(url="/docs", status_code=307)
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
