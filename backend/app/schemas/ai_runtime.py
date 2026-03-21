"""
LLM / 嵌入运行时配置（存数据库，不经由 .env）
"""

from pydantic import BaseModel, Field


class AiRuntimeSettings(BaseModel):
    """与原先 Settings 中 LLM/嵌入字段对齐，供工厂与 RAGAS 使用。"""

    embeddings_provider: str = Field(default="openai", description="openai | ollama")
    chat_provider: str = Field(default="openai", description="openai | ollama")

    openai_api_base: str = Field(default="https://api.openai.com/v1")
    openai_api_key: str = ""
    openai_model: str = Field(default="gpt-4")
    openai_embeddings_model: str = Field(default="text-embedding-ada-002")
    openai_embeddings_api_base: str = ""
    openai_embeddings_api_key: str = ""

    ollama_api_base: str = Field(default="http://localhost:11434")
    ollama_embeddings_api_base: str = ""
    ollama_model: str = Field(default="deepseek-r1:7b")
    ollama_embeddings_model: str = Field(default="nomic-embed-text")
