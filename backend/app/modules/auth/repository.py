"""
用户（User）数据访问
==================
认证与用户信息相关的查询。
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.models.user import User


class UserRepository:
    """用户仓储。"""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_email(self, email: str) -> Optional[User]:
        return self.db.query(User).filter(User.email == email).first()

    def get_by_username(self, username: str) -> Optional[User]:
        return self.db.query(User).filter(User.username == username).first()

    def get_by_id(self, user_id: int) -> Optional[User]:
        return self.db.query(User).filter(User.id == user_id).first()

    def add(self, user: User) -> None:
        self.db.add(user)
