"""lencana: tabel user_badges

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-30 20:30:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

import app.models


revision: str = '0005'
down_revision: Union[str, Sequence[str], None] = '0004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'user_badges',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(length=40), nullable=False),
        sa.Column('earned_at', app.models.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'code'),
    )
    op.create_index(op.f('ix_user_badges_user_id'), 'user_badges', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_user_badges_user_id'), table_name='user_badges')
    op.drop_table('user_badges')
