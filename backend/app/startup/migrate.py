"""
启动时数据库迁移
================
应用启动时自动检查数据库版本，如有迁移脚本则执行升级。
使用 Alembic 管理迁移，迁移脚本位于 backend/alembic/versions/
"""
import logging
from contextlib import contextmanager
from pathlib import Path
from typing import Generator, Tuple

from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import create_engine
from sqlalchemy.engine import Connection

logger = logging.getLogger(__name__)


class DatabaseMigrator:
    """数据库迁移器：检查版本并执行 Alembic upgrade head"""

    def __init__(self, db_url: str):
        self.db_url = db_url
        self.alembic_cfg = self._get_alembic_config()

    @contextmanager
    def database_connection(self) -> Generator[Connection, None, None]:
        """
        数据库连接上下文管理器

        设置 3 秒连接超时，用于检查迁移状态。
        使用 with 语句时自动管理连接的获取和释放。
        """
        engine = create_engine(
            self.db_url, connect_args={"connect_timeout": 3}  # 设置连接超时为3秒
        )
        try:
            with engine.connect() as connection:
                yield connection
        except Exception as e:
            logger.error(f"Database connection error: {e}")
            raise

    def check_migration_needed(self) -> Tuple[bool, str, str]:
        """
        检查数据库是否需要执行迁移

        Returns:
            Tuple[bool, str, str]: (是否需要迁移, 当前版本, 目标版本)
        """
        with self.database_connection() as connection:
            context = MigrationContext.configure(connection)
            current_rev = context.get_current_revision()
            heads = context.get_current_heads()

        if not heads:
            logger.warning("No migration heads found. Database might not be initialized.")
            return True, current_rev or "None", "head"

        head_rev = heads[0]
        return current_rev != head_rev, current_rev or "None", head_rev

    def _get_alembic_config(self) -> Config:
        """
        创建并配置 Alembic 配置对象

        从 backend/alembic.ini 加载配置，并将数据库 URL 注入到配置中。
        """
        project_root = Path(__file__).resolve().parents[2]
        alembic_cfg = Config(str(project_root / "alembic.ini"))
        alembic_cfg.set_main_option("sqlalchemy.url", self.db_url)
        return alembic_cfg

    def run_migrations(self) -> None:
        """
        执行数据库迁移（如需要）

        先检查当前版本与目标版本是否一致，若不一致则执行 alembic upgrade head。
        迁移失败时会抛出异常。
        """
        try:
            needs_migration, current_rev, head_rev = self.check_migration_needed()

            if needs_migration:
                logger.info(f"Current revision: {current_rev}, upgrading to: {head_rev}")
                self.alembic_cfg.set_main_option("sqlalchemy.url", self.db_url)
                # 须使用 command.upgrade；alembic.config.main 不接受 config=，会忽略传入配置
                command.upgrade(self.alembic_cfg, "head")
                logger.info("Database migrations completed successfully")
            else:
                logger.info(f"Database is already at the latest version: {current_rev}")

        except Exception as e:
            logger.error(f"Error during database migration: {e}")
            raise
