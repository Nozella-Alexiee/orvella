"""Ngoding bareng: dua klien pycrdt lewat /ws/kolab, izin per peran, simpan otomatis, undangan, tautan, dan siaran."""
import json
import time
import uuid

import pytest
from fastapi.testclient import TestClient
from pycrdt import Doc, Map, create_sync_message, create_update_message, handle_sync_message
from sqlalchemy import select
from starlette.websockets import WebSocketDisconnect

from app.main import app
from app.models import Notebook, User
from app.services import kolab as kolab_mod
from app.services import sandbox as sb
from tests.test_presence import _ensure_outsider, _headers


class YClient:
    """Klien Yjs minimal: menjawab sync, menyimpan pesan JSON."""

    def __init__(self, ws):
        self.ws, self.doc, self.json = ws, Doc(), []

    def pump(self, until=lambda c: False, limit=30):
        for _ in range(limit):
            if until(self):
                return self
            m = self.ws.receive()
            if m.get("bytes") is not None:
                b = m["bytes"]
                if b[0] == 0:
                    reply = handle_sync_message(b[1:], self.doc)
                    if reply:
                        self.ws.send_bytes(reply)
            elif m.get("text") is not None:
                self.json.append(json.loads(m["text"]))
        assert until(self), f"tidak tercapai; pesan: {self.json[-5:]}"
        return self

    def sync(self):
        self.pump(lambda c: any(j["t"] == "hello" for j in c.json))
        self.ws.send_bytes(create_sync_message(self.doc))
        return self.pump(lambda c: "index.html" in c.files())

    def files(self):
        return {k: str(v) for k, v in self.doc.get("files", type=Map).items()}

    def edit(self, path, text):
        sv = self.doc.get_state()
        t = self.doc.get("files", type=Map)[path]
        t.insert(len(t), text)
        self.ws.send_bytes(create_update_message(self.doc.get_update(sv)))

    def hello(self):
        return next(j for j in self.json if j["t"] == "hello")


@pytest.fixture()
def fast(monkeypatch):
    monkeypatch.setattr(kolab_mod, "PERSIST_AFTER_S", 0.05)
    monkeypatch.setattr(kolab_mod, "DROP_AFTER_S", 0.05)


def _project(c: TestClient, owner_headers: dict) -> int:
    r = c.post("/api/sandbox", json={"kind": "web", "stack": "static", "title": f"Kolab {uuid.uuid4().hex[:4]}"}, headers=owner_headers)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _uid(db, email):
    return db.scalar(select(User.id).where(User.email == email))


def test_two_editors_converge_and_persist(db, fast):
    _ensure_outsider(db)
    hn, hr = _headers("nadia@smksig.sch.id"), _headers("rizky@smksig.sch.id")
    with TestClient(app) as c:
        nid = _project(c, hn)
        assert c.post(f"/api/sandbox/{nid}/members", json={"user_id": _uid(db, "rizky@smksig.sch.id"), "role": "edit"}, headers=hn).status_code == 200
        assert c.get(f"/api/sandbox/{nid}", headers=hr).json()["can_edit"] is True
        with c.websocket_connect(f"/ws/kolab/{nid}", headers=hn) as wa, c.websocket_connect(f"/ws/kolab/{nid}", headers=hr) as wb:
            a, b = YClient(wa).sync(), YClient(wb).sync()
            assert a.hello()["role"] == "owner" and b.hello()["role"] == "edit" and a.hello()["gen"] == b.hello()["gen"]
            a.edit("index.html", "<!-- dari Nadia -->")
            b.pump(lambda c: "dari Nadia" in c.files()["index.html"])
            b.edit("index.html", "<!-- dari Rizky -->")
            a.pump(lambda c: "dari Rizky" in c.files()["index.html"])
            assert a.files() == b.files()
            # simpan otomatis setelah jeda
            a.pump(lambda c: any(j["t"] == "saved" for j in c.json))
            db.expire_all()
            nb = db.get(Notebook, nid)
            assert "dari Nadia" in sb.files_of(nb)["index.html"] and "dari Rizky" in sb.files_of(nb)["index.html"]
            assert nb.ystate and nb.ygen == a.hello()["gen"]
            # PATCH biasa ditolak selama room aktif (satu jalur simpan)
            r = c.patch(f"/api/sandbox/{nid}/files", json={"write": {"index.html": "x"}}, headers=hn)
            assert r.status_code == 409 and r.json()["detail"]["code"] == "kolab"
            # chat
            wa.send_text(json.dumps({"t": "chat", "text": "halo tim"}))
            b.pump(lambda c: any(j["t"] == "chat" and j["text"] == "halo tim" for j in c.json))
            gen = a.hello()["gen"]
        time.sleep(0.3)  # room dilepas
        assert nid not in kolab_mod.kolab.rooms
        # dibuka lagi: riwayat Yjs dipakai lagi (generasi sama), jadi klien lama bisa menggabung
        with c.websocket_connect(f"/ws/kolab/{nid}", headers=hn) as wa:
            again = YClient(wa).sync()
            assert again.hello()["gen"] == gen and "dari Rizky" in again.files()["index.html"]


