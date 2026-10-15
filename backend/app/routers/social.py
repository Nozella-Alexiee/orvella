"""Orvella OS social layer: classmates' presence over WebSocket, and the Musik app."""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from ..config import settings
from ..db import SessionLocal, get_db
from ..models import User
from ..security import current_user, user_from_token
from ..services import music
from ..services.presence import Conn, hub
from ..services.realtime import origin_ok, room_of
from ..views import initials

router = APIRouter(prefix="/api", tags=["social"])
ws_router = APIRouter()
MAX_FRAME = 1024


def _who(token: str | None) -> dict[str, Any] | None:
    """Runs in a worker thread: resolves the session cookie to the presence room (the class)."""
    db = SessionLocal()
    try:
        user = user_from_token(db, token)
        if user is None:
            return None
        return {"id": user.id, "name": user.name, "initials": initials(user.name), "room": room_of(db, user),
                "hidden": (user.prefs or {}).get("presence") == "off"}
    finally:
        db.close()


@ws_router.websocket("/ws/presence")
async def presence(ws: WebSocket) -> None:
    await ws.accept()
    if not origin_ok(ws):
        await ws.close(code=4403)
        return
    who = await run_in_threadpool(_who, ws.cookies.get(settings.session_cookie))
    if who is None:
        await ws.send_json({"t": "error", "message": "Silakan masuk dulu."})
        await ws.close(code=4401)
        return
    c = Conn(ws=ws, user_id=who["id"], name=who["name"], initials=who["initials"], room=who["room"], hidden=who["hidden"])
    await hub.join(c)
    try:
        while True:
            raw = await ws.receive_text()
            if len(raw) > MAX_FRAME:
                continue
            try:
                msg = json.loads(raw)
            except ValueError:
                continue
            if isinstance(msg, dict):
                await hub.handle(c, msg)
    except WebSocketDisconnect:
        pass
    finally:
        await hub.leave(c)


@router.get("/presence")
def presence_snapshot(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Who is online right now (for the first paint before the socket connects). Same room as the socket (mentors too)."""
    return {"people": hub.people(room_of(db, user), exclude=user.id)}


# ---------------------------------------------------------------------- musik
@router.get("/music")
def music_home(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    s = music.settings(db)
    return {"enabled": s["music_enabled"], "curated": [{**c, **music.parse(c["url"])} for c in s["curated"]]}


@router.get("/music/resolve")
def music_resolve(url: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    if not music.settings(db)["music_enabled"]:
        raise HTTPException(403, "Musik dimatikan oleh admin sekolah.")
    return music.resolve(url)
