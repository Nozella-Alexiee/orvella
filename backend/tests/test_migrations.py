"""Alembic migrations 0004+ run up and down on a fresh SQLite file (the rest of the suite uses create_all)."""
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_upgrade_downgrade_head():
    db = Path(tempfile.mkdtemp(prefix="orvella-mig-")) / "m.db"
    env = {**os.environ, "ORVELLA_DATABASE_URL": f"sqlite:///{db.as_posix()}"}
    run = lambda *a: subprocess.run([sys.executable, "-m", "alembic", *a], cwd=ROOT, env=env, capture_output=True, text=True, timeout=120)
    up = run("upgrade", "head")
    assert up.returncode == 0, up.stderr[-2000:]
    down = run("downgrade", "0003")
    assert down.returncode == 0, down.stderr[-2000:]
    again = run("upgrade", "head")
    assert again.returncode == 0, again.stderr[-2000:]
