"""Angkat tangan: siswa minta bantuan mentor kelasnya dari Sandbox, Perkuat, atau Uji.

Satu permintaan terbuka per siswa. Mentor langsung dapat pesan realtime (dan notifikasi); siswa melihat statusnya
berubah dari "menunggu" ke "sedang dilihat" ke "selesai".
"""
from __future__ import annotations

from datetime import timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import HelpRequest, Klass, User, now
from ..security import current_user, is_admin
from ..services import learning
from ..services.presence import hub as presence
from ..services.realtime import mentor_classes
from ..views import ago, initials

router = APIRouter(prefix="/api/bantuan", tags=["bantuan"])
CONTEXT_LABEL = {"sandbox": "Sandbox", "perkuat": "Perkuat", "uji": "Uji"}


def view(db: Session, r: HelpRequest) -> dict[str, Any]:
    learner, mentor = db.get(User, r.learner_id), db.get(User, r.mentor_id) if r.mentor_id else None
    return {"id": r.id, "state": r.state, "context": r.context, "context_label": CONTEXT_LABEL.get(r.context, r.context), "ref": r.ref,
            "message": r.message, "ago": ago(r.created_at),
            "learner": {"id": learner.id, "name": learner.name, "initials": initials(learner.name)} if learner else None,
            "mentor": {"id": mentor.id, "name": mentor.name} if mentor else None}


def _open_of(db: Session, uid: int) -> HelpRequest | None:
    return db.scalar(select(HelpRequest).where(HelpRequest.learner_id == uid, HelpRequest.state.in_(("open", "taken"))).order_by(HelpRequest.id.desc()))


class HelpIn(BaseModel):
    context: Literal["sandbox", "perkuat", "uji"]
    ref: str = Field(max_length=160, pattern=r"^/[A-Za-z0-9/_?=&.-]*$")
    message: str = Field(default="", max_length=300)


@router.post("")
def raise_hand(body: HelpIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    if user.role != "learner":
        raise HTTPException(403, "Angkat tangan untuk siswa.")
    existing = _open_of(db, user.id)
    if existing is not None:
        raise HTTPException(409, {"code": "open", "message": "Tanganmu masih terangkat. Tunggu mentor, atau batalkan dulu.", "request": view(db, existing)})
    klass = db.get(Klass, user.class_id) if user.class_id else None
    if klass is None or not klass.mentor_id:
        raise HTTPException(409, {"code": "no-mentor", "message": "Kelasmu belum punya mentor."})
    r = HelpRequest(learner_id=user.id, mentor_id=klass.mentor_id, context=body.context, ref=body.ref, message=body.message.strip())
    db.add(r)
    db.flush()
    first = user.name.split(" ")[0]
    learning.notify(db, klass.mentor_id, "bantuan", f"{first} angkat tangan di {CONTEXT_LABEL[body.context]}", body.message.strip()[:200], "/mentor")
    db.commit()
    presence.push(klass.mentor_id, {"t": "help", "ev": "new", "request": view(db, r)})
    return view(db, r)


@router.get("/saya")
def mine(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    r = _open_of(db, user.id)
    return {"request": view(db, r) if r else None}


@router.delete("/{rid}")
def cancel(rid: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    r = db.get(HelpRequest, rid)
    if r is None or r.learner_id != user.id:
        raise HTTPException(404, "Permintaan tidak ditemukan.")
    if r.state != "done":
        r.state, r.done_at = "done", now()
        db.commit()
        if r.mentor_id:
            presence.push(r.mentor_id, {"t": "help", "ev": "cancel", "request": view(db, r)})
    return view(db, r)


# ------------------------------------------------------------------- mentor ---
def _mentor_request(db: Session, user: User, rid: int) -> HelpRequest:
    r = db.get(HelpRequest, rid)
    learner = db.get(User, r.learner_id) if r else None
    if r is None or learner is None or (not is_admin(user) and learner.class_id not in mentor_classes(db, user)):
        raise HTTPException(404, "Permintaan tidak ditemukan.")
    return r


@router.get("")
def queue(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    classes = mentor_classes(db, user)
    if not classes:
        raise HTTPException(403, "Antrian bantuan untuk mentor.")
    since = now() - timedelta(hours=12)
    rows = db.scalars(select(HelpRequest).join(User, User.id == HelpRequest.learner_id)
                      .where(User.class_id.in_(classes), HelpRequest.created_at >= since).order_by(HelpRequest.id))
    items = [view(db, r) for r in rows]
    return {"open": [i for i in items if i["state"] != "done"], "done": [i for i in items if i["state"] == "done"][-10:]}


@router.post("/{rid}/ambil")
def take(rid: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    r = _mentor_request(db, user, rid)
    if r.state == "done":
        raise HTTPException(409, {"code": "done", "message": "Permintaan ini sudah selesai."})
    r.state, r.mentor_id, r.taken_at = "taken", user.id, now()
    db.commit()
    presence.push(r.learner_id, {"t": "help", "ev": "taken", "request": view(db, r)})
    return view(db, r)


@router.post("/{rid}/selesai")
def done(rid: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    r = _mentor_request(db, user, rid)
    if r.state != "done":
        r.state, r.done_at = "done", now()
        db.commit()
        presence.push(r.learner_id, {"t": "help", "ev": "done", "request": view(db, r)})
    return view(db, r)
