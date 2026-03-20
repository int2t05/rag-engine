"""
应用配置模块
============
从 .env 文件和环境变量加载配置，供全项目使用。

配置读取优先级（由高到低）：
1. 系统环境变量
2. .env 文件中的配置
3. 各字段的默认值
"""

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# 定位项目根目录的 .env 文件（backend/app/core/ -> 项目根目录）
ENV_FILE_PATH = Path(__file__).resolve().parent.parent.parent.parent / ".env"


class Settings(BaseSettings):
    """
    应用配置类

    通过 pydantic-settings 从 .env 和环境变量加载配置。
    使用 Field 定义各配置项的类型、默认值和环境变量别名。
    """

    # ---------- 项目相关 ----------
    PROJECT_NAME: str = Field(default="RAG Engine", alias="PROJECT_NAME")
    VERSION: str = Field(default="0.1.0", alias="VERSION")
    API_V1_STR: str = Field(default="/api", alias="API_V1_STR")  # API 路由前缀
    DEBUG: bool = Field(
        default=False, alias="DEBUG"
    )  # 调试模式，为 True 时启用 LangChain 详细日志

    # 数据库相关
    MYSQL_SERVER: str = Field(default="localhost", alias="MYSQL_SERVER")
    MYSQL_PORT: int = Field(default=3306, alias="MYSQL_PORT")
    MYSQL_USER: str = Field(default="root", alias="MYSQL_USER")
    MYSQL_PASSWORD: str = Field(default="123456", alias="MYSQL_PASSWORD")
    MYSQL_DATABASE: str = Field(default="rag_engine", alias="MYSQL_DATABASE")

    @property
    def get_database_url(self) -> str:
        """构建 MySQL 连接 URL，供 SQLAlchemy Engine 使用"""
        return (
            f"mysql+mysqlconnector://{self.MYSQL_USER}:{self.MYSQL_PASSWORD}"
            f"@{self.MYSQL_SERVER}:{self.MYSQL_PORT}/{self.MYSQL_DATABASE}"
        )

    # ---------- JWT 认证（《用户认证业务流程最佳实践》5.1 节）----------
    SECRET_KEY: str = Field(
        default="change-me", alias="SECRET_KEY"
    )  # JWT 签名密钥，生产环境必须修改为随机长字符串
    ALGORITHM: str = Field(default="HS256", alias="ALGORITHM")  # JWT 算法，不建议更改
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default=10080, alias="ACCESS_TOKEN_EXPIRE_MINUTES"
    )  # Token 有效期（10080 分钟 = 7 天），可根据业务调整

    # ---------- MinIO 对象存储 ----------
    MINIO_ENDPOINT: str = Field(default="localhost:9000", alias="MINIO_ENDPOINT")
    MINIO_ACCESS_KEY: str = Field(default="minioadmin", alias="MINIO_ACCESS_KEY")
    MINIO_SECRET_KEY: str = Field(default="minioadmin", alias="MINIO_SECRET_KEY")
    MINIO_BUCKET_NAME: str = Field(default="documents", alias="MINIO_BUCKET_NAME")

    # ---------- Embedding（文本向量化）------------
    # Embedding 提供商：openai / dashscope / ollama / zhipu
    # Embedding 配置
    EMBEDDINGS_PROVIDER: str = Field(default="openai", alias="EMBEDDINGS_PROVIDER")

    # ---------- 向量数据库 ----------
    # 向量存储类型：chroma（默认）或 qdrant
    VECTOR_STORE_TYPE: str = Field(default="chroma", alias="VECTOR_STORE_TYPE")
    CHROMA_DB_HOST: str = Field(default="localhost", alias="CHROMA_DB_HOST")
    CHROMA_DB_PORT: int = Field(default=8001, alias="CHROMA_DB_PORT")
    QDRANT_URL: str = Field(default="http://localhost:6333", alias="QDRANT_URL")
    QDRANT_PREFER_GRPC: bool = Field(default=True, alias="QDRANT_PREFER_GRPC")

    # ---------- OpenAI ----------
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

    # ---------- DeepSeek ----------
    DEEPSEEK_API_KEY: str = Field(default="", alias="DEEPSEEK_API_KEY")
    DEEPSEEK_API_BASE: str = Field(default="", alias="DEEPSEEK_API_BASE")
    # Deepseek 模型可以是 deepseek-chat 或 deepseek-reasoner
    DEEPSEEK_MODEL: str = Field(default="deepseek-chat", alias="DEEPSEEK_MODEL")

    # ---------- 阿里 DashScope ----------
    DASH_SCOPE_API_KEY: str = Field(default="", alias="DASH_SCOPE_API_KEY")
    DASH_SCOPE_EMBEDDINGS_MODEL: str = Field(
        default="", alias="DASH_SCOPE_EMBEDDINGS_MODEL"
    )

    # ---------- 智谱 GLM ----------
    ZHIPUAI_API_KEY: str = Field(default="", alias="ZHIPUAI_API_KEY")
    ZHIPUAI_EMBEDDINGS_MODEL: str = Field(
        default="embedding-3", alias="ZHIPUAI_EMBEDDINGS_MODEL"
    )
    ZHIPUAI_MODEL: str = Field(default="glm-4.5", alias="ZHIPUAI_MODEL")

    # ---------- Ollama 本地模型 ----------
    OLLAMA_API_BASE: str = Field(
        default="http://localhost:11434", alias="OLLAMA_API_BASE"
    )
    OLLAMA_MODEL: str = Field(default="deepseek-r1:7b", alias="OLLAMA_MODEL")
    OLLAMA_EMBEDDINGS_MODEL: str = Field(
        default="nomic-embed-text", alias="OLLAMA_EMBEDDINGS_MODEL"
    )

    # ---------- 聊天模型提供商 ----------
    CHAT_PROVIDER: str = Field(default="openai", alias="CHAT_PROVIDER")

    # ---------- Pydantic V2 配置 ----------
    model_config = SettingsConfigDict(
        env_file=ENV_FILE_PATH,  # 加载根目录的 .env 文件
        env_file_encoding="utf-8",  # 编码格式
        extra="ignore",  # 忽略 .env 中未定义的字段
        case_sensitive=False,  # 环境变量名不区分大小写
    )


# 全局配置单例，通过 from app.core.config import settings 使用
settings = Settings()
