"""jalur multi-bahasa: bahasa, level, pemilik, visibilitas, kelas

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-28 14:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

import app.models


revision: str = '0003'
down_revision: Union[str, Sequence[str], None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('paths') as b:
        b.add_column(sa.Column('language', sa.String(length=20), nullable=False, server_default='javascript'))
        b.add_column(sa.Column('level', sa.String(length=20), nullable=False, server_default='Pemula'))
        b.add_column(sa.Column('owner_id', sa.Integer(), nullable=True))
        b.add_column(sa.Column('visibility', sa.String(length=12), nullable=False, server_default='public'))
        b.add_column(sa.Column('class_ids', sa.JSON(), nullable=True))
        b.add_column(sa.Column('created_at', app.models.DateTime(timezone=True), nullable=True))
        b.create_foreign_key('fk_paths_owner_id_users', 'users', ['owner_id'], ['id'])


def downgrade() -> None:
    with op.batch_alter_table('paths') as b:
        b.drop_constraint('fk_paths_owner_id_users', type_='foreignkey')
        b.drop_column('created_at')
        b.drop_column('class_ids')
        b.drop_column('visibility')
        b.drop_column('owner_id')
        b.drop_column('level')
        b.drop_column('language')
