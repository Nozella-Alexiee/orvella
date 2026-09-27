"""runner multi-bahasa: jenis notebook, bahasa, berkas; tabel app_settings

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-28 12:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

import app.models


revision: str = '0002'
down_revision: Union[str, Sequence[str], None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('notebooks') as b:
        b.add_column(sa.Column('kind', sa.String(length=16), nullable=False, server_default='notebook'))
        b.add_column(sa.Column('lang', sa.String(length=20), nullable=False, server_default='javascript'))
        b.add_column(sa.Column('files', sa.JSON(), nullable=True))
    with op.batch_alter_table('submissions') as b:
        b.add_column(sa.Column('lang', sa.String(length=20), nullable=False, server_default='javascript'))
    op.create_table('app_settings',
        sa.Column('key', sa.String(length=40), nullable=False),
        sa.Column('value', sa.JSON(), nullable=False),
        sa.Column('updated_at', app.models.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('key'),
    )


def downgrade() -> None:
    op.drop_table('app_settings')
    with op.batch_alter_table('submissions') as b:
        b.drop_column('lang')
    with op.batch_alter_table('notebooks') as b:
        b.drop_column('files')
        b.drop_column('lang')
        b.drop_column('kind')
