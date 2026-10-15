"""keamanan & log admin: admin_events, login_attempts, password_resets, users.pw_changed_at

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-01 17:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

import app.models


revision: str = '0009'
down_revision: Union[str, Sequence[str], None] = '0008'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TS = lambda name, nullable=False: sa.Column(name, app.models.DateTime(timezone=True), nullable=nullable)  # noqa: E731


def upgrade() -> None:
    with op.batch_alter_table('users') as b:
        b.add_column(TS('pw_changed_at', nullable=True))
    op.create_table(
        'admin_events',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('actor_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('action', sa.String(length=40), nullable=False),
        sa.Column('target_id', sa.Integer(), nullable=True),
        sa.Column('detail', sa.JSON(), nullable=False),
        TS('at'),
    )
    op.create_index('ix_admin_events_actor_id', 'admin_events', ['actor_id'])
    op.create_index('ix_admin_events_at', 'admin_events', ['at'])
    op.create_table(
        'login_attempts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('kind', sa.String(length=8), nullable=False),
        sa.Column('email', sa.String(length=200), nullable=False),
        sa.Column('ip', sa.String(length=64), nullable=False),
        TS('at'),
    )
    op.create_index('ix_login_attempts_email', 'login_attempts', ['email'])
    op.create_index('ix_login_attempts_ip', 'login_attempts', ['ip'])
    op.create_index('ix_login_attempts_at', 'login_attempts', ['at'])
    op.create_table(
        'password_resets',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False, unique=True),
        TS('expires_at'),
        TS('used_at', nullable=True),
        TS('created_at'),
    )
    op.create_index('ix_password_resets_user_id', 'password_resets', ['user_id'])


def downgrade() -> None:
    op.drop_table('password_resets')
    op.drop_table('login_attempts')
    op.drop_table('admin_events')
    with op.batch_alter_table('users') as b:
        b.drop_column('pw_changed_at')
