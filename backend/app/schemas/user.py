from pydantic import BaseModel, EmailStr, Field
from datetime import datetime

# 注册时的请求体（校验输入）
class UserCreate(BaseModel):
    email: EmailStr  # 自动校验邮箱格式
    username: str = Field(min_length=3, max_length=50)  # 用户名长度限制
    password: str = Field(min_length=6)  # 密码最小长度

# 响应体（返回给前端的数据，隐藏敏感字段）
class UserResponse(BaseModel):
    id: int
    email: EmailStr
    username: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    # 支持从ORM模型（User类）转换为Pydantic模型
    class Config:
        from_attributes = True