"""
API 密钥模型
============
用于 OpenAPI 外部调用认证，替代 JWT 的另一种认证方式。

适用场景：
- 外部系统通过 HTTP API 调用知识库查询
- 机器人、脚本等无法交互式登录的场景
- 需要长期有效的访问凭证
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, VARCHAR
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin


class APIKey(Base, TimestampMixin):
    """
    API 密钥模型

    字段：
    - key: 密钥值，格式为 "sk-" + 64 位十六进制，唯一
    - name: 用户自定义的密钥名称，方便区分用途
    - is_active: 是否启用，可随时关闭而不删除
    - last_used_at: 最后使用时间，用于审计
    """
    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(VARCHAR(128), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    last_used_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="api_keys")
