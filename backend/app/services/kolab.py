"""Ngoding bareng di Sandbox: satu room pycrdt per proyek, protokol y-websocket (sync + awareness) plus pesan JSON.

- Frame biner = Yjs: [0, sync...] atau [1, awareness...]. Frame teks = JSON kontrol (chat, run, ping).
- Isi proyek = Map "files" berisi satu Text per berkas. Room dimuat dari Notebook saat orang pertama masuk:
  riwayat Yjs tersimpan (Notebook.ystate) dipakai lagi kalau isinya masih sama dengan berkas di database, jadi klien
  yang tersambung ulang bisa menggabung perubahannya. Kalau tidak, room baru dibuat dengan generasi (gen) baru dan
  klien membuang dokumen lamanya.
- Izin dicek per koneksi: owner/edit boleh mengubah, view hanya menerima. Update dari view dibuang.
- Disimpan ke database 2 detik setelah perubahan terakhir. Room dilepas 30 detik setelah orang terakhir keluar
  (snapshot otomatis kalau ada perubahan).
"""
from __future__ import annotations

import asyncio
import json
import logging
import secrets
import time
from dataclasses import dataclass, field
from typing import Any

from fastapi import HTTPException
from pycrdt import Decoder, Doc, Encoder, Map, Text, YMessageType, YSyncMessageType, create_awareness_message, create_sync_message, \
    create_update_message, handle_sync_message
from starlette.concurrency import run_in_threadpool
from starlette.websockets import WebSocket

from ..db import SessionLocal
from ..models import Notebook, now
from . import sandbox as sb
from .presence import hub as presence

log = logging.getLogger("orvella.kolab")

PERSIST_AFTER_S = 2.0
DROP_AFTER_S = 30.0
MAX_PEERS = 60
MAX_BINARY = 1_000_000
MAX_TEXT = 4_000
MSGS_PER_S = 120
CHAT_KEEP = 50
COLORS = ["#6A4DF4", "#10B98A", "#FF5E57", "#3D8BFF", "#EE4D98", "#F2663B", "#0EA5B7", "#B45309"]


@dataclass(eq=False)
class Peer:
    ws: WebSocket
    user_id: int
    name: str
    initials: str
    role: str  # owner | edit | view
    color: str = "#6A4DF4"
    clients: set[int] = field(default_factory=set)  # id klien Yjs (awareness) milik koneksi ini
    window: float = 0.0
    count: int = 0

    def public(self) -> dict[str, Any]:
        return {"id": self.user_id, "name": self.name, "initials": self.initials, "role": self.role, "color": self.color}

    @property
    def can_edit(self) -> bool:
        return self.role in ("owner", "edit")


@dataclass(eq=False)
class Room:
    nid: int
    owner_id: int
    kind: str
    title: str
    doc: Doc
    gen: str
    peers: set[Peer] = field(default_factory=set)
    awareness: dict[int, tuple[int, str]] = field(default_factory=dict)  # client_id -> (clock, state json)
    chat: list[dict[str, Any]] = field(default_factory=list)
    dirty: bool = False
    changed_since_snapshot: bool = False
    persist_task: asyncio.Task | None = None
    drop_task: asyncio.Task | None = None
    live: bool = False
    rev: int = 0

    @property
    def files(self) -> Map:
        return self.doc.get("files", type=Map)

    def snapshot(self) -> tuple[dict[str, str], bytes]:
        return {str(k): str(v) for k, v in self.files.items()}, self.doc.get_update()

    def viewers(self) -> int:
        return len({p.user_id for p in self.peers if p.role == "view"})


# ------------------------------------------------------------ database (thread) ---
def _load(nid: int) -> dict[str, Any] | None:
    db = SessionLocal()
    try:
        nb = db.get(Notebook, nid)
        if nb is None or nb.kind not in sb.KINDS:
            return None
        return {"owner_id": nb.user_id, "kind": nb.kind, "title": nb.title, "files": sb.files_of(nb), "ystate": nb.ystate,
                "ygen": nb.ygen, "rev": nb.rev or 0}
    finally:
        db.close()


