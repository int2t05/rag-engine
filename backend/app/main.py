from fastapi import FastAPI
from app.api.api_v1.api import api_router
from app.core.config import settings

# 创建FastAPI应用实例
app = FastAPI(
    title=settings.PROJECT_NAME,
    version="0.1.0",
    docs_url="/docs",  # Swagger UI地址
    redoc_url="/redoc"  # ReDoc地址
)

# 挂载API路由（前缀/api）
app.include_router(api_router, prefix="/api")
# vicorn app.main:app --reloadu
# 可选：添加根路径测试
@app.get("/")
def root():
    return {"message": "Welcome to RAG Web UI API"}