from pydantic import BaseModel

# 登录返回的Token格式
class Token(BaseModel):
    access_token: str
    token_type: str  # 固定为"bearer"