def _persist(nid: int, files: dict[str, str], state: bytes, gen: str) -> int:
    db = SessionLocal()
    try:
        nb = db.get(Notebook, nid)
        if nb is None:
            return -1
        clean = sb.clean_files(nb.kind, files)
        sb.set_files(nb, clean)
        nb.ystate, nb.ygen = state, gen
        nb.rev = (nb.rev or 0) + 1
        nb.updated_at = now()
        db.commit()
        return nb.rev
    finally:
        db.close()


def _auto_snapshot(nid: int) -> None:
    db = SessionLocal()
    try:
        nb = db.get(Notebook, nid)
        if nb is not None:
            sb.take_snapshot(db, nb, "Ngoding bareng", auto=True)
            db.commit()
    finally:
        db.close()


def build_doc(files: dict[str, str], ystate: bytes | None, ygen: str | None) -> tuple[Doc, str]:
    """Pakai riwayat Yjs tersimpan kalau isinya sama dengan berkas di database; kalau tidak, buat dokumen baru."""
    if ystate and ygen:
        doc = Doc()
        try:
            doc.apply_update(ystate)
            if {str(k): str(v) for k, v in doc.get("files", type=Map).items()} == files:
                return doc, ygen
        except Exception:  # noqa: BLE001 - riwayat rusak: mulai baru
            log.warning("ystate proyek tidak bisa dipakai, membuat dokumen baru")
    doc = Doc()
    fmap = doc.get("files", type=Map)
    with doc.transaction():
        for path, text in files.items():
            fmap[path] = Text(text)
    return doc, secrets.token_hex(6)


# ------------------------------------------------------------------ pesan Yjs ---
def parse_awareness(update: bytes) -> list[tuple[int, int, str]]:
    d = Decoder(update)
    return [(d.read_var_uint(), d.read_var_uint(), d.read_var_string()) for _ in range(d.read_var_uint())]


def encode_awareness(entries: list[tuple[int, int, str]]) -> bytes:
    e = Encoder()
    e.write_var_uint(len(entries))
    for cid, clock, state in entries:
        e.write_var_uint(cid)
        e.write_var_uint(clock)
        e.write_var_string(state)
    return e.to_bytes()


