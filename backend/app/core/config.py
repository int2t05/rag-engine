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
    
    # 数据库相关
    MYSQL_SERVER: str = Field(default="localhost", alias="MYSQL_SERVER")
    MYSQL_PORT: int = Field(default=3306, alias="MYSQL_PORT")
    MYSQL_USER: str = Field(default="root", alias="MYSQL_USER")
    MYSQL_PASSWORD: str = Field(default="123456", alias="MYSQL_PASSWORD")
    MYSQL_DATABASE: str = Field(default="rag_engine", alias="MYSQL_DATABASE")

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

    # Pydantic V2 配置
    model_config = SettingsConfigDict(
        env_file=ENV_FILE_PATH,  # 加载根目录的 .env 文件
        env_file_encoding="utf-8",  # 编码格式
        extra="ignore",  # ：忽略 .env 中未定义的字段（解决 Extra inputs 错误）
        case_sensitive=False,  # 环境变量名不区分大小写（比如 MYSQL_SERVER 和 mysql_server 都能识别）
    )

    @property
    def get_database_url(self) -> str:
        return f"mysql+mysqlconnector://{self.MYSQL_USER}:{self.MYSQL_PASSWORD}@{self.MYSQL_SERVER}:{self.MYSQL_PORT}/{self.MYSQL_DATABASE}"

settings = Settings()