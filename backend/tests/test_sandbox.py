"""Mode Sandbox: projects, file saves with rev, snapshots, replay, gallery visibility, stars and remix."""
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.models import Klass, Notebook, User
from app.security import hash_password
from app.services import sandbox as sb

from tests.conftest import PASSWORD, login


def _other_class_user(db) -> None:
    """A learner in a different class (XI) for the visibility checks."""
    if db.scalar(select(User).where(User.email == "luar@smksig.sch.id")):
        return
    nadia = db.scalar(select(User).where(User.email == "nadia@smksig.sch.id"))
    other = db.scalar(select(Klass).where(Klass.id != nadia.class_id))
    if other is None:
        other = Klass(org_id=nadia.org_id, name="XI RPL")
        db.add(other)
        db.flush()
    db.add(User(email="luar@smksig.sch.id", name="Luar Kelas", password_hash=hash_password(PASSWORD), role="learner", class_id=other.id,
                org_id=nadia.org_id, onboarded=True, prefs={}))
    db.commit()


def _new(c: TestClient, **kw) -> dict:
    r = c.post("/api/sandbox", json={"kind": "web", "stack": "static", "title": "Kartu uji", **kw})
    assert r.status_code == 200, r.text
    return r.json()


def test_create_list_and_legacy_program_format(client, db):
    login(client, "nadia@smksig.sch.id")
    p = _new(client)
    assert p["kind"] == "web" and p["can_edit"] and p["rev"] == 0 and "index.html" in p["files"]
    assert any(i["id"] == p["id"] for i in client.get("/api/sandbox").json()["items"])
    prog = client.post("/api/sandbox", json={"kind": "program", "lang": "python", "files": {"util.py": "X = 1\n"}}).json()
    assert prog["entry"] == "main.py" and set(prog["files"]) == {"main.py", "util.py"}
    # baris lama {code, stdin} tetap terbaca sebagai satu berkas utama
    nadia = db.scalar(select(User).where(User.email == "nadia@smksig.sch.id"))
    old = Notebook(user_id=nadia.id, title="Lama", kind="program", lang="python", cells=[], files={"code": "print(1)", "stdin": "a"})
    db.add(old)
    db.commit()
    v = client.get(f"/api/sandbox/{old.id}").json()
    assert v["files"] == {"main.py": "print(1)"} and v["stdin"] == "a" and v["entry"] == "main.py"


def test_file_saves_use_rev_and_keep_entry(client):
    login(client, "nadia@smksig.sch.id")
    p = client.post("/api/sandbox", json={"kind": "program", "lang": "python"}).json()
    r = client.patch(f"/api/sandbox/{p['id']}/files", json={"rev": 0, "write": {"main.py": "print('hai')\n", "lib.py": "Y = 2\n"}})
    assert r.status_code == 200 and r.json()["rev"] == 1
    stale = client.patch(f"/api/sandbox/{p['id']}/files", json={"rev": 0, "write": {"main.py": "x"}})
    assert stale.status_code == 409 and stale.json()["detail"]["code"] == "stale"
    assert client.patch(f"/api/sandbox/{p['id']}/files", json={"rev": 1, "delete": ["main.py"]}).status_code == 400
    assert client.patch(f"/api/sandbox/{p['id']}/files", json={"rev": 1, "write": {"../x.py": "1"}}).status_code == 400
    ok = client.patch(f"/api/sandbox/{p['id']}/files", json={"rev": 1, "rename": {"lib.py": "alat.py"}}).json()
    assert ok["rev"] == 2
    assert set(client.get(f"/api/sandbox/{p['id']}").json()["files"]) == {"main.py", "alat.py"}


def test_snapshots_and_restore(client):
    login(client, "nadia@smksig.sch.id")
    p = _new(client)
    first = client.get(f"/api/sandbox/{p['id']}/snapshots").json()["items"]
    assert len(first) == 1 and first[0]["auto"]  # "Awal proyek"
    assert client.post(f"/api/sandbox/{p['id']}/snapshots", json={"label": "sama"}).json()["created"] is False
    client.patch(f"/api/sandbox/{p['id']}/files", json={"write": {"index.html": "<h1>Baru</h1>\n"}})
    s = client.post(f"/api/sandbox/{p['id']}/snapshots", json={"label": "judul baru"}).json()
    assert s["created"] and s["snapshot"]["stats"]["add"] >= 1
    files = client.get(f"/api/sandbox/{p['id']}/snapshots/{first[0]['id']}").json()["files"]
    assert files["index.html"] != "<h1>Baru</h1>\n"
    client.patch(f"/api/sandbox/{p['id']}/files", json={"write": {"index.html": "<h1>Belum disimpan</h1>\n"}})
    back = client.post(f"/api/sandbox/{p['id']}/snapshots/{first[0]['id']}/restore").json()
    assert back["files"]["index.html"] == files["index.html"] and back["rev"] >= 2
    labels = [x["label"] for x in client.get(f"/api/sandbox/{p['id']}/snapshots").json()["items"]]
    assert "Sebelum dipulihkan" in labels


