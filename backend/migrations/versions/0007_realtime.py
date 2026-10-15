"""realtime: anggota & tautan ngoding bareng, duel, kuis langsung, angkat tangan, riwayat Yjs proyek

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-30 21:30:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

import app.models


revision: str = '0007'
down_revision: Union[str, Sequence[str], None] = '0006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TS = lambda name, nullable=False: sa.Column(name, app.models.DateTime(timezone=True), nullable=nullable)  # noqa: E731


def upgrade() -> None:
    with op.batch_alter_table('notebooks') as b:
        b.add_column(sa.Column('ystate', sa.LargeBinary(), nullable=True))
        b.add_column(sa.Column('ygen', sa.String(length=16), nullable=True))
    op.create_table(
        'notebook_members',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('notebook_id', sa.Integer(), sa.ForeignKey('notebooks.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(length=8), nullable=False),
        TS('added_at'),
        sa.UniqueConstraint('notebook_id', 'user_id'),
    )
    op.create_index('ix_notebook_members_notebook_id', 'notebook_members', ['notebook_id'])
    op.create_index('ix_notebook_members_user_id', 'notebook_members', ['user_id'])
    op.create_table(
        'kolab_links',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('notebook_id', sa.Integer(), sa.ForeignKey('notebooks.id', ondelete='CASCADE'), nullable=False),
        sa.Column('code', sa.String(length=12), nullable=False, unique=True),
        sa.Column('role', sa.String(length=8), nullable=False),
        TS('created_at'), TS('expires_at'),
        sa.Column('revoked', sa.Boolean(), nullable=False),
    )
    op.create_index('ix_kolab_links_notebook_id', 'kolab_links', ['notebook_id'])
    op.create_table(
        'duels',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('a_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('b_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('lang', sa.String(length=20), nullable=False),
        sa.Column('path_id', sa.Integer(), sa.ForeignKey('paths.id', ondelete='SET NULL'), nullable=True),
        sa.Column('questions', sa.JSON(), nullable=False),
        sa.Column('state', sa.String(length=10), nullable=False),
        TS('created_at'), TS('started_at', True), TS('ends_at', True),
        sa.Column('a_answers', sa.JSON(), nullable=False),
        sa.Column('b_answers', sa.JSON(), nullable=False),
        sa.Column('a_score', sa.Integer(), nullable=False),
        sa.Column('b_score', sa.Integer(), nullable=False),
        sa.Column('winner_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
    )
    op.create_index('ix_duels_a_id', 'duels', ['a_id'])
    op.create_index('ix_duels_b_id', 'duels', ['b_id'])
    op.create_table(
        'live_quizzes',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('host_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('class_id', sa.Integer(), sa.ForeignKey('classes.id', ondelete='SET NULL'), nullable=True),
        sa.Column('pin', sa.String(length=6), nullable=False),
        sa.Column('title', sa.String(length=120), nullable=False),
        sa.Column('questions', sa.JSON(), nullable=False),
        sa.Column('seconds', sa.Integer(), nullable=False),
        sa.Column('state', sa.String(length=8), nullable=False),
        TS('created_at'), TS('finished_at', True),
    )
    op.create_index('ix_live_quizzes_host_id', 'live_quizzes', ['host_id'])
    op.create_index('ix_live_quizzes_pin', 'live_quizzes', ['pin'])
    op.create_table(
        'live_quiz_answers',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('quiz_id', sa.Integer(), sa.ForeignKey('live_quizzes.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('q_index', sa.Integer(), nullable=False),
        sa.Column('choice', sa.Integer(), nullable=False),
        sa.Column('correct', sa.Boolean(), nullable=False),
        sa.Column('points', sa.Integer(), nullable=False),
        sa.Column('ms', sa.Integer(), nullable=False),
        TS('created_at'),
        sa.UniqueConstraint('quiz_id', 'user_id', 'q_index'),
    )
    op.create_index('ix_live_quiz_answers_quiz_id', 'live_quiz_answers', ['quiz_id'])
    op.create_table(
        'help_requests',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('learner_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('mentor_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('context', sa.String(length=12), nullable=False),
        sa.Column('ref', sa.String(length=160), nullable=False),
        sa.Column('message', sa.String(length=300), nullable=False),
        sa.Column('state', sa.String(length=8), nullable=False),
        TS('created_at'), TS('taken_at', True), TS('done_at', True),
    )
    op.create_index('ix_help_requests_learner_id', 'help_requests', ['learner_id'])
    op.create_index('ix_help_requests_mentor_id', 'help_requests', ['mentor_id'])


def downgrade() -> None:
    for t in ('help_requests', 'live_quiz_answers', 'live_quizzes', 'duels', 'kolab_links', 'notebook_members'):
        op.drop_table(t)
    with op.batch_alter_table('notebooks') as b:
        b.drop_column('ygen')
        b.drop_column('ystate')
