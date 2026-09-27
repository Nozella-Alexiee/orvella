"""Bring the database schema up to date with Alembic.

    python -m app.migrate

A database created earlier by ``Base.metadata.create_all`` (before Alembic existed)
is stamped at the first revision instead of being recreated.
"""
from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from .db import engine

BACKEND_DIR = Path(__file__).resolve().parent.parent


def upgrade() -> None:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    cfg.attributes["configure_logger"] = False
    tables = set(inspect(engine).get_table_names())
    if "users" in tables and "alembic_version" not in tables:
        command.stamp(cfg, "0001")
    command.upgrade(cfg, "head")


if __name__ == "__main__":
    upgrade()
    print("Skema database sudah terbaru.")
