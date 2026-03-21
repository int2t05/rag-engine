"""在同步代码块内设置 AI 运行时 ContextVar。"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Generator

from sqlalchemy.orm import Session

from app.services.ai_runtime_context import reset_ai_runtime_token, set_ai_runtime_token
from app.services.ai_runtime_loader import load_ai_runtime_for_user


@contextmanager
def ai_runtime_scope(db: Session, user_id: int) -> Generator[None, None, None]:
    rt = load_ai_runtime_for_user(db, user_id)
    tok = set_ai_runtime_token(rt)
    try:
        yield
    finally:
        reset_ai_runtime_token(tok)
