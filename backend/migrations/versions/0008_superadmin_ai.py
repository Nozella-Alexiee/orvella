"""superadmin + batas Tanya Orvi per orang (users.ai_limit)

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-01 15:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0008'
down_revision: Union[str, Sequence[str], None] = '0007'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # role "superadmin" muat di kolom role String(16) yang sudah ada; yang baru cuma batas AI per orang
    with op.batch_alter_table('users') as b:
        b.add_column(sa.Column('ai_limit', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.execute("UPDATE users SET role = 'admin' WHERE role = 'superadmin'")
    with op.batch_alter_table('users') as b:
        b.drop_column('ai_limit')
