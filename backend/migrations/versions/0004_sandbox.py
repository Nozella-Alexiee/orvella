"""sandbox: galeri, remix, snapshot, replay, bintang

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-28 18:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

import app.models


revision: str = '0004'
down_revision: Union[str, Sequence[str], None] = '0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('notebooks') as b:
        b.add_column(sa.Column('description', sa.Text(), nullable=False, server_default=''))
        b.add_column(sa.Column('visibility', sa.String(length=8), nullable=False, server_default='private'))
        b.add_column(sa.Column('remix_of_id', sa.Integer(), nullable=True))
        b.add_column(sa.Column('published_at', app.models.DateTime(timezone=True), nullable=True))
        b.add_column(sa.Column('star_count', sa.Integer(), nullable=False, server_default='0'))
        b.add_column(sa.Column('share_replay', sa.Boolean(), nullable=False, server_default=sa.false()))
        b.add_column(sa.Column('rev', sa.Integer(), nullable=False, server_default='0'))
        b.create_foreign_key('fk_notebooks_remix_of_id_notebooks', 'notebooks', ['remix_of_id'], ['id'], ondelete='SET NULL')
        b.create_index('ix_notebooks_gallery', ['visibility', 'published_at'])

    op.create_table(
        'notebook_snapshots',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('notebook_id', sa.Integer(), sa.ForeignKey('notebooks.id', ondelete='CASCADE'), nullable=False),
        sa.Column('label', sa.String(length=120), nullable=False),
        sa.Column('files', sa.JSON(), nullable=False),
        sa.Column('stats', sa.JSON(), nullable=False),
        sa.Column('auto', sa.Boolean(), nullable=False),
        sa.Column('created_at', app.models.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_notebook_snapshots_notebook_id', 'notebook_snapshots', ['notebook_id'])

    op.create_table(
        'notebook_replays',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('notebook_id', sa.Integer(), sa.ForeignKey('notebooks.id', ondelete='CASCADE'), nullable=False),
        sa.Column('session', sa.String(length=16), nullable=False),
        sa.Column('seq', sa.Integer(), nullable=False),
        sa.Column('base_snapshot_id', sa.Integer(), sa.ForeignKey('notebook_snapshots.id', ondelete='SET NULL'), nullable=True),
        sa.Column('data', sa.LargeBinary(), nullable=False),
        sa.Column('n_events', sa.Integer(), nullable=False),
        sa.Column('created_at', app.models.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('notebook_id', 'session', 'seq'),
    )
    op.create_index('ix_notebook_replays_notebook_id', 'notebook_replays', ['notebook_id'])

    op.create_table(
        'notebook_stars',
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('notebook_id', sa.Integer(), sa.ForeignKey('notebooks.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('created_at', app.models.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('notebook_stars')
    op.drop_index('ix_notebook_replays_notebook_id', table_name='notebook_replays')
    op.drop_table('notebook_replays')
    op.drop_index('ix_notebook_snapshots_notebook_id', table_name='notebook_snapshots')
    op.drop_table('notebook_snapshots')
    with op.batch_alter_table('notebooks') as b:
        b.drop_index('ix_notebooks_gallery')
        b.drop_constraint('fk_notebooks_remix_of_id_notebooks', type_='foreignkey')
        b.drop_column('rev')
        b.drop_column('share_replay')
        b.drop_column('star_count')
        b.drop_column('published_at')
        b.drop_column('remix_of_id')
        b.drop_column('visibility')
        b.drop_column('description')
