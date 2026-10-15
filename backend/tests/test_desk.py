"""Desktop Orvella OS: level, lencana, Tebak output harian, timer fokus, dan batas prefs per kunci."""
import uuid
from datetime import datetime

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models import ChapterProgress, QuizRound, User, UserBadge, XpEvent
from app.routers import sandbox as sandbox_router
from app.services import activity, badges

from .conftest import login


import pytest


@pytest.fixture(autouse=True)
def daytime(monkeypatch):
    """Lencana "Si begadang" tergantung jam; tes lain di sini berjalan seolah siang hari."""
    monkeypatch.setattr(badges, "is_night", lambda: False)


def _fresh(c: TestClient) -> dict:
    email = f"desk-{uuid.uuid4().hex[:6]}@contoh.id"
    r = c.post("/api/auth/register", json={"name": "Desk", "email": email, "password": "rahasia-123"})
    assert r.status_code == 200
    r = c.post("/api/onboarding", json={"goal": "penasaran", "placement": "c", "daily_goal_min": 10})
    assert r.status_code == 200
    return r.json()["me"]


# ------------------------------------------------------------------- level ---
def test_level_formula():
    assert [activity.level_start(n) for n in range(1, 6)] == [0, 100, 250, 450, 700]
    assert activity.level_of(0) == {"level": 1, "level_xp": 0, "next_xp": 100}
    assert activity.level_of(99)["level"] == 1
    assert activity.level_of(100) == {"level": 2, "level_xp": 0, "next_xp": 150}
    assert activity.level_of(460) == {"level": 4, "level_xp": 10, "next_xp": 250}


def test_me_has_level_and_hides_private_prefs(client, db):
    me = _fresh(client)
    assert me["level"] == 1 and me["next_xp"] == 100
    u = db.get(User, me["id"])
    u.prefs = {**u.prefs, "_lencana": {"fixes": 3}}
    db.add(XpEvent(user_id=u.id, amount=260, reason="uji"))
    db.commit()
    me = client.get("/api/me").json()
    assert me["level"] == 3 and me["level_xp"] == 10
    assert "_lencana" not in me["prefs"]


# ------------------------------------------------------------------- prefs ---
def test_note_pref_has_its_own_limit(client):
    _fresh(client)
    note = "catatan " * 300  # ± 2400 karakter: lebih dari 500, masih di bawah 3000
    r = client.patch("/api/me", json={"prefs": {"note": note}})
    assert r.status_code == 200 and r.json()["prefs"]["note"] == note
    r = client.patch("/api/me", json={"prefs": {"note": "x" * 3100}})
    assert r.status_code == 422 and r.json()["detail"]["keys"] == ["note"]
    r = client.patch("/api/me", json={"prefs": {"music": "y" * 600}})
    assert r.status_code == 422
    assert client.get("/api/me").json()["prefs"]["note"] == note  # tidak ikut terhapus
    # kunci privat tidak bisa ditulis dari luar
    client.patch("/api/me", json={"prefs": {"_lencana": {"fixes": 99}}})
    assert client.get("/api/lencana").json()["earned"] == 0


# ------------------------------------------------------------------ lencana ---
def test_badges_are_awarded_once(client, db):
    me = _fresh(client)
    u = db.get(User, me["id"])
    assert badges.evaluate(db, u) == []
    # Pahami selesai → "Paham!"
    p = db.scalar(select(ChapterProgress).where(ChapterProgress.user_id == u.id))
    p.phases = {**p.phases, "pahami": {**p.phases["pahami"], "state": "done"}}
    db.commit()
    got = badges.evaluate(db, u)
    db.commit()
    assert [b["code"] for b in got] == ["paham"]
    assert badges.evaluate(db, u) == []  # tidak dobel
    # kuis 100%
    db.add(QuizRound(user_id=u.id, kind="daily", question_refs=[], answers=[], finished=True, pct=100))
    db.commit()
    assert [b["code"] for b in badges.evaluate(db, u)] == ["kuis_sempurna"]
    db.commit()
    # malam hari
    assert [b["code"] for b in badges.evaluate(db, u, night=True)] == ["si_begadang"]
    db.commit()
    assert db.scalar(select(UserBadge).where(UserBadge.user_id == u.id, UserBadge.code == "paham")) is not None
    r = client.get("/api/lencana").json()
    assert r["earned"] == 3 and len(r["items"]) == 8
    assert client.get("/api/me").json()["unread"] >= 3  # notifikasi per lencana


