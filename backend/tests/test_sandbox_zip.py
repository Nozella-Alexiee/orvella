"""Unduh & impor proyek Sandbox sebagai .zip, termasuk database proyek web (runner dipalsukan)."""
import io
import json
import zipfile

import pytest

from app.routers import sandbox as sandbox_router
from app.routers import webproj
from app.services import runner

from tests.conftest import login


def _zip(entries: dict[str, str | bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, body in entries.items():
            z.writestr(name, body)
    return buf.getvalue()


def _import(c, data: bytes, name: str = "proyek.zip"):
    return c.post("/api/sandbox/import", files={"file": (name, data, "application/zip")})


@pytest.fixture()
def fake_runner(monkeypatch):
    calls: list[tuple[str, str, dict | None]] = []
    replies: dict[str, dict] = {}

    def call(method, path, body=None, params=None):
        calls.append((method, path, body or params))
        for key, r in replies.items():
            if key in path:
                if isinstance(r, Exception):
                    raise r
                return r
        return {"state": "running", "since": 9}

    monkeypatch.setattr(runner, "configured", lambda: True)
    monkeypatch.setattr(runner, "call", call)
    monkeypatch.setattr(runner, "check_rate", lambda uid: None)
    return calls, replies


def test_program_roundtrip(client):
    login(client, "nadia@smksig.sch.id")
    p = client.post("/api/sandbox", json={"kind": "program", "lang": "python", "title": "Kalkulator", "files": {"util.py": "X = 2\n"}}).json()
    r = client.get(f"/api/sandbox/{p['id']}/export")
    assert r.status_code == 200 and r.headers["content-type"] == "application/zip" and r.headers["x-orvella-database"] == "0"
    z = zipfile.ZipFile(io.BytesIO(r.content))
    manifest = json.loads(z.read("orvella.json"))
    assert manifest["kind"] == "program" and manifest["lang"] == "python" and manifest["entry"] == "main.py"
    assert set(z.namelist()) == {"orvella.json", "main.py", "util.py"}

    back = _import(client, r.content).json()
    assert back["title"] == "Kalkulator" and back["kind"] == "program" and back["files"]["util.py"] == "X = 2\n"
    assert back["id"] != p["id"] and back["can_edit"]


def test_plain_zip_with_root_folder_becomes_static_site(client):
    login(client, "nadia@smksig.sch.id")
    data = _zip({"kartu/index.html": "<h1>Hai</h1>", "kartu/css/gaya.css": "h1{color:red}", "kartu/logo.png": b"\x89PNG\x00\x01", "__MACOSX/._x": "x"})
    r = _import(client, data, "kartu.zip")
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["kind"] == "web" and p["stack"] == "static" and p["title"] == "kartu"
    assert set(p["files"]) == {"index.html", "css/gaya.css"} and p["skipped"] == ["logo.png"]


def test_unsafe_and_oversized_zips_are_refused(client, monkeypatch):
    login(client, "nadia@smksig.sch.id")
    assert _import(client, _zip({"../../etc/cron.d/x": "boom", "main.py": "print(1)"})).status_code == 400
    assert _import(client, b"bukan zip").status_code == 400
    assert _import(client, _zip({"catatan.txt": "tidak ada kode"})).status_code == 400
    monkeypatch.setattr(sandbox_router.sandbox_zip, "MAX_TOTAL", 10)
    assert _import(client, _zip({"main.py": "print('panjang sekali')"})).status_code == 413


def test_web_database_travels_in_the_zip(client, fake_runner):
    calls, replies = fake_runner
    login(client, "nadia@smksig.sch.id")
    p = client.post("/api/sandbox", json={"kind": "web", "stack": "node", "title": "Buku tamu"}).json()
    replies["/db/dump"] = {"sql": "CREATE TABLE tamu (nama TEXT);\nINSERT INTO tamu VALUES ('Raka');\n", "tables": 1, "file": "tamu.db"}
    r = client.get(f"/api/sandbox/{p['id']}/export")
    assert r.headers["x-orvella-database"] == "1"
    z = zipfile.ZipFile(io.BytesIO(r.content))
    assert "INSERT INTO tamu" in z.read("database.sql").decode()
    assert json.loads(z.read("orvella.json"))["db"] == {"engine": "sqlite", "file": "tamu.db"}

    back = _import(client, r.content).json()
    assert back["db_seed"] and back["stack"] == "node"
    calls.clear()
    # server pertama kali dinyalakan: database dimuat dulu, baru server start, lalu seed dibuang
    assert client.post(f"/api/web/{back['id']}/start").status_code == 200
    assert [c[1] for c in calls[:2]] == [f"/sessions/p{back['id']}/db/load", "/sessions"]
    assert calls[0][2]["file"] == "tamu.db" and "Raka" in calls[0][2]["sql"]
    calls.clear()
    client.post(f"/api/web/{back['id']}/start")
    assert not any("db/load" in c[1] for c in calls)


def test_dump_and_load_endpoints_and_privacy(client, fake_runner):
    calls, replies = fake_runner
    login(client, "nadia@smksig.sch.id")
    p = client.post("/api/sandbox", json={"kind": "web", "stack": "php", "title": "Tugas"}).json()
    replies["/db/dump"] = {"sql": "-- kosong\n", "tables": 0}
    assert client.get(f"/api/web/{p['id']}/db/dump").json()["tables"] == 0
    assert calls[-1][2]["engine"] == "mysql"
    replies["/db/load"] = {"ok": True, "statements": 2}
    assert client.post(f"/api/web/{p['id']}/db/load", json={"sql": "CREATE TABLE a (x INT); INSERT INTO a VALUES (1);"}).json()["statements"] == 2
    replies["/db/load"] = runner.RunnerRejected("Impor gagal: syntax error")
    r = client.post(f"/api/web/{p['id']}/db/load", json={"sql": "SELEC"})
    assert r.status_code == 400 and "syntax" in r.json()["detail"]
    # database proyek orang lain tidak bisa diunduh lewat endpoint web
    login(client, "salsa@smksig.sch.id")
    assert client.get(f"/api/web/{p['id']}/db/dump").status_code == 404
    assert webproj.apply_db_seed  # dipakai start()
