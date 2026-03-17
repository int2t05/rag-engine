from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
import os
from pathlib import Path

# 定位项目根目录的 .env 文件
ENV_FILE_PATH = Path(__file__).parent.parent.parent.parent / ".env"


class Settings(BaseSettings):
    """配置类
    读取.env文件 环境配置配置管理

    读取优先级是：
    系统环境变量
    .env 文件里的配置
    os.getenv() 里的默认值
    """

    # 项目相关
    PROJECT_NAME: str = Field(default="RAG Engine", alias="PROJECT_NAME")
    VERSION: str = Field(default="0.1.0", alias="VERSION")
    API_V1_STR: str = Field(default="/api", alias="APR_V1_STR")  # API 路由前缀

    # 数据库相关
    MYSQL_SERVER: str = Field(default="localhost", alias="MYSQL_SERVER")
    MYSQL_PORT: int = Field(default=3306, alias="MYSQL_PORT")
    MYSQL_USER: str = Field(default="root", alias="MYSQL_USER")
    MYSQL_PASSWORD: str = Field(default="123456", alias="MYSQL_PASSWORD")
    MYSQL_DATABASE: str = Field(default="rag_engine", alias="MYSQL_DATABASE")

    @property
    def get_database_url(self) -> str:
        return f"mysql+mysqlconnector://{self.MYSQL_USER}:{self.MYSQL_PASSWORD}@{self.MYSQL_SERVER}:{self.MYSQL_PORT}/{self.MYSQL_DATABASE}"

    # JWT 相关字段
    SECRET_KEY: str = Field(
        default="change-me", alias="SECRET_KEY"
    )  # 对应 os.getenv 默认值
    ALGORITHM: str = Field(
        default="HS256", alias="ALGORITHM"
    )  # 固定值，也可从 .env 读取
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default=10080, alias="ACCESS_TOKEN_EXPIRE_MINUTES"
    )  # 过期时间（10080分钟=7天）

    # MinIO 相关字段
    MINIO_ENDPOINT: str = Field(default="localhost:9000", alias="MINIO_ENDPOINT")
    MINIO_ACCESS_KEY: str = Field(default="minioadmin", alias="MINIO_ACCESS_KEY")
    MINIO_SECRET_KEY: str = Field(default="minioadmin", alias="MINIO_SECRET_KEY")
    MINIO_BUCKET_NAME: str = Field(default="documents", alias="MINIO_BUCKET_NAME")

    # Embedding（文本向量化）配置
    # Embedding 提供商：openai / dashscope / ollama
    # Embedding 配置
    EMBEDDINGS_PROVIDER: str = Field(default="openai", alias="EMBEDDINGS_PROVIDER")

    # 向量数据库配置
    # 向量存储类型：chroma（默认）或 qdrant
    VECTOR_STORE_TYPE: str = Field(default="chroma", alias="VECTOR_STORE_TYPE")
    CHROMA_DB_HOST: str = Field(default="localhost", alias="CHROMA_DB_HOST")
    CHROMA_DB_PORT: int = Field(default=8001, alias="CHROMA_DB_PORT")
    QDRANT_URL: str = Field(default="http://localhost:6333", alias="QDRANT_URL")
    QDRANT_PREFER_GRPC: bool = Field(default=True, alias="QDRANT_PREFER_GRPC")

    # OpenAI 配置
    OPENAI_API_BASE: str = Field(
        default="https://api.openai.com/v1", alias="OPENAI_API_BASE"
    )
    OPENAI_API_KEY: str = Field(
        default="your-openai-api-key-here", alias="OPENAI_API_KEY"
    )
    OPENAI_MODEL: str = Field(default="gpt-4", alias="OPENAI_MODEL")
    OPENAI_EMBEDDINGS_MODEL: str = Field(
        default="text-embedding-ada-002", alias="OPENAI_EMBEDDINGS_MODEL"
    )

    # DashScope 配置
    DASH_SCOPE_API_KEY: str = Field(default="", alias="DASH_SCOPE_API_KEY")
    DASH_SCOPE_EMBEDDINGS_MODEL: str = Field(
        default="", alias="DASH_SCOPE_EMBEDDINGS_MODEL"
    )

    # Ollama 配置
    OLLAMA_API_BASE: str = Field(
        default="http://localhost:11434", alias="OLLAMA_API_BASE"
    )
    OLLAMA_MODEL: str = Field(default="deepseek-r1:7b", alias="OLLAMA_MODEL")
    OLLAMA_EMBEDDINGS_MODEL: str = Field(
        default="nomic-embed-text", alias="OLLAMA_EMBEDDINGS_MODEL"
    )

    # Pydantic V2 配置
    model_config = SettingsConfigDict(
        env_file=ENV_FILE_PATH,  # 加载根目录的 .env 文件
        env_file_encoding="utf-8",  # 编码格式
        extra="ignore",  # ：忽略 .env 中未定义的字段
        case_sensitive=False,  # 环境变量名不区分大小写
    )


# 创建全局配置单例，在项目中通过 from app.core.config import settings 使用
settings = Settings()
