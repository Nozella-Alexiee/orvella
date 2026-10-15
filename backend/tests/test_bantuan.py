"""Angkat tangan: siklus open → taken → done, satu per siswa, hanya mentor kelasnya, dan pesan realtime ke mentor."""
from fastapi.testclient import TestClient
from sqlalchemy import select, update

from app.main import app
from app.models import HelpRequest, User
from tests.conftest import login
from tests.test_presence import _headers


def _clear(db, email):
    uid = db.scalar(select(User.id).where(User.email == email))
    db.execute(update(HelpRequest).where(HelpRequest.learner_id == uid).values(state="done"))
    db.commit()


def test_cycle_and_realtime(db):
    _clear(db, "nadia@smksig.sch.id")
    hm = _headers("dimas@smksig.sch.id")
    with TestClient(app) as c, c.websocket_connect("/ws/presence", headers=hm) as wm:
        assert wm.receive_json()["t"] == "roster"
        hn = _headers("nadia@smksig.sch.id")
        r = c.post("/api/bantuan", json={"context": "sandbox", "ref": "/sandbox/12", "message": "Kok error ya?"}, headers=hn)
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        # mentor langsung diberi tahu (bantuan baru + lonceng notifikasi)
        got = []
        while not ({"help", "notify"} <= {m["t"] for m in got}):
            got.append(wm.receive_json())
        help_msg = next(m for m in got if m["t"] == "help")
        assert help_msg["ev"] == "new" and help_msg["request"]["learner"]["name"].startswith("Nadia") and help_msg["request"]["message"] == "Kok error ya?"
        assert c.post("/api/bantuan", json={"context": "uji", "ref": "/bab/1/uji/challenge"}, headers=hn).status_code == 409
        q = c.get("/api/bantuan", headers=hm).json()
        assert any(i["id"] == rid for i in q["open"])
        assert c.post(f"/api/bantuan/{rid}/ambil", headers=hm).json()["state"] == "taken"
        assert c.get("/api/bantuan/saya", headers=hn).json()["request"]["mentor"]["name"]
        assert c.post(f"/api/bantuan/{rid}/selesai", headers=hm).json()["state"] == "done"
        assert c.get("/api/bantuan/saya", headers=hn).json()["request"] is None


def test_only_learners_and_own_mentor(client, db):
    _clear(db, "rizky@smksig.sch.id")
    login(client, "dimas@smksig.sch.id")
    assert client.post("/api/bantuan", json={"context": "sandbox", "ref": "/sandbox/1"}).status_code == 403
    c2 = TestClient(app)
    login(c2, "rizky@smksig.sch.id")
    assert c2.get("/api/bantuan").status_code == 403  # siswa tidak melihat antrian
    rid = c2.post("/api/bantuan", json={"context": "perkuat", "ref": "/bab/1/perkuat"}).json()["id"]
    assert c2.post(f"/api/bantuan/{rid}/ambil").status_code == 404
    assert c2.delete(f"/api/bantuan/{rid}").json()["state"] == "done"
    assert c2.post("/api/bantuan", json={"context": "sandbox", "ref": "javascript:alert(1)"}).status_code == 422
