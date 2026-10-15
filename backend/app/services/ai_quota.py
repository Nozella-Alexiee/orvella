"""Batas Tanya Orvi: N pertanyaan per jendela waktu bergulir (bawaan 30 per 5 jam).

Setelan bawaan disimpan di AppSetting key "ai" dan cuma bisa diubah superadmin. Batas per orang ada di
User.ai_limit: None = ikut bawaan, -1 = tanpa batas, angka = batas khusus. Superadmin selalu tanpa batas.
Penghitungnya (tabel pemakaian) dibangun bareng Tanya Orvi; modul ini yang menentukan batasnya.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..models import User
from .sandbox import put_setting, setting

DEFAULT = {"limit": 30, "window_hours": 5}
MAX_LIMIT = 1000
MAX_WINDOW = 24
UNLIMITED = -1


def settings(db: Session) -> dict[str, int]:
    s = setting(db, "ai", DEFAULT)
    return {"limit": int(s["limit"]), "window_hours": int(s["window_hours"])}


def put(db: Session, limit: int, window_hours: int) -> dict[str, int]:
    if not 0 <= limit <= MAX_LIMIT:
        raise ValueError(f"Batas harus 0–{MAX_LIMIT}.")
    if not 1 <= window_hours <= MAX_WINDOW:
        raise ValueError(f"Jendela waktu harus 1–{MAX_WINDOW} jam.")
    put_setting(db, "ai", {"limit": limit, "window_hours": window_hours})
    db.flush()  # sesi tanpa autoflush: baris baru baru kebaca setelah di-flush
    return settings(db)


def valid_user_limit(v: int | None) -> bool:
    return v is None or v == UNLIMITED or 0 <= v <= MAX_LIMIT


def limit_for(db: Session, user: User) -> int | None:
    """Jumlah pertanyaan per jendela waktu untuk orang ini. None = tanpa batas."""
    if user.role == "superadmin" or user.ai_limit == UNLIMITED:
        return None
    if user.ai_limit is not None:
        return user.ai_limit
    return settings(db)["limit"]


def view(db: Session, user: User) -> dict[str, Any]:
    lim = limit_for(db, user)
    return {"limit": lim, "window_hours": settings(db)["window_hours"], "unlimited": lim is None}
