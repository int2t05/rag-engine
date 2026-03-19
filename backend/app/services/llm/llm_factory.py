"""
LLM 工厂
========
根据 CHAT_PROVIDER 配置创建大语言模型实例，供 RAG 对话和评估使用。

支持的提供商：
- openai：OpenAI 兼容接口（含 OpenAI、DeepSeek 等）
- deepseek：DeepSeek 官方 SDK
- ollama：本地 Ollama 部署
"""

from typing import Optional

from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI
from langchain_deepseek import ChatDeepSeek
from langchain_ollama import ChatOllama

from app.core.config import settings


class LLMFactory:
    """大语言模型工厂类，按配置创建对应 provider 的 LLM 实例"""

    @staticmethod
    def create(
        provider: Optional[str] = None,
        temperature: float = 0,
        streaming: bool = True,
    ) -> BaseChatModel:
        """
        创建 LLM 实例

        Args:
            provider: 提供商名称，未指定时使用 settings.CHAT_PROVIDER
            temperature: 生成温度，0 为确定性输出，评估场景建议为 0
            streaming: 是否流式输出，对话场景为 True，评估场景为 False

        Returns:
            BaseChatModel: LangChain 兼容的聊天模型实例

        Raises:
            ValueError: 当 provider 不支持时
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
