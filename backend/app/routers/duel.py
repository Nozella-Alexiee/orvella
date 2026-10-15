"""Duel 1 lawan 1: 5 soal Kuis yang sama, lima menit, skor dan waktu dihitung di server.

Alur: tantang teman sekelas → lawan menerima (atau menolak, atau kedaluwarsa 5 menit) → hitung mundur 3 detik →
masing-masing mengambil soal satu per satu (POST /soal mencatat waktu kirim) dan menjawab berurutan (POST /jawab).
Kunci jawaban tidak pernah dikirim sebelum soal itu dijawab. Progres lawan (nomor soal dan benar/salah, bukan
pilihannya) dikirim lewat kanal presence yang sudah terbuka. Duel selesai kalau keduanya selesai atau waktunya habis.
"""
from __future__ import annotations

import random
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..db import SessionLocal, get_db
from ..models import Chapter, Duel, Path, User, now
from ..security import current_user
from ..services import activity, content as content_svc, learning, scoring
from ..services.presence import hub as presence
from ..services.realtime import room_of
from ..views import initials

router = APIRouter(prefix="/api/duel", tags=["duel"])

N_QUESTIONS = 5
PER_QUESTION_S = 20
DUEL_S = 300
COUNTDOWN_S = 4
INVITE_S = 300
XP_WIN, XP_LOSE, XP_TIE = 30, 10, 20
SENT: dict[tuple[int, int, int], float] = {}  # (duel, user, nomor soal) -> waktu kirim (satu proses)


def _aware(dt: datetime | None) -> datetime | None:
    return dt.replace(tzinfo=timezone.utc) if dt is not None and dt.tzinfo is None else dt


def _person(u: User) -> dict[str, Any]:
    return {"id": u.id, "name": u.name, "initials": initials(u.name)}


def _side(d: Duel, uid: int) -> str:
    if uid == d.a_id:
        return "a"
    if uid == d.b_id:
        return "b"
    raise HTTPException(404, "Duel tidak ditemukan.")


def _answers(d: Duel, side: str) -> list[dict[str, Any]]:
    return list((d.a_answers if side == "a" else d.b_answers) or [])


def _pool(db: Session, user: User, path_id: int | None) -> tuple[list[dict[str, Any]], Path | None]:
    pool: list[dict[str, Any]] = []
    path: Path | None = db.get(Path, path_id) if path_id else None
    for cid, p in learning.progress_map(db, user.id).items():
        ch = db.get(Chapter, cid)
        if p.phases["pahami"]["state"] != "done" or (path_id and ch.path_id != path_id):
            continue
        path = path or db.get(Path, ch.path_id)
        pool += [q for q in (content_svc.published(db, ch, p.version) or {}).get("kuis", {}).get("bank", []) if q.get("o") and "a" in q]
    if len(pool) < N_QUESTIONS:
        path = path or db.scalar(select(Path).order_by(Path.id))
        first = next((c for c in learning.path_chapters(db, path.id) if c.kind == "chapter" and c.version), None) if path else None
        if first:
            pool += [q for q in (content_svc.published(db, first, None) or {}).get("kuis", {}).get("bank", []) if q.get("o") and "a" in q]
    seen, uniq = set(), []
    for q in pool:
        if q["id"] not in seen:
            seen.add(q["id"])
            uniq.append(q)
    return uniq, path


def _expire(db: Session, d: Duel) -> None:
    if d.state == "pending" and _aware(d.created_at) + timedelta(seconds=INVITE_S) < now():
        d.state = "expired"
        db.commit()
    elif d.state == "live" and d.ends_at and _aware(d.ends_at) < now():
        _finish(db, d)


