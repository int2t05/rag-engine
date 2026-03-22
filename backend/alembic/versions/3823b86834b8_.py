"""empty message

Revision ID: 3823b86834b8
Revises: f1a2b3c4d5e6, f7e8d9c0b1a2
Create Date: 2026-03-22 10:44:49.911465

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3823b86834b8'
down_revision: Union[str, Sequence[str], None] = ('f1a2b3c4d5e6', 'f7e8d9c0b1a2')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
