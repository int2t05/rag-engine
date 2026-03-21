"""llm embedding configs

Revision ID: c7e8f9a1b2c3
Revises: b155d3323610
Create Date: 2026-03-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c7e8f9a1b2c3"
down_revision: Union[str, Sequence[str], None] = "b155d3323610"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "llm_embedding_configs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("config_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_llm_embedding_configs_id"),
        "llm_embedding_configs",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_llm_embedding_configs_user_id"),
        "llm_embedding_configs",
        ["user_id"],
        unique=False,
    )

    op.add_column(
        "users",
        sa.Column("active_llm_embedding_config_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_users_active_llm_embedding_config_id",
        "users",
        "llm_embedding_configs",
        ["active_llm_embedding_config_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_users_active_llm_embedding_config_id",
        "users",
        type_="foreignkey",
    )
    op.drop_column("users", "active_llm_embedding_config_id")
    op.drop_index(op.f("ix_llm_embedding_configs_user_id"), table_name="llm_embedding_configs")
    op.drop_index(op.f("ix_llm_embedding_configs_id"), table_name="llm_embedding_configs")
    op.drop_table("llm_embedding_configs")
