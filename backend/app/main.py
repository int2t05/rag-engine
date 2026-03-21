"""
应用入口
========
1. 建 app + CORS + 路由
2. lifespan 启动：MinIO、Alembic 迁移
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
# docker compose -f docker-compose.infra.yml down -v
# docker compose -f docker-compose.infra.yml up -d
@asynccontextmanager
async def lifespan(app: FastAPI):
    """1. 启动：MinIO + 迁移  2. 关闭：无额外清理"""
    init_minio()
    migrator = DatabaseMigrator(settings.get_database_url)
    migrator.run_migrations()
    yield


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

app.include_router(api_router, prefix=settings.API_V1_STR)


@app.exception_handler(AppServiceError)
async def app_service_error_handler(
    request: Request, exc: AppServiceError
) -> JSONResponse:
    """AppServiceError → 与 HTTPException 同结构的 JSON。"""
    http_exc = http_exception_from_service(exc)
    headers = dict(http_exc.headers) if http_exc.headers else None
    return JSONResponse(
        status_code=http_exc.status_code,
        content={"detail": http_exc.detail},
        headers=headers,
    )


@app.get("/")
def root(request: Request):
    """浏览器开 / → 转 /docs；否则 JSON（方便 curl）。"""
    accept = request.headers.get("accept") or ""
    if "text/html" in accept and "application/json" not in accept:
        return RedirectResponse(url="/docs", status_code=307)
    return {"message": "Welcome to RAG Web UI API"}


@app.get("/api/health")
async def health_check():
    """探活 + 版本号。"""
    return {
        "status": "healthy",
        "version": settings.VERSION,
    }