def test_bug_fixer_and_first_compile(client, monkeypatch):
    _fresh(client)
    p = client.post("/api/sandbox", json={"kind": "program", "lang": "cpp"}).json()
    results = iter([False, True] * 10)
    monkeypatch.setattr(sandbox_router.sb.runner, "execute", lambda *a, **k: {"ok": next(results), "run": {"stdout": "", "exit": 0}})
    monkeypatch.setattr(sandbox_router.sb.runner, "check_rate", lambda uid: None)
    seen = []
    for _ in range(20):
        r = client.post(f"/api/sandbox/{p['id']}/run", json={})
        assert r.status_code == 200, r.text
        seen += [b["code"] for b in r.json()["lencana_baru"]]
    assert seen == ["kompilasi_pertama", "pembasmi_bug"]


def test_first_web_run(client):
    _fresh(client)
    p = client.post("/api/sandbox", json={"kind": "web", "stack": "static", "title": "Web"}).json()
    r = client.post(f"/api/sandbox/{p['id']}/ran").json()
    assert [b["code"] for b in r["lencana_baru"]] == ["halaman_pertama"]
    assert client.post(f"/api/sandbox/{p['id']}/ran").json()["lencana_baru"] == []


def test_staff_get_no_badges(client, db):
    login(client, "dimas@smksig.sch.id")
    u = db.scalar(select(User).where(User.email == "dimas@smksig.sch.id"))
    assert badges.evaluate(db, u, night=True) == []


# ------------------------------------------------------------- tebak output ---
def test_teka_teki_once_per_day(client, db):
    me = _fresh(client)
    t = client.get("/api/teka-teki")
    assert t.status_code == 200, t.text
    t = t.json()
    assert t["q"]["c"] and len(t["q"]["o"]) >= 2 and t["answered"] is None
    assert "a" not in t["q"] and "e" not in t["q"]  # kunci dan penjelasan tidak bocor
    assert client.get("/api/teka-teki").json()["q"]["id"] == t["q"]["id"]  # soal sama sepanjang hari

    u = db.get(User, me["id"])
    db.refresh(u)
    ref = u.prefs["_teka"]["ref"]
    from app.models import Chapter
    from app.services import content as content_svc
    ch = db.get(Chapter, ref[0])
    q = content_svc.find(content_svc.published(db, ch, None)["kuis"]["bank"], ref[1])

    xp0 = client.get("/api/me").json()["xp_total"]
    r = client.post("/api/teka-teki", json={"choice": q["a"]}).json()
    assert r["answered"]["correct"] and r["answered"]["answer"] == q["a"] and r["answered"]["explain"] == q.get("e", "")
    assert r["gained"] == 5 and r["xp_total"] == xp0 + 5
    again = client.post("/api/teka-teki", json={"choice": q["a"]})
    assert again.status_code == 409
    assert client.get("/api/me").json()["xp_total"] == xp0 + 5
    assert client.get("/api/teka-teki").json()["answered"]["choice"] == q["a"]


def test_teka_teki_wrong_answer_gives_no_xp(client, db):
    me = _fresh(client)
    client.get("/api/teka-teki")
    u = db.get(User, me["id"])
    db.refresh(u)
    ref = u.prefs["_teka"]["ref"]
    from app.models import Chapter
    from app.services import content as content_svc
    q = content_svc.find(content_svc.published(db, db.get(Chapter, ref[0]), None)["kuis"]["bank"], ref[1])
    wrong = (q["a"] + 1) % len(q["o"])
    r = client.post("/api/teka-teki", json={"choice": wrong}).json()
    assert not r["answered"]["correct"] and r["gained"] == 0


# ------------------------------------------------------------- timer fokus ---
def test_pomodoro_counts_per_day(client):
    _fresh(client)
    assert client.post("/api/pomodoro/selesai", json={"minutes": 25}).json() == {"today": 1, "minutes": 25}
    assert client.post("/api/pomodoro/selesai", json={"minutes": 15}).json() == {"today": 2, "minutes": 40}
    assert client.post("/api/pomodoro/selesai", json={"minutes": 0}).status_code == 422


def test_night_window():
    assert isinstance(badges.is_night(), bool)
    assert datetime.now(activity.LOCAL_TZ).tzinfo is not None