def test_viewer_updates_are_dropped(db, fast):
    hn, hr = _headers("nadia@smksig.sch.id"), _headers("rizky@smksig.sch.id")
    with TestClient(app) as c:
        nid = _project(c, hn)
        c.post(f"/api/sandbox/{nid}/members", json={"user_id": _uid(db, "rizky@smksig.sch.id"), "role": "view"}, headers=hn)
        assert c.get(f"/api/sandbox/{nid}", headers=hr).json()["can_edit"] is False
        assert c.post(f"/api/sandbox/{nid}/run", json={}, headers=hr).status_code in (400, 403)
        with c.websocket_connect(f"/ws/kolab/{nid}", headers=hn) as wa, c.websocket_connect(f"/ws/kolab/{nid}", headers=hr) as wb:
            a, b = YClient(wa).sync(), YClient(wb).sync()
            assert b.hello()["role"] == "view"
            before = a.files()
            b.edit("index.html", "<!-- penyusup -->")
            wa.send_text(json.dumps({"t": "ping"}))
            a.pump(lambda c: any(j["t"] == "pong" for j in c.json))
            assert a.files() == before
            assert "penyusup" not in {str(k): str(v) for k, v in kolab_mod.kolab.rooms[nid].files.items()}["index.html"]
            # pemilik menaikkan izin: langsung berlaku di koneksi yang sama
            c.patch(f"/api/sandbox/{nid}/members/{_uid(db, 'rizky@smksig.sch.id')}", json={"role": "edit"}, headers=hn)
            b.pump(lambda c: any(j["t"] == "role" and j["role"] == "edit" for j in c.json))
            # editor penonton read-only di aplikasi, jadi dokumennya tidak pernah menyimpang; di tes ini kita sinkron ulang
            b.doc = Doc()
            wb.send_bytes(create_sync_message(b.doc))
            b.pump(lambda c: "index.html" in c.files())
            b.edit("index.html", "<!-- sekarang boleh -->")
            a.pump(lambda c: "sekarang boleh" in c.files()["index.html"])
            # dikeluarkan: koneksi ditutup
            c.delete(f"/api/sandbox/{nid}/members/{_uid(db, 'rizky@smksig.sch.id')}", headers=hn)
            b.pump(lambda c: any(j["t"] == "kicked" for j in c.json))


