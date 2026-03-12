import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """配置类
    读取.env文件 环境配置配置管理

    读取优先级是：
    系统环境变量
    .env 文件里的配置
    os.getenv() 里的默认值
    """

    # 项目名
    PROJECT_NAME: str = "RAG Web UI"
    # MySQL 配置
    MYSQL_SERVER: str = os.getenv("MYSQL_SERVER", "localhost")
    MYSQL_PORT: int = int(os.getenv("MYSQL_PORT", "3306"))
    MYSQL_USER: str = os.getenv("MYSQL_USER", "ragwebui")
    MYSQL_PASSWORD: str = os.getenv("MYSQL_PASSWORD", "ragwebui")
    MYSQL_DATABASE: str = os.getenv("MYSQL_DATABASE", "ragwebui")
    
    # JWT 配置
    SECRET_KEY: str = os.getenv("SECRET_KEY", "change-me-to-a-random-string")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7天

    @property
    def get_database_url(self) -> str:
        # SQLAlchemy 数据库连接字符串
        return f"mysql+mysqlconnector://{self.MYSQL_USER}:{self.MYSQL_PASSWORD}@{self.MYSQL_SERVER}:{self.MYSQL_PORT}/{self.MYSQL_DATABASE}"

    class Config:
        env_file = ".env" # 支持读取.env文件


settings = Settings() 
