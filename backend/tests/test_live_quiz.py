"""Kuis langsung: host + 2 pemain lewat /ws/live, skor di server, PIN salah ditolak, laporan & CSV."""
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import app
from tests.test_presence import _headers

QUIZ = """Apa keluaran print(2 * 3)?
- 5
* 6
- 23

Nilai x setelah x = 1; x += 2?
* 3
- 1
- 12
> x += 2 berarti x = x + 2."""


def until(ws, t, limit=20):
    for _ in range(limit):
        m = ws.receive_json()
        if m["t"] == t:
            return m
    raise AssertionError(f"tidak menerima {t}")


def test_full_game():
    hm, hn, hr = _headers("dimas@smksig.sch.id"), _headers("nadia@smksig.sch.id"), _headers("rizky@smksig.sch.id")
    with TestClient(app) as c:
        assert c.post("/api/kuis-langsung", json={"source": "cepat", "text": QUIZ}, headers=hn).status_code == 403  # siswa tidak bisa membuat
        r = c.post("/api/kuis-langsung", json={"source": "cepat", "text": QUIZ, "seconds": 20}, headers=hm)
        assert r.status_code == 200, r.text
        pin, qid = r.json()["pin"], r.json()["id"]
        assert c.post("/api/kuis-langsung/gabung", json={"pin": "000000" if pin != "000000" else "000001"}, headers=hn).status_code == 404
        assert c.post("/api/kuis-langsung/gabung", json={"pin": pin}, headers=hn).status_code == 200
        with c.websocket_connect(f"/ws/live/{pin}", headers=hm) as host:
            assert until(host, "lobby")["players"] == []
            with c.websocket_connect(f"/ws/live/{pin}", headers=hn) as pn, c.websocket_connect(f"/ws/live/{pin}", headers=hr) as pr:
                assert pn.receive_json()["t"] == "lobby" and pr.receive_json()["t"] == "lobby"
                lob = until(host, "lobby")
                while len(lob["players"]) < 2:
                    lob = until(host, "lobby")
                host.send_json({"t": "start"})
                q = until(host, "question")
                assert q["index"] == 0 and "a" not in q["q"] and q["total"] == 2
                qn = until(pn, "question")
                until(pr, "question")
                assert "a" not in qn["q"]
                pn.send_json({"t": "answer", "index": 0, "choice": 1})   # benar
                pr.send_json({"t": "answer", "index": 0, "choice": 0})   # salah
                pn.send_json({"t": "answer", "index": 0, "choice": 0})   # jawaban kedua diabaikan
                rev = until(host, "reveal")
                assert rev["answer"] == 1 and rev["dist"] == [1, 1, 0] and rev["board"][0]["name"].startswith("Nadia")
                res_n, res_r = until(pn, "result"), until(pr, "result")
                assert res_n["correct"] and res_n["points"] >= 100 and res_n["rank"] == 1
                assert not res_r["correct"] and res_r["points"] == 0 and res_r["rank"] == 2
                host.send_json({"t": "next"})
                until(host, "question"); until(pn, "question"); until(pr, "question")
                pn.send_json({"t": "answer", "index": 1, "choice": 0})
                pr.send_json({"t": "answer", "index": 1, "choice": 0})
                until(host, "reveal")
                host.send_json({"t": "next"})
                done = until(host, "done")
                assert done["podium"][0]["name"].startswith("Nadia") and len(done["podium"]) == 2
                assert until(pn, "done")["rank"] == 1 and until(pr, "done")["rank"] == 2
        rep = c.get(f"/api/kuis-langsung/{qid}/laporan", headers=hm).json()
        assert rep["state"] == "done" and rep["questions"][0]["correct"] == 1 and rep["questions"][1]["correct"] == 2
        assert rep["players"][0]["name"].startswith("Nadia")
        csv = c.get(f"/api/kuis-langsung/{qid}/laporan.csv", headers=hm)
        assert csv.status_code == 200 and "Nadia" in csv.text and "text/csv" in csv.headers["content-type"]
        assert c.get(f"/api/kuis-langsung/{qid}/laporan", headers=hn).status_code == 404


def test_wrong_pin_and_late_join():
    hm, hn = _headers("dimas@smksig.sch.id"), _headers("nadia@smksig.sch.id")
    with TestClient(app) as c:
        with c.websocket_connect("/ws/live/999999", headers=hn) as ws:
            with pytest.raises(WebSocketDisconnect) as e:
                ws.receive_text()
            assert e.value.code == 4404
        pin = c.post("/api/kuis-langsung", json={"source": "cepat", "text": QUIZ}, headers=hm).json()["pin"]
        with c.websocket_connect(f"/ws/live/{pin}", headers=hm) as host, c.websocket_connect(f"/ws/live/{pin}", headers=hn) as pn:
            until(host, "lobby"); pn.receive_json()
            host.send_json({"t": "start"})
            until(host, "question")
            # terlambat: kuis sudah dimulai
            assert c.post("/api/kuis-langsung/gabung", json={"pin": pin}, headers=_headers("rizky@smksig.sch.id")).status_code == 409
            host.send_json({"t": "finish"})
            until(host, "done")
