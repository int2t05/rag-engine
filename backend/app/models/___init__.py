# backend/app/models/__init__.py
from app.models.base import Base
from app.models.user import User

# 添加下面两行
from app.models.knowledge import KnowledgeBase, Document

__all__ = ["Base", "User", "KnowledgeBase", "Document"]