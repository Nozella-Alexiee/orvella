"""Ngoding bareng: WebSocket room per proyek, undangan (langsung ke teman atau lewat tautan /s/{kode}), izin, dan siaran live."""
from __future__ import annotations

import secrets
from datetime import timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, WebSocket
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from ..config import settings
from ..db import SessionLocal, get_db
from ..models import KolabLink, Notebook, NotebookMember, User, now
from ..security import current_user, user_from_token
from ..services import learning
from ..services import sandbox as sb
from ..services.kolab import MAX_BINARY, MAX_TEXT, Peer, from_sync as _run_async, kolab
from ..services.presence import hub as presence
from ..services.realtime import origin_ok
from ..views import initials

router = APIRouter(prefix="/api", tags=["kolab"])
ws_router = APIRouter()
CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
LINK_HOURS = 24


def _owner_project(db: Session, user: User, nid: int) -> Notebook:
    return sb.get_project(db, user, nid, edit=True)


def _same_school(a: User, b: User) -> bool:
    return bool(a.org_id and a.org_id == b.org_id)


def _members_view(db: Session, nb: Notebook) -> dict[str, Any]:
    rows = db.execute(select(NotebookMember, User).join(User, User.id == NotebookMember.user_id)
                      .where(NotebookMember.notebook_id == nb.id).order_by(NotebookMember.added_at))
    links = db.scalars(select(KolabLink).where(KolabLink.notebook_id == nb.id, KolabLink.revoked.is_(False), KolabLink.expires_at > now()))
    online = {p["id"] for p in kolab.roster(kolab.rooms[nb.id])} if nb.id in kolab.rooms else set()
    return {"members": [{"id": u.id, "name": u.name, "initials": initials(u.name), "role": m.role, "online": u.id in online} for m, u in rows],
            "links": [{"code": ln.code, "role": ln.role, "expires_at": ln.expires_at.isoformat()} for ln in links],
            "live": sb.LIVE.get(nb.id) == nb.user_id}


# ------------------------------------------------------------------ anggota ---
class MemberIn(BaseModel):
    user_id: int
    role: Literal["edit", "view"] = "edit"


