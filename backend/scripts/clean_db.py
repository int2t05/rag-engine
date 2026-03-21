"""
开发环境专用：按依赖顺序删除数据库表（危险操作，勿在生产使用）。

用法（在 backend 目录下）::

    python scripts/clean_db.py

若 schema 变更，请同步更新下方 DROP 顺序与表名。
"""
from __future__ import annotations

import sys
from pathlib import Path

# 保证以脚本方式运行时能导入 app
_BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from sqlalchemy import create_engine, text  # noqa: E402

from app.core.config import settings  # noqa: E402


def clean_database() -> None:
    engine = create_engine(settings.get_database_url)
    with engine.connect() as conn:
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
        # 子表 / 关联表优先
        for table in (
            "evaluation_results",
            "evaluation_test_cases",
            "evaluation_tasks",
            "processing_tasks",
            "document_chunks",
            "chat_knowledge_bases",
            "documents",
            "document_uploads",
            "messages",
            "chats",
            "knowledge_bases",
            "llm_embedding_configs",
            "api_keys",
            "users",
            "alembic_version",
        ):
            conn.execute(text(f"DROP TABLE IF EXISTS {table}"))
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
        conn.commit()


if __name__ == "__main__":
    clean_database()
    print("数据库表已清空（开发环境）")
