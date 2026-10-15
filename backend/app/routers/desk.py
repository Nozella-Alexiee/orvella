"""Desktop Orvella OS: widget Tebak output harian, lencana, dan timer fokus (Pomodoro)."""
from __future__ import annotations

import random
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Chapter, ChapterProgress, Path, User
from ..security import current_user
from ..services import activity, badges, content as content_svc, learning

router = APIRouter(prefix="/api", tags=["desk"])

TEKA_XP = 5


# ------------------------------------------------------------ tebak output ---
def _code_questions(db: Session, ch: Chapter, version: int | None) -> list[tuple[Chapter, dict[str, Any]]]:
    content = content_svc.published(db, ch, version) or {}
    return [(ch, q) for q in content.get("kuis", {}).get("bank", []) if q.get("c") and not q.get("trivia") and q.get("o")]


def _pool(db: Session, user: User) -> list[tuple[Chapter, dict[str, Any]]]:
    """Soal berkode dari bab yang Pahami-nya sudah selesai. Kalau belum ada: Bab 1 jalur yang sedang dikerjakan."""
    pool: list[tuple[Chapter, dict[str, Any]]] = []
    for cid, p in sorted(learning.progress_map(db, user.id).items()):
        if p.phases["pahami"]["state"] == "done":
            pool += _code_questions(db, db.get(Chapter, cid), p.version)
    if pool:
        return pool
    latest = db.scalar(select(ChapterProgress).where(ChapterProgress.user_id == user.id).order_by(ChapterProgress.updated_at.desc()))
    path_id = db.get(Chapter, latest.chapter_id).path_id if latest else db.scalar(select(Path.id).order_by(Path.id))
    for ch in (learning.path_chapters(db, path_id) if path_id else []):
        if ch.kind == "chapter" and ch.version:
            pool = _code_questions(db, ch, None)
            if pool:
                break
    return pool


def _today_ref(db: Session, user: User) -> dict[str, Any]:
    """Soal hari ini disimpan saat pertama dibuka, jadi tidak berubah walau isi pool bertambah di tengah hari."""
    today = activity.local_today().isoformat()
    t = dict((user.prefs or {}).get("_teka") or {})
    if t.get("day") == today and t.get("ref"):
        return t
    pool = _pool(db, user)
    if not pool:
        raise HTTPException(409, {"code": "empty", "message": "Belum ada soal. Mulai satu bab dulu, ya."})
    pool.sort(key=lambda cq: (cq[0].id, cq[1]["id"]))
    ch, q = random.Random(f"{today}:{user.id}").choice(pool)
    t = {"day": today, "ref": [ch.id, q["id"]]}
    user.prefs = {**(user.prefs or {}), "_teka": t}
    db.commit()
    return t


def _question(db: Session, ref: list[Any]) -> tuple[Chapter, dict[str, Any]]:
    ch = db.get(Chapter, ref[0])
    q = content_svc.find((content_svc.published(db, ch, None) or {}).get("kuis", {}).get("bank", []), ref[1]) if ch else None
    if not ch or not q:
        raise HTTPException(409, {"code": "gone", "message": "Soal hari ini tidak tersedia lagi."})
    return ch, q


def _teka_view(db: Session, ch: Chapter, q: dict[str, Any], t: dict[str, Any]) -> dict[str, Any]:
    path = db.get(Path, ch.path_id)
    out: dict[str, Any] = {"day": t["day"], "lang": path.language if path else "", "chapter": {"number": ch.number, "title": ch.title},
                           "q": content_svc.kuis_question_public(q), "xp": TEKA_XP, "answered": None}
    if "choice" in t:
        out["answered"] = {"choice": t["choice"], "correct": t["correct"], "answer": q.get("a"), "explain": q.get("e", "")}
    return out


@router.get("/teka-teki")
def teka_teki(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    t = _today_ref(db, user)
    ch, q = _question(db, t["ref"])
    return _teka_view(db, ch, q, t)


class TekaIn(BaseModel):
    choice: int = Field(ge=0, le=9)


@router.post("/teka-teki")
def teka_jawab(body: TekaIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    t = _today_ref(db, user)
    if "choice" in t:
        raise HTTPException(409, {"code": "answered", "message": "Soal hari ini sudah kamu jawab. Besok ada yang baru!"})
    ch, q = _question(db, t["ref"])
    correct = body.choice == q.get("a")
    xp = activity.add_xp(db, user, TEKA_XP, "Tebak output harian") if correct else 0
    t = {**t, "choice": body.choice, "correct": correct}
    user.prefs = {**(user.prefs or {}), "_teka": t}
    activity.record_activity(db, user, 0)
    new = badges.evaluate(db, user, night=badges.is_night())
    db.commit()
    return {**_teka_view(db, ch, q, t), "gained": xp, "xp_week": activity.week_xp(db, user.id),
            "xp_total": activity.total_xp(db, user.id), "lencana_baru": new}


# ------------------------------------------------------------------ lencana ---
@router.get("/lencana")
def lencana(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    new = badges.evaluate(db, user)
    if new:
        db.commit()
    items = badges.collection(db, user)
    return {"items": items, "earned": sum(1 for b in items if b["earned"]), "lencana_baru": new}


# ------------------------------------------------------------- timer fokus ---
class PomodoroIn(BaseModel):
    minutes: int = Field(ge=1, le=120)


@router.post("/pomodoro/selesai")
def pomodoro_done(body: PomodoroIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Satu sesi fokus selesai. Dihitung per hari (tanpa XP, supaya timer tidak jadi mesin XP)."""
    today = activity.local_today().isoformat()
    p = dict((user.prefs or {}).get("_pomo") or {})
    if p.get("day") != today:
        p = {"day": today, "n": 0, "min": 0}
    p["n"] = int(p.get("n", 0)) + 1
    p["min"] = int(p.get("min", 0)) + body.minutes
    user.prefs = {**(user.prefs or {}), "_pomo": p}
    db.commit()
    return {"today": p["n"], "minutes": p["min"]}
