"""Classmates' presence over /ws/presence: same class sees each other, other classes don't.

All sockets share one TestClient (used as a context manager) so they run on one event loop,
just like the single uvicorn process in production.
"""
import asyncio
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from starlette.websockets import WebSocketDisconnect

from app.config import settings
from app.main import app
from app.models import Klass, User
from app.security import hash_password
from app.services.presence import hub
from tests.conftest import PASSWORD, login


def _token(email: str) -> str:
    c = TestClient(app)
    login(c, email)
    return c.cookies.get(settings.session_cookie)


def _headers(email: str) -> dict[str, str]:
    return {"cookie": f"{settings.session_cookie}={_token(email)}"}


def _ensure_outsider(db) -> None:
    if db.scalar(select(User).where(User.email == "luar2@smksig.sch.id")):
        return
    nadia = db.scalar(select(User).where(User.email == "nadia@smksig.sch.id"))
    other = Klass(org_id=nadia.org_id, name="X TKJ")
    db.add(other)
    db.flush()
    db.add(User(email="luar2@smksig.sch.id", name="Orang Luar", password_hash=hash_password(PASSWORD), role="learner", class_id=other.id,
                org_id=nadia.org_id, onboarded=True, prefs={}))
    db.commit()


def test_needs_login():
    with TestClient(app) as c, c.websocket_connect("/ws/presence") as ws:
        assert ws.receive_json()["t"] == "error"
        with pytest.raises(WebSocketDisconnect):
            ws.receive_json()


def test_same_class_sees_join_state_and_cheer(db):
    _ensure_outsider(db)
    ha, hb, hx = _headers("nadia@smksig.sch.id"), _headers("rizky@smksig.sch.id"), _headers("luar2@smksig.sch.id")
    with TestClient(app) as c:
        with c.websocket_connect("/ws/presence", headers=ha) as wa:
            assert wa.receive_json()["t"] == "roster"
            with c.websocket_connect("/ws/presence", headers=hb) as wb:
                roster = wb.receive_json()
                assert roster["t"] == "roster" and any(p["name"].startswith("Nadia") for p in roster["people"])
                joined = wa.receive_json()
                assert joined["t"] == "join" and joined["p"]["name"].startswith("Rizky")
                with c.websocket_connect("/ws/presence", headers=hx) as wx:
                    assert wx.receive_json() == {"t": "roster", "people": []}  # kelas lain: tidak melihat siapa pun
                    wb.send_json({"t": "state", "app": "sandbox", "what": "Sandbox · jam-digital"})
                    st = wa.receive_json()
                    assert st["t"] == "state" and st["p"]["app"] == "sandbox" and st["p"]["what"] == "Sandbox · jam-digital"
                    rizky_id = st["p"]["id"]
                    wa.send_json({"t": "cheer", "to": rizky_id, "emoji": "🔥"})
                    got = wb.receive_json()
                    assert got["t"] == "cheer" and got["emoji"] == "🔥" and got["from"]["name"].startswith("Nadia")
                    assert wa.receive_json() == {"t": "cheered", "to": rizky_id, "ok": True}
                    wa.send_json({"t": "cheer", "to": rizky_id, "emoji": "🔥"})  # terlalu cepat
                    assert wa.receive_json()["t"] == "error"
                    wx.send_json({"t": "ping"})
                    assert wx.receive_json() == {"t": "pong"}
            assert wa.receive_json() == {"t": "leave", "id": rizky_id}


def test_bad_frames_and_emoji_are_ignored():
    with TestClient(app) as c, c.websocket_connect("/ws/presence", headers=_headers("alex@smksig.sch.id")) as ws:
        ws.receive_json()
        ws.send_text("x" * 5000)  # terlalu besar: diabaikan
        ws.send_text("{bukan json")
        ws.send_json({"t": "cheer", "to": 1, "emoji": "<script>"})
        assert ws.receive_json()["t"] == "error"
        ws.send_json({"t": "ping"})
        assert ws.receive_json() == {"t": "pong"}


def test_hidden_users_stay_invisible():
    with TestClient(app) as c:
        with c.websocket_connect("/ws/presence", headers=_headers("maya@smksig.sch.id")) as wa:
            wa.receive_json()
            wa.send_json({"t": "hide", "on": True})
            wa.send_json({"t": "ping"})
            assert wa.receive_json() == {"t": "pong"}
            with c.websocket_connect("/ws/presence", headers=_headers("bayu@smksig.sch.id")) as wb:
                roster = wb.receive_json()
                assert all(not p["name"].startswith("Maya") for p in roster["people"])


def test_sweeper_drops_silent_connections():
    with TestClient(app) as c, c.websocket_connect("/ws/presence", headers=_headers("salsa@smksig.sch.id")) as ws:
        ws.receive_json()
        before = sum(len(r) for r in hub.rooms.values())
        dropped = c.portal.call(hub.sweep, time.monotonic() + 120)
        assert dropped >= 1 and sum(len(r) for r in hub.rooms.values()) < before
        with pytest.raises(WebSocketDisconnect):
            ws.receive_json()


def test_snapshot_endpoint():
    c = TestClient(app)
    login(c, "nadia@smksig.sch.id")
    assert c.get("/api/presence").json() == {"people": []}
    assert asyncio.iscoroutinefunction(hub.sweep)
