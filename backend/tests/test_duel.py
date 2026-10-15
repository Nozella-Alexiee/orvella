"""Duel 1 lawan 1: hanya teman sekelas, kunci tidak bocor, jawaban berurutan, skor & XP di server, kedaluwarsa."""
import uuid
from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.models import Duel, User, XpEvent, now
from tests.test_presence import _ensure_outsider


def _learner() -> tuple[TestClient, int]:
    c = TestClient(app)
    email = f"duel-{uuid.uuid4().hex[:6]}@contoh.id"
    me = c.post("/api/auth/register", json={"name": "Duelis", "email": email, "password": "rahasia-123"}).json()
    c.post("/api/onboarding", json={"goal": "penasaran", "placement": "c", "daily_goal_min": 10})
    return c, me["id"]


def _xp(db, uid: int) -> int:
    return sum(db.scalars(select(XpEvent.amount).where(XpEvent.user_id == uid)))


def _go(db, duel_id: int) -> Duel:
    """Lewati hitung mundur."""
    d = db.get(Duel, duel_id)
    d.started_at = now() - timedelta(seconds=1)
    db.commit()
    return d


def test_only_classmates(db):
    _ensure_outsider(db)
    a, _ = _learner()
    luar = db.scalar(select(User.id).where(User.email == "luar2@smksig.sch.id"))
    assert a.post("/api/duel", json={"lawan": luar}).status_code == 404


def test_full_duel(db):
    (a, aid), (b, bid) = _learner(), _learner()
    r = a.post("/api/duel", json={"lawan": bid})
    assert r.status_code == 200, r.text
    did = r.json()["id"]
    assert r.json()["state"] == "pending" and r.json()["n"] == 5
    assert a.post("/api/duel", json={"lawan": bid}).status_code == 409  # satu duel per pasangan
    lobby = b.get("/api/duel").json()
    assert [x["id"] for x in lobby["incoming"]] == [did]
    assert a.post(f"/api/duel/{did}/terima").status_code == 409  # hanya yang ditantang yang bisa menerima
    v = b.post(f"/api/duel/{did}/terima").json()
    assert v["state"] == "live" and v["started_at"] > v["now"]
    assert a.post(f"/api/duel/{did}/soal").status_code == 425  # masih hitung mundur
    d = _go(db, did)
    keys = [q["a"] for q in d.questions]
    xa, xb = _xp(db, aid), _xp(db, bid)
    # jawaban harus berurutan
    assert a.post(f"/api/duel/{did}/jawab", json={"index": 2, "choice": 0}).status_code == 409
    for i in range(5):
        qa = a.post(f"/api/duel/{did}/soal").json()
        assert qa["index"] == i and "a" not in qa["q"] and "e" not in qa["q"]
        ra = a.post(f"/api/duel/{did}/jawab", json={"index": i, "choice": keys[i]}).json()
        assert ra["correct"] and ra["points"] >= 100
        b.post(f"/api/duel/{did}/soal")
        rb = b.post(f"/api/duel/{did}/jawab", json={"index": i, "choice": (keys[i] + 1) % 4}).json()
        assert not rb["correct"] and rb["points"] == 0
    assert rb["state"] == "done"
    va = a.get(f"/api/duel/{did}").json()
    assert va["winner_id"] == aid and va["me"]["score"] > 0 and va["opp"]["score"] == 0
    assert len(va["review"]) == 5 and all(x["ok"] for x in va["review"])
    db.expire_all()
    assert _xp(db, aid) == xa + 30 and _xp(db, bid) == xb + 10
    assert b.post(f"/api/duel/{did}/jawab", json={"index": 5, "choice": 0}).status_code == 409
    hist = a.get("/api/duel").json()["history"]
    assert hist[0]["id"] == did and hist[0]["won"] is True


def test_decline_and_expire(db):
    (a, _), (b, bid) = _learner(), _learner()
    did = a.post("/api/duel", json={"lawan": bid}).json()["id"]
    assert b.post(f"/api/duel/{did}/tolak").json()["state"] == "declined"
    did2 = a.post("/api/duel", json={"lawan": bid}).json()["id"]
    d = db.get(Duel, did2)
    d.created_at = now() - timedelta(minutes=6)
    db.commit()
    assert b.get("/api/duel").json()["incoming"] == []
    assert b.post(f"/api/duel/{did2}/terima").status_code == 409


def test_time_runs_out(db):
    (a, aid), (b, bid) = _learner(), _learner()
    did = a.post("/api/duel", json={"lawan": bid}).json()["id"]
    b.post(f"/api/duel/{did}/terima")
    d = _go(db, did)
    a.post(f"/api/duel/{did}/soal")
    a.post(f"/api/duel/{did}/jawab", json={"index": 0, "choice": d.questions[0]["a"]})
    d.ends_at = now() - timedelta(seconds=1)
    db.commit()
    v = b.get(f"/api/duel/{did}").json()
    assert v["state"] == "done" and v["winner_id"] == aid
