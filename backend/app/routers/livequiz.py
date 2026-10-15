"""Kuis langsung kelas (ala Kahoot): mentor memandu dari layar proyektor, siswa menjawab dari HP/laptop pakai PIN.

Satu permainan hidup di memori per PIN (aplikasi berjalan satu proses). Jam soal, benar/salah, dan poin dihitung di
server dengan rumus Kuis (100 × combo + sisa detik × 5). Jawaban disimpan ke live_quiz_answers untuk laporan/CSV.
WS /ws/live/{pin}: host = mentor pembuatnya; pemain = pengguna dari sekolah yang sama (maks. 80).
"""
from __future__ import annotations

import asyncio
import csv
import io
import json
import random
import time
from dataclasses import dataclass, field
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, WebSocket
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from ..config import settings
from ..db import SessionLocal, get_db
from ..models import Chapter, Klass, LiveQuiz, LiveQuizAnswer, User, now
from ..security import current_user, is_admin, user_from_token
from ..services import content as content_svc, learning, quickquiz, scoring
from ..services.presence import hub as presence
from ..services.realtime import mentor_classes, origin_ok
from ..views import initials

router = APIRouter(prefix="/api/kuis-langsung", tags=["kuis-langsung"])
ws_router = APIRouter()
MAX_PLAYERS = 80
MAX_OPTIONS = 4


@dataclass(eq=False)
class Player:
    id: int
    name: str
    initials: str
    score: int = 0
    combo: int = 1
    answers: dict[int, dict[str, Any]] = field(default_factory=dict)
    conns: set[WebSocket] = field(default_factory=set)


@dataclass(eq=False)
class Game:
    quiz_id: int
    pin: str
    host_id: int
    org_id: int | None
    title: str
    questions: list[dict[str, Any]]
    seconds: int
    state: str = "lobby"  # lobby | question | reveal | board | done
    index: int = -1
    q_started: float = 0.0
    hosts: set[WebSocket] = field(default_factory=set)
    players: dict[int, Player] = field(default_factory=dict)
    timer: asyncio.Task | None = None

    def ranking(self) -> list[Player]:
        return sorted(self.players.values(), key=lambda p: (-p.score, p.name))

    def rank_of(self, uid: int) -> int:
        return next((i + 1 for i, p in enumerate(self.ranking()) if p.id == uid), 0)


GAMES: dict[str, Game] = {}


# ------------------------------------------------------------------- kirim ---
async def _send(ws: WebSocket, msg: dict[str, Any]) -> None:
    try:
        await asyncio.wait_for(ws.send_text(json.dumps(msg)), 3)
    except Exception:  # noqa: BLE001
        pass


async def to_hosts(g: Game, msg: dict[str, Any]) -> None:
    await asyncio.gather(*(_send(w, msg) for w in list(g.hosts)))


async def to_player(p: Player, msg: dict[str, Any]) -> None:
    await asyncio.gather(*(_send(w, msg) for w in list(p.conns)))


async def to_players(g: Game, fn) -> None:  # noqa: ANN001 - fn(player) -> pesan
    await asyncio.gather(*(to_player(p, fn(p)) for p in list(g.players.values())))


def lobby_msg(g: Game) -> dict[str, Any]:
    return {"t": "lobby", "pin": g.pin, "title": g.title, "n": len(g.questions), "seconds": g.seconds,
            "players": [{"id": p.id, "name": p.name, "initials": p.initials} for p in g.players.values()]}


def board(g: Game, n: int = 5) -> list[dict[str, Any]]:
    return [{"id": p.id, "name": p.name, "initials": p.initials, "score": p.score} for p in g.ranking()[:n]]


def public_q(q: dict[str, Any]) -> dict[str, Any]:
    return {k: q[k] for k in ("t", "c", "o") if k in q}


# ----------------------------------------------------------------- jalannya ---
async def show_question(g: Game, i: int) -> None:
    g.state, g.index, g.q_started = "question", i, time.monotonic()
    q = g.questions[i]
    base = {"t": "question", "index": i, "n": len(g.questions), "seconds": g.seconds, "q": public_q(q)}
    await to_hosts(g, {**base, "answered": 0, "total": len(g.players)})
    await to_players(g, lambda p: {**base, "score": p.score})
    if g.timer:
        g.timer.cancel()
    g.timer = asyncio.create_task(_time_up(g, i))


async def _time_up(g: Game, i: int) -> None:
    try:
        await asyncio.sleep(g.seconds + 0.5)
    except asyncio.CancelledError:
        return
    if g.state == "question" and g.index == i:
        await reveal(g)