def _finish(db: Session, d: Duel) -> None:
    if d.state == "done":
        return
    d.state = "done"
    a, b = db.get(User, d.a_id), db.get(User, d.b_id)
    if d.a_score == d.b_score:
        d.winner_id = None
        activity.add_xp(db, a, XP_TIE, "Duel seri")
        activity.add_xp(db, b, XP_TIE, "Duel seri")
    else:
        win, lose = (a, b) if d.a_score > d.b_score else (b, a)
        d.winner_id = win.id
        activity.add_xp(db, win, XP_WIN, "Menang duel")
        activity.add_xp(db, lose, XP_LOSE, "Ikut duel")
    ca = sum(1 for x in _answers(d, "a") if x.get("correct"))
    cb = sum(1 for x in _answers(d, "b") if x.get("correct"))
    db.commit()
    for uid in (d.a_id, d.b_id):
        presence.push(uid, {"t": "duel", "ev": "done", "id": d.id})
    if d.winner_id:
        win = a if d.winner_id == a.id else b
        lose = b if win is a else a
        wc, lc = (ca, cb) if win is a else (cb, ca)
        text = f"{win.name.split(' ')[0]} memenangkan duel {d.lang or 'kuis'} melawan {lose.name.split(' ')[0]} ({wc}–{lc})"
    else:
        text = f"{a.name.split(' ')[0]} dan {b.name.split(' ')[0]} seri di duel {d.lang or 'kuis'}"
    presence.push_room(room_of(db, a), {"t": "feed", "text": text})


def _finish_later(duel_id: int) -> None:
    db = SessionLocal()
    try:
        d = db.get(Duel, duel_id)
        if d is not None and d.state == "live":
            _finish(db, d)
    finally:
        db.close()


def _schedule_finish(d: Duel) -> None:
    loop = presence.loop
    if loop is None or loop.is_closed() or d.ends_at is None:
        return
    delay = max(0.0, (_aware(d.ends_at) - now()).total_seconds()) + 0.5
    loop.call_soon_threadsafe(lambda: loop.call_later(delay, lambda: loop.run_in_executor(None, _finish_later, d.id)))


def view(db: Session, d: Duel, user: User) -> dict[str, Any]:
    side = _side(d, user.id)
    other = "b" if side == "a" else "a"
    me_u, op_u = db.get(User, user.id), db.get(User, d.b_id if side == "a" else d.a_id)
    mine, theirs = _answers(d, side), _answers(d, other)
    out: dict[str, Any] = {
        "id": d.id, "state": d.state, "lang": d.lang, "n": len(d.questions or []), "per_question": PER_QUESTION_S, "challenger": side == "a",
        "me": {**_person(me_u), "score": d.a_score if side == "a" else d.b_score, "answers": [{"correct": x["correct"]} for x in mine]},
        "opp": {**_person(op_u), "score": d.b_score if side == "a" else d.a_score, "answers": [{"correct": x["correct"]} for x in theirs]},
        "created_at": _aware(d.created_at).isoformat(), "expires_at": (_aware(d.created_at) + timedelta(seconds=INVITE_S)).isoformat(),
        "started_at": _aware(d.started_at).isoformat() if d.started_at else None, "ends_at": _aware(d.ends_at).isoformat() if d.ends_at else None,
        "now": now().isoformat(), "winner_id": d.winner_id,
    }
    if d.state == "done":
        out["review"] = [{"t": q["t"], "c": q.get("c"), "answer": q["o"][q["a"]], "e": q.get("e", ""),
                          "mine": q["o"][mine[i]["choice"]] if i < len(mine) and 0 <= mine[i]["choice"] < len(q["o"]) else None,
                          "ok": bool(i < len(mine) and mine[i]["correct"])} for i, q in enumerate(d.questions or [])]
    return out


def _card(db: Session, d: Duel, user: User) -> dict[str, Any]:
    op = db.get(User, d.b_id if d.a_id == user.id else d.a_id)
    mine = d.a_score if d.a_id == user.id else d.b_score
    theirs = d.b_score if d.a_id == user.id else d.a_score
    return {"id": d.id, "state": d.state, "lang": d.lang, "opp": _person(op), "challenger": d.a_id == user.id, "score": [mine, theirs],
            "won": d.winner_id == user.id if d.state == "done" and d.winner_id else None, "tie": d.state == "done" and d.winner_id is None,
            "expires_at": (_aware(d.created_at) + timedelta(seconds=INVITE_S)).isoformat()}


