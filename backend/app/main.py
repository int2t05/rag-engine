from fastapi import FastAPI
from app.api.api_v1.api import api_router
from app.core.config import settings
from fastapi.middleware.cors import CORSMiddleware

# 创建FastAPI应用实例
app = FastAPI(
    title=settings.PROJECT_NAME,
    version="0.1.0",
    docs_url="/docs",  # Swagger UI地址
    redoc_url="/redoc"  # ReDoc地址
)

# 配置跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 开发环境允许所有源（生产环境需指定具体域名，如 "http://localhost:3000"）
    allow_credentials=True,
    allow_methods=["*"],  # 允许所有请求方法（包括 OPTIONS/POST/GET 等）
    allow_headers=["*"],  # 允许所有请求头（包括 Content-Type 等）
)

# 挂载API路由（前缀/api）
app.include_router(api_router, prefix="/api")
# uvicorn app.main:app --reload
# 可选：添加根路径测试
@app.get("/")
def root():
    return {"message": "Welcome to RAG Web UI API"}