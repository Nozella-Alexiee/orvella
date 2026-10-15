"""Dasar WebSocket realtime Orvella: siapa pengguna di balik cookie, room presence-nya, dan pemeriksaan Origin.

Semua WS baru (kolab, duel, kuis langsung) memakai kode tutup yang sama:
4401 belum masuk · 4403 tanpa izin / origin asing · 4404 tidak ditemukan · 4408 diam terlalu lama · 4429 terlalu banyak koneksi.
"""
from __future__ import annotations

from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.websockets import WebSocket

from ..config import settings
from ..models import Klass, User
from ..security import is_admin


def room_of(db: Session, user: User) -> str:
    """Room presence: kelas siswa, atau kelas pertama yang dipegang mentor."""
    room = user.class_id
    if room is None and user.role == "mentor":
        room = db.scalar(select(Klass.id).where(Klass.mentor_id == user.id).order_by(Klass.id).limit(1))
    return f"k{room}" if room else f"u{user.id}"


def mentor_classes(db: Session, user: User) -> list[int]:
    if user.role != "mentor" and not is_admin(user):
        return []
    return list(db.scalars(select(Klass.id).where(Klass.mentor_id == user.id)))


def origin_ok(ws: WebSocket) -> bool:
    """Browser selalu mengirim Origin di WebSocket: harus sama dengan host aplikasi (atau PUBLIC_URL).
    Tanpa Origin (klien non-browser, tes) diizinkan, karena serangan lintas situs lewat cookie datang dari browser."""
    origin = ws.headers.get("origin")
    if not origin:
        return True
    host = urlparse(origin).netloc.lower()
    allowed = {ws.headers.get("host", "").lower()}
    if settings.public_url:
        allowed.add(urlparse(settings.public_url).netloc.lower())
    return host in allowed