@router.get("/sandbox/{nid}/kolab")
def kolab_state(nid: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    nb = sb.get_project(db, user, nid)
    out = _members_view(db, nb) if nb.user_id == user.id else {"members": [], "links": [], "live": sb.LIVE.get(nb.id) == nb.user_id}
    return {**out, "access": sb.access(db, user, nb)}


@router.post("/sandbox/{nid}/members")
def invite(nid: int, body: MemberIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    nb = _owner_project(db, user, nid)
    friend = db.get(User, body.user_id)
    if friend is None or friend.id == user.id or not _same_school(user, friend):
        raise HTTPException(404, "Teman tidak ditemukan.")
    m = db.scalar(select(NotebookMember).where(NotebookMember.notebook_id == nb.id, NotebookMember.user_id == friend.id))
    if m is None:
        db.add(NotebookMember(notebook_id=nb.id, user_id=friend.id, role=body.role))
    else:
        m.role = body.role
    learning.notify(db, friend.id, "kolab", f"{user.name.split(' ')[0]} ngajak ngoding bareng", f"Proyek {nb.title}", f"/sandbox/{nb.id}")
    db.commit()
    presence.push(friend.id, {"t": "invite", "kind": "kolab", "project": {"id": nb.id, "title": nb.title}, "role": body.role,
                              "from": {"id": user.id, "name": user.name, "initials": initials(user.name)}})
    if m is not None:
        _run_async(kolab.set_role, nb.id, friend.id, body.role)
    return _members_view(db, nb)


class RoleIn(BaseModel):
    role: Literal["edit", "view"]


@router.patch("/sandbox/{nid}/members/{uid}")
def set_member_role(nid: int, uid: int, body: RoleIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    nb = _owner_project(db, user, nid)
    m = db.scalar(select(NotebookMember).where(NotebookMember.notebook_id == nb.id, NotebookMember.user_id == uid))
    if m is None:
        raise HTTPException(404, "Anggota tidak ditemukan.")
    m.role = body.role
    db.commit()
    _run_async(kolab.set_role, nb.id, uid, body.role)
    return _members_view(db, nb)


@router.delete("/sandbox/{nid}/members/{uid}")
def remove_member(nid: int, uid: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Pemilik mengeluarkan teman, atau teman keluar sendiri (menolak undangan)."""
    nb = db.get(Notebook, nid)
    if nb is None or (nb.user_id != user.id and uid != user.id):
        raise HTTPException(404, "Proyek tidak ditemukan.")
    m = db.scalar(select(NotebookMember).where(NotebookMember.notebook_id == nid, NotebookMember.user_id == uid))
    if m is not None:
        db.delete(m)
        db.commit()
        _run_async(kolab.set_role, nid, uid, None)
    return _members_view(db, nb) if nb.user_id == user.id else {"ok": True}


# ------------------------------------------------------------------- tautan ---
class LinkIn(BaseModel):
    role: Literal["edit", "view"] = "edit"


@router.post("/sandbox/{nid}/links")
def make_link(nid: int, body: LinkIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    nb = _owner_project(db, user, nid)
    code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))
    db.add(KolabLink(notebook_id=nb.id, code=code, role=body.role, expires_at=now() + timedelta(hours=LINK_HOURS)))
    db.commit()
    return {**_members_view(db, nb), "code": code}


@router.delete("/sandbox/{nid}/links/{code}")
def revoke_link(nid: int, code: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    nb = _owner_project(db, user, nid)
    ln = db.scalar(select(KolabLink).where(KolabLink.notebook_id == nb.id, KolabLink.code == code))
    if ln is not None:
        ln.revoked = True
        db.commit()
    return _members_view(db, nb)


@router.post("/kolab/gabung/{code}")
def join_link(code: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    ln = db.scalar(select(KolabLink).where(KolabLink.code == code.lower()))
    if ln is None or ln.revoked or ln.expires_at <= now():
        raise HTTPException(404, "Tautan ini sudah tidak berlaku. Minta tautan baru ke pemilik proyek.")
    nb = db.get(Notebook, ln.notebook_id)
    owner = db.get(User, nb.user_id) if nb else None
    if nb is None or owner is None:
        raise HTTPException(404, "Proyek tidak ditemukan.")
    if owner.id != user.id:
        if not _same_school(owner, user):
            raise HTTPException(403, "Tautan ini hanya untuk teman satu sekolah.")
        m = db.scalar(select(NotebookMember).where(NotebookMember.notebook_id == nb.id, NotebookMember.user_id == user.id))
        if m is None:
            db.add(NotebookMember(notebook_id=nb.id, user_id=user.id, role=ln.role))
            learning.notify(db, owner.id, "kolab", f"{user.name.split(' ')[0]} bergabung lewat tautan", f"Proyek {nb.title}", f"/sandbox/{nb.id}")
            db.commit()
    return {"project": nb.id, "title": nb.title}


# ------------------------------------------------------------------- siaran ---
class LiveIn(BaseModel):
    on: bool


@router.post("/sandbox/{nid}/siaran")
def siaran(nid: int, body: LiveIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    nb = _owner_project(db, user, nid)
    room = kolab.rooms.get(nb.id)
    if body.on and (room is None or not any(p.user_id == user.id for p in room.peers)):
        raise HTTPException(409, "Buka proyeknya di Sandbox dulu, baru siarkan.")
    if room is not None:
        _run_async(kolab.set_live, room, body.on)
    return {"live": sb.LIVE.get(nb.id) == nb.user_id}


# ----------------------------------------------------------------- websocket ---
def _who(token: str | None, nid: int) -> dict[str, Any] | None | str:
    db = SessionLocal()
    try:
        user = user_from_token(db, token)
        if user is None:
            return None
        nb = db.get(Notebook, nid)
        role = sb.access(db, user, nb) if nb is not None and nb.kind in sb.KINDS else None
        if role is None:
            return "forbidden"
        return {"id": user.id, "name": user.name, "initials": initials(user.name), "role": role}
    finally:
        db.close()


@ws_router.websocket("/ws/kolab/{nid}")
async def kolab_ws(ws: WebSocket, nid: int) -> None:
    await ws.accept()
    if not origin_ok(ws):
        await ws.close(code=4403)
        return
    who = await run_in_threadpool(_who, ws.cookies.get(settings.session_cookie), nid)
    if who is None or who == "forbidden":
        await ws.close(code=4401 if who is None else 4403)
        return
    room = await kolab.open(nid)
    if room is None:
        await ws.close(code=4404)
        return
    peer = Peer(ws=ws, user_id=who["id"], name=who["name"], initials=who["initials"], role=who["role"])
    if not await kolab.join(room, peer):
        await ws.close(code=4429)
        return
    try:
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                break
            if not kolab._rate_ok(peer):
                await ws.close(code=4429)
                break
            if msg.get("bytes") is not None:
                if len(msg["bytes"]) > MAX_BINARY:
                    await ws.close(code=1009)
                    break
                await kolab.on_binary(room, peer, msg["bytes"])
            elif msg.get("text") is not None and len(msg["text"]) <= MAX_TEXT:
                await kolab.on_text(room, peer, msg["text"])
    except Exception:  # noqa: BLE001 - koneksi putus di tengah jalan
        pass
    finally:
        await kolab.leave(room, peer)