async def reveal(g: Game) -> None:
    if g.state != "question":
        return
    g.state = "reveal"
    if g.timer and asyncio.current_task() is not g.timer:
        g.timer.cancel()
    q, i = g.questions[g.index], g.index
    dist = [0] * len(q["o"])
    for p in g.players.values():
        a = p.answers.get(i)
        if a is None:
            p.combo = 1  # tidak menjawab = combo putus
        elif 0 <= a["choice"] < len(dist):
            dist[a["choice"]] += 1
    await to_hosts(g, {"t": "reveal", "index": i, "answer": q["a"], "dist": dist, "e": q.get("e", ""), "board": board(g)})
    await to_players(g, lambda p: {"t": "result", "index": i, "answer": q["a"], "answered": i in p.answers,
                                   "correct": bool(p.answers.get(i, {}).get("correct")), "points": p.answers.get(i, {}).get("points", 0),
                                   "score": p.score, "rank": g.rank_of(p.id), "of": len(g.players)})


async def finish(g: Game) -> None:
    if g.timer:
        g.timer.cancel()
    g.state = "done"
    podium = board(g, 3)
    await to_hosts(g, {"t": "done", "podium": podium, "board": board(g, 10), "quiz_id": g.quiz_id})
    await to_players(g, lambda p: {"t": "done", "score": p.score, "rank": g.rank_of(p.id), "of": len(g.players), "podium": podium})
    await run_in_threadpool(_mark_done, g.quiz_id)
    GAMES.pop(g.pin, None)


def _mark_done(quiz_id: int) -> None:
    db = SessionLocal()
    try:
        lq = db.get(LiveQuiz, quiz_id)
        if lq is not None:
            lq.state, lq.finished_at = "done", now()
            db.commit()
    finally:
        db.close()


def _save_answer(quiz_id: int, uid: int, i: int, choice: int, correct: bool, points: int, ms: int) -> None:
    db = SessionLocal()
    try:
        db.add(LiveQuizAnswer(quiz_id=quiz_id, user_id=uid, q_index=i, choice=choice, correct=correct, points=points, ms=ms))
        db.commit()
    except Exception:  # noqa: BLE001 - jawaban ganda: yang pertama yang dipakai
        db.rollback()
    finally:
        db.close()


async def answer(g: Game, p: Player, i: int, choice: int) -> None:
    if g.state != "question" or i != g.index or i in p.answers:
        return
    q = g.questions[i]
    elapsed = time.monotonic() - g.q_started
    if elapsed > g.seconds + 0.5:
        return
    left = max(0, int(g.seconds - elapsed + .999))
    correct = choice == q["a"]
    points = scoring.kuis_points(p.combo, left) if correct else 0
    p.combo = scoring.next_combo(p.combo, correct)
    p.score += points
    p.answers[i] = {"choice": choice, "correct": correct, "points": points}
    await to_player(p, {"t": "answered", "index": i})
    count = sum(1 for x in g.players.values() if i in x.answers)
    await to_hosts(g, {"t": "answered", "index": i, "count": count, "total": len(g.players)})
    await run_in_threadpool(_save_answer, g.quiz_id, p.id, i, choice, correct, points, int(elapsed * 1000))
    if count >= len(g.players):
        await reveal(g)


async def host_cmd(g: Game, m: dict[str, Any]) -> None:
    t = m.get("t")
    if t == "start" and g.state == "lobby" and g.players:
        await show_question(g, 0)
    elif t == "reveal" and g.state == "question":
        await reveal(g)
    elif t == "board" and g.state == "reveal":
        g.state = "board"
        await to_hosts(g, {"t": "board", "index": g.index, "board": board(g, 10)})
    elif t == "next" and g.state in ("reveal", "board"):
        if g.index + 1 < len(g.questions):
            await show_question(g, g.index + 1)
        else:
            await finish(g)
    elif t == "finish" and g.state != "done":
        await finish(g)
    elif t == "kick" and g.state == "lobby":
        p = g.players.pop(int(m.get("id", 0)), None)
        if p:
            for w in list(p.conns):
                await _send(w, {"t": "kicked"})
                try:
                    await w.close(code=4403)
                except Exception:  # noqa: BLE001
                    pass
            await to_hosts(g, lobby_msg(g))


def state_for_player(g: Game, p: Player) -> dict[str, Any]:
    if g.state == "lobby":
        return {**lobby_msg(g), "you": {"id": p.id, "name": p.name}}
    if g.state == "question":
        left = max(0, g.seconds - (time.monotonic() - g.q_started))
        return {"t": "question", "index": g.index, "n": len(g.questions), "seconds": g.seconds, "left": left, "q": public_q(g.questions[g.index]),
                "score": p.score, "answered": g.index in p.answers}
    return {"t": "wait", "index": g.index, "n": len(g.questions), "score": p.score, "rank": g.rank_of(p.id), "of": len(g.players)}