def test_replay_roundtrip_and_caps(client, monkeypatch):
    login(client, "nadia@smksig.sch.id")
    p = _new(client)
    ev = [[120, "index.html", [[0, "<"]]], [80, "index.html", [1, [0, "p"]]]]
    assert client.post(f"/api/sandbox/{p['id']}/replay", json={"session": "abc123", "seq": 0, "events": ev}).json()["stored"]
    assert client.post(f"/api/sandbox/{p['id']}/replay", json={"session": "abc123", "seq": 1, "events": ev}).json()["stored"]
    dup = client.post(f"/api/sandbox/{p['id']}/replay", json={"session": "abc123", "seq": 1, "events": ev}).json()
    assert dup.get("duplicate")
    sessions = client.get(f"/api/sandbox/{p['id']}/replay").json()["items"]
    assert sessions[0]["session"] == "abc123" and sessions[0]["events"] == 4
    got = client.get(f"/api/sandbox/{p['id']}/replay/abc123").json()
    assert got["events"] == ev + ev and "index.html" in got["base"]
    monkeypatch.setattr(sb, "MAX_REPLAY_BYTES", 10)
    assert client.post(f"/api/sandbox/{p['id']}/replay", json={"session": "abc123", "seq": 2, "events": ev}).json()["stored"] is False
    assert client.post(f"/api/sandbox/{p['id']}/replay", json={"session": "../x", "seq": 0, "events": []}).status_code == 422


def test_visibility_star_and_remix(client, db):
    _other_class_user(db)
    login(client, "nadia@smksig.sch.id")
    p = _new(client, title="Pameran")
    pid = p["id"]
    # teman sekelas belum bisa melihat proyek pribadi
    alex = TestClient(app)
    login(alex, "alex@smksig.sch.id")
    assert alex.get(f"/api/sandbox/{pid}").status_code == 404
    # galeri publik tertutup secara default
    assert client.post(f"/api/sandbox/{pid}/publish", json={"visibility": "public"}).status_code == 403
    pub = client.post(f"/api/sandbox/{pid}/publish", json={"visibility": "class", "description": "Coba!", "share_replay": True}).json()
    assert pub["visibility"] == "class" and pub["published"]
    assert any(i["id"] == pid for i in alex.get("/api/gallery?scope=class").json()["items"])
    item = alex.get(f"/api/gallery/{pid}").json()
    assert item["can_edit"] is False and item["replay"] is True
    assert alex.patch(f"/api/sandbox/{pid}/files", json={"write": {"x.html": "1"}}).status_code == 403
    # beda kelas tidak bisa melihat
    luar = TestClient(app)
    login(luar, "luar@smksig.sch.id")
    assert luar.get(f"/api/gallery/{pid}").status_code == 404
    assert all(i["id"] != pid for i in luar.get("/api/gallery?scope=class").json()["items"])
    # bintang idempoten
    assert alex.put(f"/api/gallery/{pid}/star").json() == {"stars": 1, "starred": True}
    assert alex.put(f"/api/gallery/{pid}/star").json()["stars"] == 1
    assert alex.delete(f"/api/gallery/{pid}/star").json() == {"stars": 0, "starred": False}
    assert alex.delete(f"/api/gallery/{pid}/star").json()["stars"] == 0
    # remix menyalin berkas dan mencatat asalnya
    rx = alex.post(f"/api/gallery/{pid}/remix").json()
    assert rx["can_edit"] and rx["remix_of"]["id"] == pid and rx["files"] == client.get(f"/api/sandbox/{pid}").json()["files"]
    quests = alex.get("/api/quests").json()["items"]
    assert next(q for q in quests if q["id"] == "share")["n"] == 1
    # mentor kelas boleh melihat proyek pribadi siswanya, admin juga
    mentor = TestClient(app)
    login(mentor, "dimas@smksig.sch.id")
    client.post(f"/api/sandbox/{pid}/unpublish")
    assert mentor.get(f"/api/sandbox/{pid}").status_code == 200
    assert alex.get(f"/api/gallery/{pid}").status_code == 404
    admin = TestClient(app)
    login(admin, "sekar@smksig.sch.id")
    assert admin.put("/api/admin/os", json={"gallery_public": True}).json()["gallery_public"] is True
    assert client.post(f"/api/sandbox/{pid}/publish", json={"visibility": "public"}).status_code == 200
    assert luar.get(f"/api/gallery/{pid}").status_code == 200
    admin.put("/api/admin/os", json={"gallery_public": False})
    assert alex.put("/api/admin/os", json={"gallery_public": True}).status_code == 403


def test_quests_claim_once(client):
    login(client, "maya@smksig.sch.id")
    p = _new(client)
    for _ in range(3):
        assert client.post(f"/api/sandbox/{p['id']}/ran").status_code == 200
    q = client.get("/api/quests").json()["items"]
    assert next(x for x in q if x["id"] == "run")["n"] == 3
    got = client.post("/api/quests/claim").json()
    assert got["xp"] >= 30
    assert client.post("/api/quests/claim").json()["xp"] == 0
    assert "quests" in client.get("/api/home").json()


def test_program_run_goes_through_runner(client, monkeypatch):
    login(client, "nadia@smksig.sch.id")
    p = client.post("/api/sandbox", json={"kind": "program", "lang": "python", "files": {"util.py": "NAMA = 'Orvi'\n"}}).json()
    seen = {}

    def fake(lang, code, stdin="", tests=None, **kw):
        seen.update(lang=lang, code=code, stdin=stdin, files=kw.get("files"))
        return {"ok": True, "run": {"stdout": "Halo\n", "exit": 0}, "error": None, "diagnostics": []}

    monkeypatch.setattr(sb.runner, "execute", fake)
    monkeypatch.setattr(sb.runner, "check_rate", lambda uid: None)
    r = client.post(f"/api/sandbox/{p['id']}/run", json={"stdin": "Nadia"})
    assert r.status_code == 200 and r.json()["stdout"] == ["Halo"]
    assert seen["lang"] == "python" and seen["stdin"] == "Nadia" and seen["files"] == {"util.py": "NAMA = 'Orvi'\n"}
    web = _new(client)
    assert client.post(f"/api/sandbox/{web['id']}/run", json={}).status_code == 400
