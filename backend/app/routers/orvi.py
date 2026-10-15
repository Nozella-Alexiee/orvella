"""Tanya Orvi: obrolan yang di-stream (services/ai.py), batas bergulir (bawaan 30 per 5 jam, superadmin tanpa batas).

POST /tanya membalas text/event-stream, satu JSON per baris `data:`:
  {"t": "potongan"} · {"alat": [{id, name, arguments}], "token": "..."} · {"selesai": true, "kuota": {...}} · {"error": "rame"}
Kalau model memanggil alat, browser menjalankannya lalu memanggil /tanya lagi dengan hasilnya dan `token` itu:
langkah lanjutan tidak dihitung batas (satu pertanyaan = satu hitungan), maksimal MAX_STEPS langkah per token.
Batas tercapai / terlalu cepat dibalas 429 JSON sebelum stream dimulai.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import time
from collections import deque
from collections.abc import Iterator
from datetime import timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import SessionLocal, get_db
from ..models import AiFeedback, AiUsage, User, now
from ..security import current_user
from ..services import ai, ai_quota, web

router = APIRouter(prefix="/api/orvi", tags=["orvi"])
_recent: dict[int, deque[float]] = {}
_steps: dict[str, int] = {}
_web_recent: dict[int, deque[float]] = {}
MAX_STEPS, TOKEN_TTL = 10, 300


def quota(db: Session, user: User) -> dict[str, Any]:
    lim, win = ai_quota.limit_for(db, user), ai_quota.settings(db)["window_hours"]
    if lim is None:
        return {"limit": None, "sisa": None, "reset_at": None, "window_hours": win, "unlimited": True}
    since = now() - timedelta(hours=win)
    used, first = db.execute(select(func.count(), func.min(AiUsage.at)).where(AiUsage.user_id == user.id, AiUsage.at >= since)).one()
    reset = None
    if first is not None:
        first = first if first.tzinfo else first.replace(tzinfo=now().tzinfo)
        reset = (first + timedelta(hours=win)).isoformat()
    return {"limit": lim, "sisa": max(0, lim - int(used or 0)), "reset_at": reset, "window_hours": win, "unlimited": False}


def _per_minute(uid: int) -> None:
    t = time.monotonic()
    q = _recent.setdefault(uid, deque())
    while q and t - q[0] > 60:
        q.popleft()
    if len(q) >= settings.ai_per_minute:
        raise HTTPException(429, {"kode": "pelan", "pesan": "Pelan-pelan dikit ya, Orvi masih mikir. Coba lagi sebentar lagi."})
    q.append(t)


def _sign(uid: int, exp: int, nonce: str) -> str:
    msg = f"orvi-giliran:{uid}:{exp}:{nonce}".encode()
    return hmac.new(settings.secret_key.encode(), msg, hashlib.sha256).hexdigest()[:32]


def make_token(uid: int) -> str:
    exp, nonce = int(time.time()) + TOKEN_TTL, base64.urlsafe_b64encode(hashlib.sha256(f"{time.time_ns()}{uid}".encode()).digest()[:9]).decode()
    return f"{exp}.{nonce}.{_sign(uid, exp, nonce)}"


def check_token(uid: int, token: str) -> bool:
    """Token langkah lanjutan: milik pengguna ini, belum kedaluwarsa, dan belum lewat MAX_STEPS langkah."""
    try:
        exp_s, nonce, sig = token.split(".")
        exp = int(exp_s)
    except ValueError:
        return False
    if exp < time.time() or not hmac.compare_digest(sig, _sign(uid, exp, nonce)):
        return False
    for k in [k for k in _steps if int(k.split(".")[0]) < time.time()]:
        _steps.pop(k, None)
    _steps[token] = _steps.get(token, 0) + 1
    return _steps[token] <= MAX_STEPS


@router.get("/kuota")
def get_quota(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    return {**quota(db, user), "aktif": ai.enabled()}


class ToolCall(BaseModel):
    id: str = Field(max_length=64)
    name: str = Field(max_length=40)
    arguments: str = Field(default="{}", max_length=ai.MAX_CODE * 2)


class Pesan(BaseModel):
    role: Literal["user", "assistant", "tool"]
    content: str = Field(default="", max_length=ai.MAX_CODE * 2)
    tool_calls: list[ToolCall] = Field(default_factory=list, max_length=8)
    tool_call_id: str = Field(default="", max_length=64)


class Konteks(BaseModel):
    bahasa: str = Field(default="", max_length=20)
    kode: str = Field(default="", max_length=ai.MAX_CODE)
    error: str = Field(default="", max_length=3000)
    berkas: str = Field(default="", max_length=120)
    bab: str = Field(default="", max_length=160)
    baris: int | None = None


class TanyaIn(BaseModel):
    pesan: list[Pesan] = Field(min_length=1, max_length=40)
    konteks: Konteks | None = None
    alat: bool = False
    proyek: str = Field(default="", max_length=80)
    token: str = Field(default="", max_length=120)


def _sse(obj: dict[str, Any]) -> str:
    return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"


def _reply(events: Iterator[str]) -> StreamingResponse:
    return StreamingResponse(events, media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


def _once(text: str, kuota: dict[str, Any], sumber: str) -> StreamingResponse:
    """Jawaban tanpa AI (penjelas bawaan / AI nonaktif), dikirim dengan bentuk stream yang sama."""
    return _reply(iter([_sse({"sumber": sumber}), _sse({"t": text}), _sse({"selesai": True, "kuota": kuota})]))


# permintaan yang jelas minta berkas diubah: kalau model cuma menulis kode di jawaban, dorong sekali untuk memakai alat
_ACTION = re.compile(r"\b(benerin|betulin|perbaiki|perbaikin|fix|ubah|ubahin|ganti|gantiin|tambah|tambahin|bikin|bikinin|buat|buatin|"
                     r"hapus|hapusin|rapikan|rapiin|refactor|implement|tulis|tulisin|terapkan)\b", re.I)
NUDGE = ("Kamu belum menerapkan perubahannya ke berkas. Pengguna minta berkasnya diubah, jadi panggil ubah_berkas atau tulis_berkas "
         "sekarang. Jangan ulangi penjelasan atau kodenya di teks.")


def _wants_edit(pesan: list[Pesan]) -> bool:
    """Giliran ini minta perubahan berkas dan belum ada alat tulis yang dipanggil."""
    last_user = max((i for i, p in enumerate(pesan) if p.role == "user"), default=-1)
    if last_user < 0 or not _ACTION.search(pesan[last_user].content):
        return False
    return not any(c.name in ("ubah_berkas", "tulis_berkas") for p in pesan[last_user:] for c in p.tool_calls)


NONAKTIF = ("Orvi AI belum aktif di server ini.\n\nPenjelasan error umum tetap jalan dari tab **Masalah** di Sandbox. "
            "Pertanyaan bebas bisa dipakai begitu admin mengaktifkan AI.")


@router.post("/tanya")
def tanya(body: TanyaIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> StreamingResponse:
    if body.pesan[-1].role == "user" and not body.pesan[-1].content.strip():
        raise HTTPException(422, "Pertanyaannya kosong.")
    k = body.konteks.model_dump() if body.konteks else None
    lanjutan = bool(body.token)
    # langkah lanjutan cuma boleh membawa hasil alat, bukan pertanyaan baru (biar tidak jadi jalan pintas batas)
    if lanjutan and (body.pesan[-1].role != "tool" or not check_token(user.id, body.token)):
        raise HTTPException(403, {"kode": "token", "pesan": "Langkah Orvi kedaluwarsa. Tanya lagi ya."})
    if not ai.enabled():
        return _once(ai.builtin(k) or NONAKTIF, quota(db, user), "bawaan" if ai.builtin(k) else "nonaktif")
    q = quota(db, user)
    if not lanjutan:
        if not q["unlimited"] and q["sisa"] <= 0:
            raise HTTPException(429, {"kode": "batas", "pesan": f"Kamu udah pakai {q['limit']} pertanyaan dalam {q['window_hours']} jam terakhir.",
                                      "reset_at": q["reset_at"], "limit": q["limit"]})
        _per_minute(user.id)
    tools = ai.tools_for(k, body.alat)
    msgs = ai.messages([p.model_dump() for p in body.pesan], k, body.alat, body.proyek)
    uid, token = user.id, body.token
    nudge = any(t["function"]["name"] == "ubah_berkas" for t in tools) and _wants_edit(body.pesan)

    def run(m: list[dict[str, Any]]) -> Iterator[dict[str, Any]]:
        """Stream jawaban; kalau model cuma menulis kode padahal diminta mengubah berkas, minta sekali lagi pakai alat."""
        said, called = "", False
        for ev in ai.stream(m, tools):
            said += ev.get("t", "")
            called = called or "alat" in ev
            yield ev
        if nudge and not called and "```" in said:
            for ev in ai.stream(m + [{"role": "assistant", "content": said}, {"role": "system", "content": NUDGE}], tools):
                if "alat" in ev:  # teksnya sudah ada; yang diambil cuma pemanggilan alatnya
                    yield ev

    def events() -> Iterator[str]:
        counted = lanjutan
        try:
            for ev in run(msgs):
                if "model" in ev:
                    if not counted:  # dihitung begitu ada keluaran, sekali per pertanyaan
                        with SessionLocal() as s:
                            s.add(AiUsage(user_id=uid, model=ev["model"])); s.commit()
                        counted = True
                    yield _sse({"sumber": ev["model"]})
                elif "alat" in ev:
                    yield _sse({"alat": ev["alat"], "token": token or make_token(uid)})
                else:
                    yield _sse(ev)
        except ai.AiUnavailable:
            b = ai.builtin(k)
            if b and not counted:
                yield _sse({"sumber": "bawaan"}); yield _sse({"t": b})
            else:
                yield _sse({"error": "rame", "pesan": "Orvi lagi rame banget. Coba lagi sebentar ya."})
                return
        with SessionLocal() as s:
            u = s.get(User, uid)
            yield _sse({"selesai": True, "kuota": quota(s, u) if u else None})

    return _reply(events())


class FeedbackIn(BaseModel):
    nilai: Literal["naik", "turun"]
    alasan: str = Field(default="", max_length=40)
    sumber: str = Field(default="", max_length=80)


@router.post("/umpan-balik")
def feedback(body: FeedbackIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, bool]:
    db.add(AiFeedback(user_id=user.id, nilai=body.nilai, alasan=body.alasan, sumber=body.sumber))
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- internet ---
# Alat cari_web / buka_halaman dijalankan browser lewat dua endpoint ini (loop agen yang sama dengan alat Sandbox).
# Tidak memotong batas pertanyaan, tapi ada rem per orang supaya mesin pencarinya tidak dibanjiri.

def _web_brake(uid: int) -> None:
    t = time.monotonic()
    q = _web_recent.setdefault(uid, deque())
    while q and t - q[0] > 600:
        q.popleft()
    if len(q) >= settings.web_per_10min:
        raise HTTPException(429, {"kode": "pelan", "pesan": "Orvi udah banyak browsing barusan. Tunggu sebentar ya."})
    q.append(t)


class CariIn(BaseModel):
    kueri: str = Field(min_length=1, max_length=300)


class BukaIn(BaseModel):
    url: str = Field(min_length=8, max_length=1000)


@router.post("/web/cari")
def web_search(body: CariIn, user: User = Depends(current_user)) -> dict[str, Any]:
    if not web.enabled():
        return {"hasil": [], "teks": "Pencarian internet belum aktif di server ini."}
    _web_brake(user.id)
    try:
        rows = web.search(body.kueri)
    except web.WebError as e:
        return {"hasil": [], "teks": f"Gagal mencari: {e}"}
    if not rows:
        return {"hasil": [], "teks": "Tidak ada hasil. Coba kata kunci lain."}
    teks = "\n\n".join(f"[{i}] {r['judul']}\n{r['url']}" + (f" ({r['tanggal']})" if r["tanggal"] else "") + f"\n{r['cuplikan']}" for i, r in enumerate(rows, 1))
    return {"hasil": rows, "teks": teks}


@router.post("/web/buka")
def web_open(body: BukaIn, user: User = Depends(current_user)) -> dict[str, Any]:
    if not web.enabled():
        return {"teks": "Akses internet belum aktif di server ini."}
    _web_brake(user.id)
    try:
        page = web.fetch(body.url)
    except web.WebError as e:
        return {"teks": f"Gagal membuka {body.url}: {e}"}
    return {"judul": page["judul"], "url": page["url"], "teks": f"Judul: {page['judul']}\nURL: {page['url']}\n\n{page['teks']}"}
