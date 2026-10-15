"""google: users.google_sub, password_hash boleh kosong (akun khusus Google)

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-30 21:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0006'
down_revision: Union[str, Sequence[str], None] = '0005'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('users') as b:
        b.add_column(sa.Column('google_sub', sa.String(length=64), nullable=True))
        b.create_unique_constraint('uq_users_google_sub', ['google_sub'])
        b.alter_column('password_hash', existing_type=sa.String(length=200), nullable=True)


def downgrade() -> None:
    # akun khusus Google tidak punya kata sandi; beri nilai yang tidak pernah cocok supaya kolomnya bisa NOT NULL lagi
    op.execute("UPDATE users SET password_hash = '!' WHERE password_hash IS NULL")
    with op.batch_alter_table('users') as b:
        b.alter_column('password_hash', existing_type=sa.String(length=200), nullable=False)
        b.drop_constraint('uq_users_google_sub', type_='unique')
        b.drop_column('google_sub')
