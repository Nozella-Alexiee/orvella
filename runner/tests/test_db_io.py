"""Unduh/impor database proyek (SQLite) dan penjagaan konsol SQL. Tidak butuh Docker."""
import os
import sqlite3
import tempfile
from pathlib import Path

import pytest

os.environ.setdefault("WORKSPACES_DIR", tempfile.mkdtemp(prefix="orv-ws-"))

from orv_runner import workspace  # noqa: E402

SEED = """CREATE TABLE buku (id INTEGER PRIMARY KEY, judul TEXT NOT NULL, tahun INTEGER);
INSERT INTO buku (judul, tahun) VALUES ('Laskar Pelangi', 2005);
INSERT INTO buku (judul, tahun) VALUES ('Bumi Manusia', 1980);
"""


@pytest.fixture(autouse=True)
def _no_chown(monkeypatch):
    monkeypatch.setattr(os, "chown", lambda *a, **k: None)


def _sid(name: str) -> str:
    sid = f"p{abs(hash(name)) % 10_000_000}"
    workspace.workdir(sid).mkdir(parents=True, exist_ok=True)
    return sid


def test_load_creates_database_then_dump_roundtrips():
    sid = _sid("roundtrip")
    r = workspace.load(sid, "sqlite", SEED)
    assert r["file"] == "data.db" and r["statements"] == 3
    d = workspace.dump(sid, "sqlite")
    assert d["tables"] == 1 and "Laskar Pelangi" in d["sql"]

    other = _sid("roundtrip-target")
    workspace.load(other, "sqlite", d["sql"], "app.db")
    rows = workspace.query(other, "sqlite", "SELECT judul FROM buku ORDER BY tahun", "app.db")["rows"]
    assert rows == [["Bumi Manusia"], ["Laskar Pelangi"]]


def test_attach_is_denied_in_console_and_import():
    victim = _sid("victim")
    workspace.load(victim, "sqlite", "CREATE TABLE rahasia (x TEXT); INSERT INTO rahasia VALUES ('punya orang lain');")
    target = Path(workspace.workdir(victim)) / "data.db"
    sid = _sid("attacker")
    workspace.load(sid, "sqlite", "CREATE TABLE t (x);")
    with pytest.raises(sqlite3.DatabaseError):
        workspace.query(sid, "sqlite", f"ATTACH DATABASE '{target}' AS v", "data.db")
    with pytest.raises(sqlite3.DatabaseError):
        workspace.load(sid, "sqlite", f"ATTACH DATABASE '{target}' AS v; SELECT * FROM v.rahasia;")


def test_vacuum_into_is_rejected():
    sid = _sid("vacuum")
    workspace.load(sid, "sqlite", "CREATE TABLE t (x);")
    with pytest.raises(ValueError):
        workspace.query(sid, "sqlite", "VACUUM INTO '/tmp/salinan.db'", "data.db")
    with pytest.raises(ValueError):
        workspace.load(sid, "sqlite", "vacuum   main into '/tmp/salinan.db';")


def test_limits_and_bad_names():
    sid = _sid("limits")
    with pytest.raises(ValueError):
        workspace.load(sid, "sqlite", "-- " + "x" * (workspace.MAX_SQL_BYTES + 10))
    with pytest.raises(ValueError):
        workspace.load(sid, "sqlite", "SELECT 1;", "../keluar.db")
    with pytest.raises(FileNotFoundError):
        workspace.dump(_sid("kosong"), "sqlite")


def test_dump_can_be_imported_again_over_existing_tables():
    sid = _sid("reimport")
    workspace.load(sid, "sqlite", SEED)
    d = workspace.dump(sid, "sqlite")
    workspace.load(sid, "sqlite", d["sql"])  # tabel sudah ada: tidak boleh gagal, tidak boleh dobel
    assert workspace.query(sid, "sqlite", "SELECT COUNT(*) FROM buku", "data.db")["rows"] == [[2]]