def test_strangers_and_guests_are_refused(db, fast):
    _ensure_outsider(db)
    hn = _headers("nadia@smksig.sch.id")
    with TestClient(app) as c:
        nid = _project(c, hn)
        with c.websocket_connect(f"/ws/kolab/{nid}") as ws:
            with pytest.raises(WebSocketDisconnect) as e:
                ws.receive_text()
            assert e.value.code == 4401
        with c.websocket_connect(f"/ws/kolab/{nid}", headers=_headers("luar2@smksig.sch.id")) as ws:
            with pytest.raises(WebSocketDisconnect) as e:
                ws.receive_text()
            assert e.value.code == 4403
        with c.websocket_connect(f"/ws/kolab/{nid}", headers={**hn, "origin": "https://evil.example"}) as ws:
            with pytest.raises(WebSocketDisconnect) as e:
                ws.receive_text()
            assert e.value.code == 4403
        # anggota edit tidak boleh menghapus atau menerbitkan proyek milik orang lain
        hr = _headers("rizky@smksig.sch.id")
        c.post(f"/api/sandbox/{nid}/members", json={"user_id": _uid(db, "rizky@smksig.sch.id")}, headers=hn)
        assert c.delete(f"/api/sandbox/{nid}", headers=hr).status_code == 403
        assert c.post(f"/api/sandbox/{nid}/members", json={"user_id": _uid(db, "luar2@smksig.sch.id")}, headers=hr).status_code == 403


def test_invite_link_and_live_broadcast(db, fast):
    _ensure_outsider(db)
    hn, hx, hr = _headers("nadia@smksig.sch.id"), _headers("luar2@smksig.sch.id"), _headers("rizky@smksig.sch.id")
    with TestClient(app) as c:
        nid = _project(c, hn)
        code = c.post(f"/api/sandbox/{nid}/links", json={"role": "view"}, headers=hn).json()["code"]
        r = c.post(f"/api/kolab/gabung/{code}", headers=hx)
        assert r.status_code == 200 and r.json()["project"] == nid
        assert c.get(f"/api/sandbox/{nid}", headers=hx).json()["access"] == "view"
        c.delete(f"/api/sandbox/{nid}/links/{code}", headers=hn)
        assert c.post(f"/api/kolab/gabung/{code}", headers=hr).status_code == 404
        # siaran: pemilik harus sedang membuka proyeknya
        assert c.post(f"/api/sandbox/{nid}/siaran", json={"on": True}, headers=hn).status_code == 409
        assert c.get(f"/api/sandbox/{nid}", headers=hr).status_code == 404  # teman sekelas belum bisa melihat
        with c.websocket_connect(f"/ws/kolab/{nid}", headers=hn) as wa:
            YClient(wa).sync()
            assert c.post(f"/api/sandbox/{nid}/siaran", json={"on": True}, headers=hn).json() == {"live": True}
            assert c.get(f"/api/sandbox/{nid}", headers=hr).json()["live"] is True
            with c.websocket_connect(f"/ws/kolab/{nid}", headers=hr) as wb:
                viewer = YClient(wb).sync()
                assert viewer.hello()["role"] == "view" and viewer.hello()["live"] is True
            c.post(f"/api/sandbox/{nid}/siaran", json={"on": False}, headers=hn)
        assert c.get(f"/api/sandbox/{nid}", headers=hr).status_code == 404


def test_restore_reaches_room(db, fast):
    hn = _headers("nadia@smksig.sch.id")
    with TestClient(app) as c:
        nid = _project(c, hn)
        c.post(f"/api/sandbox/{nid}/snapshots", json={"label": "awal"}, headers=hn)
        sid = c.get(f"/api/sandbox/{nid}/snapshots", headers=hn).json()["items"][0]["id"]
        with c.websocket_connect(f"/ws/kolab/{nid}", headers=hn) as wa:
            a = YClient(wa).sync()
            original = a.files()["index.html"]
            a.edit("index.html", "<!-- nanti dibatalkan -->")
            a.pump(lambda c: any(j["t"] == "saved" for j in c.json))
            assert c.post(f"/api/sandbox/{nid}/snapshots/{sid}/restore", headers=hn).status_code == 200
            a.pump(lambda c: c.files()["index.html"] == original)