def state_for_host(g: Game) -> list[dict[str, Any]]:
    out = [lobby_msg(g)]
    if g.state == "question":
        left = max(0, g.seconds - (time.monotonic() - g.q_started))
        out.append({"t": "question", "index": g.index, "n": len(g.questions), "seconds": g.seconds, "left": left, "q": public_q(g.questions[g.index]),
                    "answered": sum(1 for x in g.players.values() if g.index in x.answers), "total": len(g.players)})
    elif g.state in ("reveal", "board"):
        out.append({"t": "board", "index": g.index, "board": board(g, 10)})
    return out


# -------------------------------------------------------------------- REST ---
def _mentor(user: User) -> None:
    if user.role != "mentor" and not is_admin(user):
        raise HTTPException(403, "Kuis langsung dipandu mentor.")


@router.get("/sumber")
def sources(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Bab yang punya bank soal Kuis, dari jalur kelas-kelas mentor ini."""
    _mentor(user)
    out, seen = [], set()
    for cid in mentor_classes(db, user) or []:
        k = db.get(Klass, cid)
        for ch in learning.path_chapters(db, k.path_id) if k and k.path_id else []:
            if ch.id in seen or ch.kind != "chapter" or not ch.version:
                continue
            seen.add(ch.id)
            bank = (content_svc.published(db, ch, None) or {}).get("kuis", {}).get("bank", [])
            n = sum(1 for q in bank if len(q.get("o", [])) <= MAX_OPTIONS and "a" in q)
            if n:
                out.append({"id": ch.id, "number": ch.number, "title": ch.title, "count": n})
    classes = [{"id": c, "name": db.get(Klass, c).name} for c in mentor_classes(db, user)]
    return {"chapters": out, "classes": classes}


class CreateIn(BaseModel):
    source: Literal["bab", "cepat"] = "bab"
    chapter_id: int | None = None
    text: str = Field(default="", max_length=20000)
    count: int = Field(default=8, ge=1, le=30)
    seconds: int = Field(default=20, ge=5, le=120)
    class_id: int | None = None
    title: str = Field(default="", max_length=120)


@router.post("")
def create(body: CreateIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    _mentor(user)
    classes = mentor_classes(db, user)
    class_id = body.class_id if body.class_id in classes else (classes[0] if classes else None)
    if body.source == "bab":
        ch = db.get(Chapter, body.chapter_id or 0)
        if ch is None:
            raise HTTPException(404, "Bab tidak ditemukan.")
        bank = [q for q in (content_svc.published(db, ch, None) or {}).get("kuis", {}).get("bank", []) if len(q.get("o", [])) <= MAX_OPTIONS and "a" in q]
        qs = random.sample(bank, min(body.count, len(bank)))
        title = body.title or f"Bab {ch.number} · {ch.title}"
    else:
        parsed = quickquiz.parse_text(body.text)
        qs = [q for q in parsed["questions"] if len(q["o"]) <= MAX_OPTIONS][:body.count]
        title = body.title or "Kuis cepat"
    if not qs:
        raise HTTPException(422, {"fields": {"text": "Belum ada soal yang bisa dipakai (maksimal 4 pilihan per soal)."}})
    live_pins = {g.pin for g in GAMES.values()}
    pin = next(p for p in (f"{random.randint(0, 999999):06d}" for _ in range(1000)) if p not in live_pins)
    lq = LiveQuiz(host_id=user.id, class_id=class_id, pin=pin, title=title[:120], seconds=body.seconds,
                  questions=[{k: q[k] for k in ("t", "c", "o", "a", "e") if k in q} for q in qs])
    db.add(lq)
    db.commit()
    GAMES[pin] = Game(quiz_id=lq.id, pin=pin, host_id=user.id, org_id=user.org_id, title=lq.title, questions=lq.questions, seconds=lq.seconds)
    if class_id:
        presence.push_room(f"k{class_id}", {"t": "kuis-live", "pin": pin, "title": lq.title, "host": user.name})
    return {"id": lq.id, "pin": pin, "title": lq.title, "n": len(qs)}


class JoinIn(BaseModel):
    pin: str = Field(pattern=r"^\d{6}$")


@router.post("/gabung")
def join(body: JoinIn, user: User = Depends(current_user)) -> dict[str, Any]:
    g = GAMES.get(body.pin)
    if g is None:
        raise HTTPException(404, "PIN tidak ditemukan. Cek lagi angkanya, ya.")
    if g.org_id and user.org_id != g.org_id:
        raise HTTPException(403, "Kuis ini untuk sekolah lain.")
    if g.state != "lobby" and user.id not in g.players:
        raise HTTPException(409, "Kuisnya sudah dimulai.")
    return {"pin": g.pin, "title": g.title}


@router.get("/{quiz_id}/laporan")
def report(quiz_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    lq = db.get(LiveQuiz, quiz_id)
    if lq is None or (lq.host_id != user.id and not is_admin(user)):
        raise HTTPException(404, "Kuis tidak ditemukan.")
    rows = list(db.execute(select(LiveQuizAnswer, User).join(User, User.id == LiveQuizAnswer.user_id).where(LiveQuizAnswer.quiz_id == lq.id)))
    per_q = []
    for i, q in enumerate(lq.questions):
        ans = [a for a, _ in rows if a.q_index == i]
        per_q.append({"t": q["t"], "answer": q["o"][q["a"]], "answered": len(ans), "correct": sum(1 for a in ans if a.correct),
                      "avg_ms": int(sum(a.ms for a in ans) / len(ans)) if ans else None})
    people: dict[int, dict[str, Any]] = {}
    for a, u in rows:
        p = people.setdefault(u.id, {"name": u.name, "score": 0, "correct": 0})
        p["score"] += a.points
        p["correct"] += int(a.correct)
    return {"title": lq.title, "state": lq.state, "questions": per_q, "players": sorted(people.values(), key=lambda p: -p["score"])}


@router.get("/{quiz_id}/laporan.csv")
def report_csv(quiz_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    r = report(quiz_id, user, db)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Nama", "Skor", "Benar"])
    for p in r["players"]:
        w.writerow([p["name"], p["score"], p["correct"]])
    w.writerow([])
    w.writerow(["Soal", "Jawaban benar", "Menjawab", "Benar", "Rata-rata waktu (detik)"])
    for q in r["questions"]:
        w.writerow([q["t"], q["answer"], q["answered"], q["correct"], round(q["avg_ms"] / 1000, 1) if q["avg_ms"] else ""])
    return Response("﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="kuis-langsung-{quiz_id}.csv"'})


# --------------------------------------------------------------- websocket ---
def _who(token: str | None) -> dict[str, Any] | None:
    db = SessionLocal()
    try:
        u = user_from_token(db, token)
        return {"id": u.id, "name": u.name, "org_id": u.org_id} if u else None
    finally:
        db.close()


@ws_router.websocket("/ws/live/{pin}")
async def live_ws(ws: WebSocket, pin: str) -> None:
    await ws.accept()
    if not origin_ok(ws):
        await ws.close(code=4403)
        return
    who = await run_in_threadpool(_who, ws.cookies.get(settings.session_cookie))
    if who is None:
        await ws.close(code=4401)
        return
    g = GAMES.get(pin)
    if g is None:
        await ws.close(code=4404)
        return
    host = who["id"] == g.host_id
    p: Player | None = None
    if host:
        g.hosts.add(ws)
        for m in state_for_host(g):
            await _send(ws, m)
    else:
        if g.org_id and who["org_id"] != g.org_id:
            await ws.close(code=4403)
            return
        p = g.players.get(who["id"])
        if p is None:
            if g.state != "lobby" or len(g.players) >= MAX_PLAYERS:
                await ws.close(code=4429 if g.state == "lobby" else 4409)
                return
            p = g.players[who["id"]] = Player(id=who["id"], name=who["name"], initials=initials(who["name"]))
            await to_hosts(g, lobby_msg(g))
        p.conns.add(ws)
        await _send(ws, state_for_player(g, p))
    try:
        while True:
            raw = await ws.receive_text()
            if len(raw) > 1000:
                continue
            try:
                m = json.loads(raw)
            except ValueError:
                continue
            if not isinstance(m, dict):
                continue
            if m.get("t") == "ping":
                await _send(ws, {"t": "pong"})
            elif host:
                await host_cmd(g, m)
            elif p is not None and m.get("t") == "answer":
                await answer(g, p, int(m.get("index", -1)), int(m.get("choice", -1)))
    except Exception:  # noqa: BLE001 - putus
        pass
    finally:
        if host:
            g.hosts.discard(ws)
        elif p is not None:
            p.conns.discard(ws)
            if g.state == "lobby" and not p.conns:  # keluar dari lobi: nama hilang dari layar
                g.players.pop(p.id, None)
                await to_hosts(g, lobby_msg(g))
