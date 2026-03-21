# LLM 配置模块

## 目录

- [模块概述](#模块概述)
- [API 端点](#api-端点)
- [配置结构](#配置结构)
- [激活机制](#激活机制)
- [关键代码](#关键代码)

## 模块概述

允许用户管理多份 LLM/Embedding 配置，可选一份「激活」供全局使用。

**源码位置**: `app/modules/llm_config/`

## API 端点

| 方法 | 端点 | 功能 |
|------|------|------|
| GET | `/api/llm-configs` | 列出全部配置及当前激活项 ID |
| POST | `/api/llm-configs` | 创建配置 |
| PUT | `/api/llm-configs/{config_id}` | 更新配置 |
| POST | `/api/llm-configs/{config_id}/activate` | 激活配置 |
| DELETE | `/api/llm-configs/{config_id}` | 删除配置（204） |

无单独「按 ID 查询单条」接口：列表接口已返回各条配置内容。

## 配置结构

### AiRuntimeSettings

```python
class AiRuntimeSettings(BaseModel):
    # Embeddings 提供者
    embeddings_provider: Literal["openai", "ollama"]

    # Chat LLM 提供者
    chat_provider: Literal["openai", "ollama"]

    # OpenAI LLM 配置
    openai_api_base: str | None = None
    openai_api_key: str | None = None
    openai_model: str | None = None

    # OpenAI Embeddings 配置
    openai_embeddings_api_base: str | None = None
    openai_embeddings_api_key: str | None = None
    openai_embeddings_model: str | None = None

    # Ollama LLM 配置
    ollama_api_base: str | None = None
    ollama_model: str | None = None

    # Ollama Embeddings 配置
    ollama_embeddings_api_base: str | None = None
    ollama_embeddings_model: str | None = None
```

### 数据库存储

```python
# LlmEmbeddingConfig 模型
class LlmEmbeddingConfig(Base):
    id: int
    user_id: int
    name: str
    config_json: dict  # AiRuntimeSettings JSON
    is_active: bool = False
```

### 配置示例

```json
{
  "embeddings_provider": "openai",
  "chat_provider": "openai",
  "openai_api_base": "https://api.openai.com/v1",
  "openai_api_key": "sk-...",
  "openai_model": "gpt-4",
  "openai_embeddings_api_base": "https://api.openai.com/v1",
  "openai_embeddings_api_key": "sk-...",
  "openai_embeddings_model": "text-embedding-3-small",
  "ollama_api_base": null,
  "ollama_model": null,
  "ollama_embeddings_api_base": null,
  "ollama_embeddings_model": null
}
```

## 激活机制

### 激活流程

```
用户选择配置 → POST /{config_id}/activate
    │
    ▼
UserRepository.set_active_config(config_id)
    │
    ├──► 取消该用户其他配置的 is_active=True
    │
    └──► 设置目标配置的 is_active=True
```

### 全局使用

```python
# app/shared/ai_runtime_loader.py
def load_user_runtime_settings(user_id: int) -> AiRuntimeSettings:
    """从数据库加载用户激活的配置"""
    config = db.query(LlmEmbeddingConfig).filter(
        LlmEmbeddingConfig.user_id == user_id,
        LlmEmbeddingConfig.is_active == True
    ).first()

    if not config:
        raise RequiresActiveConfigError()

    return AiRuntimeSettings(**config.config_json)
```

## 关键代码

### routes.py

```python
@router.post("/{config_id}/activate", response_model=Schema)
async def activate_config(
    config_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """激活指定配置"""
    config = service.activate_config(db, current_user.id, config_id)
    return config
```

### service.py

```python
def activate_config(
    db: Session,
    user_id: int,
    config_id: int
) -> LlmEmbeddingConfig:
    """激活配置"""
    # 取消其他配置的激活状态
    db.query(LlmEmbeddingConfig).filter(
        LlmEmbeddingConfig.user_id == user_id,
        LlmEmbeddingConfig.is_active == True
    ).update({"is_active": False})

    # 激活目标配置
    config = db.query(LlmEmbeddingConfig).filter(
        LlmEmbeddingConfig.id == config_id,
        LlmEmbeddingConfig.user_id == user_id
    ).first()

    if not config:
        raise ConfigNotFoundError()

    config.is_active = True
    db.commit()
    return config
```

### Factory 工厂

```python
# app/shared/llm/openai.py
class OpenAILLM:
    def __init__(self, settings: AiRuntimeSettings):
        self.client = OpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_api_base
        )
        self.model = settings.openai_model

# app/shared/llm/factory.py
class LLMFactory:
    @staticmethod
    def create(settings: AiRuntimeSettings) -> BaseLLM:
        if settings.chat_provider == "openai":
            return OpenAILLM(settings)
        elif settings.chat_provider == "ollama":
            return OllamaLLM(settings)
        else:
            raise ValueError(f"Unknown provider: {settings.chat_provider}")
```
