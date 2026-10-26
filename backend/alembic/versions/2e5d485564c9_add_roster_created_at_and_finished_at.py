"""add roster created_at and finished_at

Revision ID: 2e5d485564c9
Revises: 70be978411d9
Create Date: 2026-08-14 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '2e5d485564c9'
down_revision: Union[str, None] = '70be978411d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default backfills existing rows (we don't know their real
    # creation time, so "now" is the honest placeholder); dropped afterwards
    # since going forward the app sets created_at itself (Roster.created_at
    # default=datetime.utcnow), matching the User model's pattern.
    op.add_column('roster', sa.Column(
        'created_at', sa.DateTime(), nullable=False,
        server_default=sa.text('now()'),
    ))
    op.alter_column('roster', 'created_at', server_default=None)
    op.add_column('roster', sa.Column('finished_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('roster', 'finished_at')
    op.drop_column('roster', 'created_at')
