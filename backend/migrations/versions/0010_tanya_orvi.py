"""Tanya Orvi: ai_usage (batas bergulir) dan ai_feedback

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-01 22:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

import app.models


revision: str = '0010'
down_revision: Union[str, Sequence[str], None] = '0009'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TS = lambda name, nullable=False: sa.Column(name, app.models.DateTime(timezone=True), nullable=nullable)  # noqa: E731


def upgrade() -> None:
    op.create_table(
        'ai_usage',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('model', sa.String(length=80), nullable=False),
        TS('at'),
    )
    op.create_index('ix_ai_usage_user_id', 'ai_usage', ['user_id'])
    op.create_index('ix_ai_usage_at', 'ai_usage', ['at'])
    op.create_table(
        'ai_feedback',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('nilai', sa.String(length=8), nullable=False),
        sa.Column('alasan', sa.String(length=40), nullable=False),
        sa.Column('sumber', sa.String(length=80), nullable=False),
        TS('at'),
    )
    op.create_index('ix_ai_feedback_user_id', 'ai_feedback', ['user_id'])


def downgrade() -> None:
    op.drop_table('ai_feedback')
    op.drop_table('ai_usage')
