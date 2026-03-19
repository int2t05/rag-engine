"""
LLM 工厂
========
根据配置创建大语言模型实例（OpenAI / DeepSeek / Ollama）。
"""

from typing import Optional
from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI
from langchain_deepseek import ChatDeepSeek
from langchain_ollama import ChatOllama
from app.core.config import settings


class LLMFactory:
    @staticmethod
    def create(
        provider: Optional[
            str
        ] = None,  # Optional[str] 意味着参数可以是 str 类型或 None
        temperature: float = 0,
        streaming: bool = True,  # 是否流式传输
    ) -> BaseChatModel:
        """
        基于提供程序创建LLM实例
        """
        # 如果没有指定提供程序，使用settings中的提供程序
        provider = provider or settings.CHAT_PROVIDER

        if provider.lower() == "openai":
            return ChatOpenAI(
                temperature=temperature,
                streaming=streaming,
                model=settings.OPENAI_MODEL,
                api_key=settings.OPENAI_API_KEY,
                base_url=settings.OPENAI_API_BASE,
            )

        elif provider.lower() == "deepseek":
            return ChatDeepSeek(
                temperature=temperature,
                streaming=streaming,
                model=settings.DEEPSEEK_MODEL,
                api_key=settings.DEEPSEEK_API_KEY,
                api_base=settings.DEEPSEEK_API_BASE,
            )

        elif provider.lower() == "ollama":
            return ChatOllama(
                model=settings.OLLAMA_MODEL,
                base_url=settings.OLLAMA_API_BASE,
                temperature=temperature,
            )
        # Add more providers here as needed
        # elif provider.lower() == "anthropic":
        #     return ChatAnthropic(...)
        else:
            raise ValueError(f"Unsupported LLM provider: {provider}")
