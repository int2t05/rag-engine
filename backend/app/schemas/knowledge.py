from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List

# 基础模式（公共字段）
class KnowledgeBaseBase(BaseModel):
    name: str = Field(..., max_length=255, description="知识库名称")
    description: Optional[str] = Field(None, description="知识库描述")

# 创建用（继承基础，无ID和时间）
class KnowledgeBaseCreate(KnowledgeBaseBase):
    pass

# 更新用（所有字段可选）
class KnowledgeBaseUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = Field(None)

# 响应用（包含所有字段）
class KnowledgeBaseResponse(KnowledgeBaseBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    # 支持 ORM 对象转换
    class Config:
        from_attributes = True