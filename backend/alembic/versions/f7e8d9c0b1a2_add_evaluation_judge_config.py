"""add evaluation_tasks.judge_config for RAGAS judge overrides

Revision ID: f7e8d9c0b1a2
Revises: e8f9a0b1c2d4
Create Date: 2026-03-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f7e8d9c0b1a2"
down_revision: Union[str, Sequence[str], None] = "e8f9a0b1c2d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "evaluation_tasks",
        sa.Column("judge_config", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("evaluation_tasks", "judge_config")
