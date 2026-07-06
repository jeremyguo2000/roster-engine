"""shift_group color

Revision ID: 70be978411d9
Revises: 66b01e668e2e
Create Date: 2026-05-21 02:35:43.598628
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '70be978411d9'
down_revision: Union[str, None] = '66b01e668e2e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'shift_group',
        sa.Column('color', sa.String(), nullable=False, server_default='#8A8378'),
    )
    op.execute("UPDATE shift_group SET color = '#2B6CB0' WHERE code = 'DSG'")
    op.execute("UPDATE shift_group SET color = '#2D6A4F' WHERE code = 'ESG'")
    op.execute("UPDATE shift_group SET color = '#6B46C1' WHERE code = 'NSG'")
    op.execute("UPDATE shift_group SET color = '#C84B31' WHERE code = 'Leaves'")
    op.alter_column('shift_group', 'color', server_default=None)


def downgrade() -> None:
    op.drop_column('shift_group', 'color')
