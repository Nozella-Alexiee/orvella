"""Classmates you can see (Orvella OS): an in-memory presence hub per class.

The app runs as a single uvicorn process, so one hub holds every connection. Nothing here
touches the database; the WebSocket route authenticates in a worker thread first.
"""
from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Any

from starlette.websockets import WebSocket

CHEERS = ("👏", "🔥", "🚀", "💡", "🎉")
APPS = ("beranda", "belajar", "fokus", "sandbox", "galeri", "musik", "duel", "pengaturan", "proyek", "playground", "progres", "pomodoro",
        "kolab", "siaran", "kuis-live")
IDLE_S = 60
STATE_EVERY_S = .5
CHEER_EVERY_S = 2.0


@dataclass(eq=False)
class Conn:
    ws: WebSocket
    user_id: int
    name: str
    initials: str
    room: str
    hidden: bool = False
    app: str = "beranda"
    what: str = ""
    last: float = field(default_factory=time.monotonic)
    last_state: float = 0.0
    last_cheer: float = 0.0
    live: dict[str, Any] | None = None  # siaran live: {"project": id, "title": ...}

    def public(self) -> dict[str, Any]:
        return {"id": self.user_id, "name": self.name, "initials": self.initials, "app": self.app, "what": self.what, "live": self.live}