def _get(db: Session, user: User, duel_id: int) -> Duel:
    d = db.get(Duel, duel_id)
    if d is None:
        raise HTTPException(404, "Duel tidak ditemukan.")
    _side(d, user.id)
    _expire(db, d)
    return d


# ------------------------------------------------------------------- rute ---
@router.get("")
def lobby(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    rows = list(db.scalars(select(Duel).where(or_(Duel.a_id == user.id, Duel.b_id == user.id)).order_by(Duel.id.desc()).limit(40)))
    for d in rows:
        _expire(db, d)
    paths = {}
    for cid, p in learning.progress_map(db, user.id).items():
        if p.phases["pahami"]["state"] == "done":
            ch = db.get(Chapter, cid)
            pa = db.get(Path, ch.path_id)
            paths[pa.id] = {"id": pa.id, "title": pa.title, "language": pa.language}
    return {
        "incoming": [_card(db, d, user) for d in rows if d.state == "pending" and d.b_id == user.id],
        "outgoing": [_card(db, d, user) for d in rows if d.state == "pending" and d.a_id == user.id],
        "active": next((_card(db, d, user) for d in rows if d.state == "live"), None),
        "history": [_card(db, d, user) for d in rows if d.state in ("done", "declined", "expired")][:10],
        "paths": list(paths.values()),
    }


class ChallengeIn(BaseModel):
    lawan: int
    path_id: int | None = None


@router.post("")
def challenge(body: ChallengeIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    opp = db.get(User, body.lawan)
    if opp is None or opp.id == user.id or not user.class_id or opp.class_id != user.class_id or opp.role != "learner":
        raise HTTPException(404, "Duel hanya bisa dengan teman sekelas.")
    busy = db.scalar(select(Duel).where(Duel.state.in_(("pending", "live")), or_(
        (Duel.a_id == user.id) & (Duel.b_id == opp.id), (Duel.a_id == opp.id) & (Duel.b_id == user.id))))
    if busy is not None:
        _expire(db, busy)
        if busy.state in ("pending", "live"):
            raise HTTPException(409, {"code": "busy", "message": "Masih ada duel yang belum selesai dengan teman ini.", "id": busy.id})
    pool, path = _pool(db, user, body.path_id)
    if len(pool) < N_QUESTIONS:
        raise HTTPException(409, {"code": "empty", "message": "Soalnya belum cukup. Selesaikan Pahami satu bab dulu."})
    qs = random.sample(pool, N_QUESTIONS)
    lang = {"python": "Python", "javascript": "JavaScript", "cpp": "C++", "c": "C", "rust": "Rust", "go": "Go", "java": "Java",
            "kotlin": "Kotlin", "php": "PHP", "sql": "SQL"}.get(path.language if path else "", path.title if path else "")
    d = Duel(a_id=user.id, b_id=opp.id, lang=lang, path_id=path.id if path else None,
             questions=[{k: q[k] for k in ("id", "t", "c", "o", "a", "e") if k in q} for q in qs], a_answers=[], b_answers=[])
    db.add(d)
    db.flush()
    learning.notify(db, opp.id, "duel", f"{user.name.split(' ')[0]} menantangmu duel {lang}", "5 soal, 5 menit. Terima dalam 5 menit.", f"/duel/{d.id}")
    db.commit()
    presence.push(opp.id, {"t": "duel", "ev": "invite", "id": d.id, "lang": lang, "from": _person(user), "expires_in": INVITE_S})
    return view(db, d, user)


@router.post("/{duel_id}/terima")
def accept(duel_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    d = _get(db, user, duel_id)
    if d.b_id != user.id or d.state != "pending":
        raise HTTPException(409, {"code": d.state, "message": "Tantangan ini sudah tidak berlaku." if d.state == "expired" else "Duel ini tidak menunggu jawabanmu."})
    d.state = "live"
    d.started_at = now() + timedelta(seconds=COUNTDOWN_S)
    d.ends_at = d.started_at + timedelta(seconds=DUEL_S)
    db.commit()
    presence.push(d.a_id, {"t": "duel", "ev": "start", "id": d.id, "from": _person(user)})
    _schedule_finish(d)
    return view(db, d, user)


@router.post("/{duel_id}/tolak")
def decline(duel_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    d = _get(db, user, duel_id)
    if d.state == "pending":
        d.state = "declined"
        db.commit()
        other = d.a_id if user.id == d.b_id else d.b_id
        presence.push(other, {"t": "duel", "ev": "declined" if user.id == d.b_id else "cancel", "id": d.id, "from": _person(user)})
    return view(db, d, user)


@router.get("/{duel_id}")
def duel_view(duel_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    return view(db, _get(db, user, duel_id), user)


@router.post("/{duel_id}/soal")
def next_question(duel_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    d = _get(db, user, duel_id)
    side = _side(d, user.id)
    if d.state != "live":
        raise HTTPException(409, {"code": d.state, "message": "Duel sudah selesai."})
    if now() < _aware(d.started_at) - timedelta(milliseconds=300):
        raise HTTPException(425, {"code": "countdown", "message": "Tunggu hitung mundurnya."})
    i = len(_answers(d, side))
    if i >= len(d.questions):
        return {"done": True, "index": i}
    SENT.setdefault((d.id, user.id, i), time.monotonic())
    q = d.questions[i]
    return {"done": False, "index": i, "q": {k: q[k] for k in ("t", "c", "o") if k in q}, "seconds": PER_QUESTION_S}


class AnswerIn(BaseModel):
    index: int = Field(ge=0)
    choice: int = Field(ge=-1, le=9)  # -1 = waktu habis


@router.post("/{duel_id}/jawab")
def answer(duel_id: int, body: AnswerIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    d = _get(db, user, duel_id)
    side = _side(d, user.id)
    if d.state != "live":
        raise HTTPException(409, {"code": d.state, "message": "Duel sudah selesai."})
    answers = _answers(d, side)
    if body.index != len(answers) or body.index >= len(d.questions):
        raise HTTPException(409, {"code": "order", "message": "Urutan soal tidak sesuai."})
    sent = SENT.pop((d.id, user.id, body.index), None)
    elapsed = time.monotonic() - sent if sent is not None else PER_QUESTION_S
    left = max(0, int(PER_QUESTION_S - elapsed + .999))
    q = d.questions[body.index]
    correct = body.choice >= 0 and body.choice == q["a"]
    combo = 1
    for x in answers:
        combo = scoring.next_combo(combo, x["correct"])
    points = scoring.kuis_points(combo, left) if correct else 0
    answers.append({"choice": body.choice, "correct": correct, "points": points, "left": left})
    if side == "a":
        d.a_answers, d.a_score = answers, d.a_score + points
    else:
        d.b_answers, d.b_score = answers, d.b_score + points
    score = d.a_score if side == "a" else d.b_score
    activity.record_activity(db, user, 0)
    db.commit()
    other = d.b_id if side == "a" else d.a_id
    presence.push(other, {"t": "duel", "ev": "progress", "id": d.id, "index": body.index, "correct": correct, "score": score})
    both = len(d.a_answers or []) >= len(d.questions) and len(d.b_answers or []) >= len(d.questions)
    if both:
        _finish(db, d)
    return {"correct": correct, "answer": q["a"], "e": q.get("e", ""), "points": points, "score": score,
            "combo": scoring.next_combo(combo, correct), "finished": len(answers) >= len(d.questions), "state": d.state}