class Kolab:
    def __init__(self) -> None:
        self.rooms: dict[int, Room] = {}
        self._locks: dict[int, asyncio.Lock] = {}

    def active(self, nid: int) -> bool:
        r = self.rooms.get(nid)
        return bool(r and r.peers)

    async def open(self, nid: int) -> Room | None:
        lock = self._locks.setdefault(nid, asyncio.Lock())
        async with lock:
            room = self.rooms.get(nid)
            if room is None:
                data = await run_in_threadpool(_load, nid)
                if data is None:
                    return None
                doc, gen = build_doc(data["files"], data["ystate"], data["ygen"])
                room = Room(nid=nid, owner_id=data["owner_id"], kind=data["kind"], title=data["title"], doc=doc, gen=gen, rev=data["rev"])
                self.rooms[nid] = room
            if room.drop_task:
                room.drop_task.cancel()
                room.drop_task = None
            return room

    # ---- kirim
    async def _send(self, p: Peer, data: bytes | dict[str, Any]) -> None:
        try:
            if isinstance(data, bytes):
                await asyncio.wait_for(p.ws.send_bytes(data), 3)
            else:
                await asyncio.wait_for(p.ws.send_text(json.dumps(data)), 3)
        except Exception:  # noqa: BLE001 - koneksi mati; dibersihkan saat receive gagal
            pass

    async def _broadcast(self, room: Room, data: bytes | dict[str, Any], exclude: Peer | None = None) -> None:
        await asyncio.gather(*(self._send(p, data) for p in list(room.peers) if p is not exclude))

    def roster(self, room: Room) -> list[dict[str, Any]]:
        best: dict[int, Peer] = {}
        for p in room.peers:
            best.setdefault(p.user_id, p)
        return [p.public() for p in best.values()]

    async def _peers_changed(self, room: Room) -> None:
        await self._broadcast(room, {"t": "peers", "peers": self.roster(room), "viewers": room.viewers(), "live": room.live})

    # ---- masuk / keluar
    async def join(self, room: Room, peer: Peer) -> bool:
        if len(room.peers) >= MAX_PEERS:
            return False
        used = {p.color for p in room.peers}
        peer.color = next((c for c in COLORS if c not in used), COLORS[peer.user_id % len(COLORS)])
        room.peers.add(peer)
        await self._send(peer, {"t": "hello", "gen": room.gen, "role": peer.role, "you": peer.public(), "peers": self.roster(room),
                                "chat": room.chat[-CHAT_KEEP:], "live": room.live, "viewers": room.viewers(), "rev": room.rev})
        await self._send(peer, create_sync_message(room.doc))
        if room.awareness:
            await self._send(peer, create_awareness_message(encode_awareness([(c, k, s) for c, (k, s) in room.awareness.items()])))
        await self._peers_changed(room)
        return True

    async def leave(self, room: Room, peer: Peer) -> None:
        room.peers.discard(peer)
        gone = [(cid, room.awareness[cid][0] + 1, "null") for cid in peer.clients if cid in room.awareness]
        for cid, *_ in gone:
            room.awareness.pop(cid, None)
        if gone and room.peers:
            await self._broadcast(room, create_awareness_message(encode_awareness(gone)))
        if room.peers:
            await self._peers_changed(room)
            return
        # orang terakhir keluar: simpan sekarang, lepas room nanti
        await self.flush(room)
        if room.live:
            await self.set_live(room, False)
        room.drop_task = asyncio.create_task(self._drop_later(room))

    async def _drop_later(self, room: Room) -> None:
        try:
            await asyncio.sleep(DROP_AFTER_S)
        except asyncio.CancelledError:
            return
        if room.peers or self.rooms.get(room.nid) is not room:
            return
        await self.flush(room)
        self.rooms.pop(room.nid, None)
        if room.changed_since_snapshot:
            await run_in_threadpool(_auto_snapshot, room.nid)

    # ---- pesan masuk
    def _rate_ok(self, peer: Peer) -> bool:
        t = time.monotonic()
        if t - peer.window > 1:
            peer.window, peer.count = t, 0
        peer.count += 1
        return peer.count <= MSGS_PER_S

    async def on_binary(self, room: Room, peer: Peer, msg: bytes) -> None:
        if not msg:
            return
        if msg[0] == YMessageType.SYNC and len(msg) > 1:
            sub = msg[1]
            if sub == YSyncMessageType.SYNC_STEP1:
                reply = handle_sync_message(msg[1:], room.doc)
                if reply:
                    await self._send(peer, reply)
                return
            if sub not in (YSyncMessageType.SYNC_STEP2, YSyncMessageType.SYNC_UPDATE) or not peer.can_edit:
                return  # penonton tidak boleh mengubah dokumen
            update = Decoder(msg[2:]).read_message()
            if not update:
                return
            before = room.doc.get_state()
            room.doc.apply_update(update)
            if room.doc.get_state() == before:
                return  # tidak ada yang baru (mis. step2 kosong)
            await self._broadcast(room, create_update_message(update), exclude=peer)
            self.touch(room)
        elif msg[0] == YMessageType.AWARENESS:
            payload = Decoder(msg[1:]).read_message()
            try:
                entries = parse_awareness(payload)
            except Exception:  # noqa: BLE001
                return
            for cid, clock, state in entries:
                prev = room.awareness.get(cid)
                if prev is None or clock >= prev[0]:
                    if state in ("", "null"):
                        room.awareness.pop(cid, None)
                    else:
                        room.awareness[cid] = (clock, state)
                    peer.clients.add(cid)
            await self._broadcast(room, msg, exclude=peer)

    async def on_text(self, room: Room, peer: Peer, raw: str) -> None:
        try:
            m = json.loads(raw)
        except ValueError:
            return
        if not isinstance(m, dict):
            return
        t = m.get("t")
        if t == "ping":
            await self._send(peer, {"t": "pong"})
        elif t == "chat":
            text = str(m.get("text", "")).strip()[:500]
            if not text:
                return
            item = {"from": peer.public(), "text": text, "at": int(time.time() * 1000)}
            room.chat = (room.chat + [item])[-CHAT_KEEP:]
            await self._broadcast(room, {"t": "chat", **item})
        elif t == "ran" and peer.can_edit:
            lines = [{"k": str(x.get("k", "out"))[:4], "t": str(x.get("t", ""))[:400]} for x in (m.get("lines") or [])[:120] if isinstance(x, dict)]
            await self._broadcast(room, {"t": "ran", "by": peer.public(), "ok": bool(m.get("ok")), "lines": lines, "web": bool(m.get("web"))}, exclude=peer)

    # ---- simpan
    def touch(self, room: Room) -> None:
        room.dirty = room.changed_since_snapshot = True
        if room.persist_task and not room.persist_task.done():
            room.persist_task.cancel()
        room.persist_task = asyncio.create_task(self._persist_later(room))

    async def _persist_later(self, room: Room) -> None:
        try:
            await asyncio.sleep(PERSIST_AFTER_S)
        except asyncio.CancelledError:
            return
        await self.flush(room)

    async def flush(self, room: Room) -> None:
        if not room.dirty:
            return
        room.dirty = False
        files, state = room.snapshot()
        try:
            rev = await run_in_threadpool(_persist, room.nid, files, state, room.gen)
        except HTTPException as e:
            await self._broadcast(room, {"t": "error", "message": str(e.detail)})
            return
        except Exception:  # noqa: BLE001
            log.exception("gagal menyimpan room kolab %s", room.nid)
            room.dirty = True
            await self._broadcast(room, {"t": "error", "message": "Belum tersimpan. Dicoba lagi sebentar."})
            return
        if rev >= 0:
            room.rev = rev
            await self._broadcast(room, {"t": "saved", "rev": rev})

    async def flush_nid(self, nid: int) -> None:
        room = self.rooms.get(nid)
        if room is not None:
            await self.flush(room)

    async def replace_files(self, nid: int, files: dict[str, str]) -> bool:
        """Ganti isi room dari server (pulihkan snapshot) dan kirim perubahannya ke semua peserta."""
        room = self.rooms.get(nid)
        if room is None or not room.peers:
            return False
        before = room.doc.get_state()
        fmap = room.files
        with room.doc.transaction():
            for path in [k for k in fmap.keys() if k not in files]:
                del fmap[path]
            for path, text in files.items():
                cur = fmap.get(path)
                if cur is None:
                    fmap[path] = Text(text)
                elif str(cur) != text:
                    del cur[0:len(cur)]
                    cur.insert(0, text)
        await self._broadcast(room, create_update_message(room.doc.get_update(before)))
        self.touch(room)
        return True

    # ---- izin & siaran
    async def set_role(self, nid: int, user_id: int, role: str | None) -> None:
        room = self.rooms.get(nid)
        if room is None:
            return
        for p in list(room.peers):
            if p.user_id != user_id or p.role == "owner":
                continue
            if role is None:
                await self._send(p, {"t": "kicked"})
                try:
                    await p.ws.close(code=4403)
                except Exception:  # noqa: BLE001
                    pass
            else:
                p.role = role
                await self._send(p, {"t": "role", "role": role})
        await self._peers_changed(room)

    async def set_live(self, room: Room, on: bool) -> None:
        room.live = on
        if on:
            sb.LIVE[room.nid] = room.owner_id
        else:
            sb.LIVE.pop(room.nid, None)
        await presence.set_live(room.owner_id, {"project": room.nid, "title": room.title} if on else None)
        await self._peers_changed(room)


kolab = Kolab()


def from_sync(fn, *args):  # noqa: ANN001, ANN201
    """Panggil coroutine room dari route sync (worker thread anyio). None kalau bukan dari thread seperti itu."""
    from anyio import from_thread
    try:
        return from_thread.run(fn, *args)
    except RuntimeError:
        return None