class Hub:
    def __init__(self) -> None:
        self.rooms: dict[str, set[Conn]] = {}
        self.by_user: dict[int, set[Conn]] = {}
        self.loop: asyncio.AbstractEventLoop | None = None
        self.lives: dict[int, dict[str, Any]] = {}  # user_id -> siaran yang sedang berjalan

    # ---- saluran pribadi: undangan, notifikasi, bantuan (dipakai juga dari route sync lewat push())
    async def send_to_user(self, user_id: int, msg: dict[str, Any]) -> bool:
        sent = False
        for c in list(self.by_user.get(user_id, ())):
            sent = await self.send(c, msg) or sent
        return sent

    def push(self, user_id: int, msg: dict[str, Any]) -> bool:
        """Kirim dari thread mana pun (route sync, event after_commit). Tidak menunggu; False kalau tidak ada event loop."""
        loop = self.loop
        if loop is None or loop.is_closed() or user_id not in self.by_user:
            return False
        loop.call_soon_threadsafe(lambda: asyncio.ensure_future(self.send_to_user(user_id, msg)))
        return True

    def push_room(self, room: str, msg: dict[str, Any], exclude_user: int | None = None) -> None:
        loop = self.loop
        if loop is not None and not loop.is_closed() and room in self.rooms:
            loop.call_soon_threadsafe(lambda: asyncio.ensure_future(self.broadcast(room, msg, exclude_user)))

    async def set_live(self, user_id: int, live: dict[str, Any] | None) -> None:
        if live:
            self.lives[user_id] = live
        else:
            self.lives.pop(user_id, None)
        rooms = set()
        for c in self.by_user.get(user_id, ()):
            c.live = live
            rooms.add(c.room)
        for room in rooms:
            best = next((c for c in self.by_user.get(user_id, ()) if c.room == room and not c.hidden), None)
            if best:
                await self.broadcast(room, {"t": "state", "p": best.public()}, exclude_user=user_id)

    def people(self, room: str, exclude: int | None = None) -> list[dict[str, Any]]:
        best: dict[int, Conn] = {}
        for c in self.rooms.get(room, ()):  # beberapa tab milik satu orang digabung: pakai yang terakhir aktif
            if c.hidden or c.user_id == exclude:
                continue
            if c.user_id not in best or c.last > best[c.user_id].last:
                best[c.user_id] = c
        return [c.public() for c in sorted(best.values(), key=lambda c: c.name)]

    def online(self, room: str, user_id: int) -> bool:
        return any(c.user_id == user_id for c in self.rooms.get(room, ()))

    async def send(self, c: Conn, msg: dict[str, Any]) -> bool:
        try:
            await asyncio.wait_for(c.ws.send_json(msg), 2)
            return True
        except Exception:  # noqa: BLE001 - koneksi mati: dibuang
            self.rooms.get(c.room, set()).discard(c)
            self.by_user.get(c.user_id, set()).discard(c)
            return False

    async def broadcast(self, room: str, msg: dict[str, Any], exclude_user: int | None = None) -> None:
        targets = [c for c in list(self.rooms.get(room, ())) if c.user_id != exclude_user]
        await asyncio.gather(*(self.send(c, msg) for c in targets))

    async def join(self, c: Conn) -> None:
        if self.loop is None:
            self.loop = asyncio.get_running_loop()
        first = not self.online(c.room, c.user_id)
        c.live = self.lives.get(c.user_id)
        self.rooms.setdefault(c.room, set()).add(c)
        self.by_user.setdefault(c.user_id, set()).add(c)
        await self.send(c, {"t": "roster", "people": self.people(c.room, exclude=c.user_id)})
        if first and not c.hidden:
            await self.broadcast(c.room, {"t": "join", "p": c.public()}, exclude_user=c.user_id)

    async def leave(self, c: Conn) -> None:
        self.rooms.get(c.room, set()).discard(c)
        self.by_user.get(c.user_id, set()).discard(c)
        if not self.by_user.get(c.user_id):
            self.by_user.pop(c.user_id, None)
        if not self.online(c.room, c.user_id):
            await self.broadcast(c.room, {"t": "leave", "id": c.user_id})
        if not self.rooms.get(c.room):
            self.rooms.pop(c.room, None)

    async def handle(self, c: Conn, msg: dict[str, Any]) -> None:
        c.last = time.monotonic()
        t = msg.get("t")
        if t == "ping":
            await self.send(c, {"t": "pong"})
        elif t == "state":
            if c.last - c.last_state < STATE_EVERY_S:
                return
            c.last_state = c.last
            app = str(msg.get("app", ""))
            c.app = app if app in APPS else "beranda"
            c.what = str(msg.get("what", ""))[:60]
            if not c.hidden:
                await self.broadcast(c.room, {"t": "state", "p": c.public()}, exclude_user=c.user_id)
        elif t == "hide":
            was, c.hidden = c.hidden, bool(msg.get("on"))
            if c.hidden and not was:
                await self.broadcast(c.room, {"t": "leave", "id": c.user_id}, exclude_user=c.user_id)
            elif was and not c.hidden:
                await self.broadcast(c.room, {"t": "join", "p": c.public()}, exclude_user=c.user_id)
        elif t == "cheer":
            emoji, to = str(msg.get("emoji", "")), msg.get("to")
            if emoji not in CHEERS or not isinstance(to, int) or to == c.user_id or c.last - c.last_cheer < CHEER_EVERY_S:
                await self.send(c, {"t": "error", "message": "Sorakan belum bisa dikirim."})
                return
            c.last_cheer = c.last
            sent = False
            for other in list(self.rooms.get(c.room, ())):
                if other.user_id == to:
                    sent = await self.send(other, {"t": "cheer", "from": {"id": c.user_id, "name": c.name, "initials": c.initials}, "emoji": emoji}) or sent
            await self.send(c, {"t": "cheered", "to": to, "ok": sent})

    async def sweep(self, now: float | None = None) -> int:
        now = time.monotonic() if now is None else now
        dead = [c for room in list(self.rooms.values()) for c in list(room) if now - c.last > IDLE_S]
        for c in dead:
            try:
                await c.ws.close(code=4408)
            except Exception:  # noqa: BLE001
                pass
            await self.leave(c)
        return len(dead)


hub = Hub()


async def sweeper() -> None:
    while True:
        await asyncio.sleep(20)
        await hub.sweep()


# ------------------------------------------------ notifikasi realtime ---
# learning.notify() menandai user di session.info["push"]; setelah commit, klien yang online diberi tahu supaya
# lonceng langsung diperbarui (bukan sebelum commit, supaya klien tidak membaca data lama).
from sqlalchemy import event  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402


@event.listens_for(Session, "after_commit")
def _push_after_commit(session: Session) -> None:
    for uid in session.info.pop("push", ()):
        hub.push(uid, {"t": "notify"})


@event.listens_for(Session, "after_rollback")
def _drop_after_rollback(session: Session) -> None:
    session.info.pop("push", None)
