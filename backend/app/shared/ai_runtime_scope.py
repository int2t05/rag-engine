"""在同步代码块内设置 AI 运行时 ContextVar。"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Generator

from sqlalchemy.orm import Session

from app.shared.ai_runtime_context import reset_ai_runtime_token, set_ai_runtime_token
from app.shared.ai_runtime_loader import load_ai_runtime_for_user


# 全局状态管理器
@contextmanager
def ai_runtime_scope(db: Session, user_id: int) -> Generator[None, None, None]:
    rt = load_ai_runtime_for_user(db, user_id)
    tok = set_ai_runtime_token(rt)  # 记录"设置之前是什么"的标记，用于恢复
    try:
        yield
    finally:
        reset_ai_runtime_token(tok)
