"""Batas percobaan: salah kata sandi dan permintaan link lupa kata sandi. Disimpan di DB (tabel login_attempts),
jadi tetap berlaku walau server restart atau jalan lebih dari satu proses."""
from __future__ import annotations

import math
from datetime import timedelta

from fastapi import HTTPException, Request
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import LoginAttempt, now

WINDOW = timedelta(minutes=15)
PER_EMAIL, PER_IP = 5, 30           # salah kata sandi per 15 menit
LUPA_WINDOW, LUPA_PER_EMAIL = timedelta(hours=1), 3


def client_ip(request: Request) -> str:
    if settings.trust_proxy:
        h = request.headers.get("cf-connecting-ip") or (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
        if h:
            return h[:64]
    return (request.client.host if request.client else "")[:64]


def _count(db: Session, kind: str, since, email: str | None = None, ip: str | None = None) -> tuple[int, object]:
    stmt = select(func.count(), func.min(LoginAttempt.at)).where(LoginAttempt.kind == kind, LoginAttempt.at >= since)
    if email is not None:
        stmt = stmt.where(LoginAttempt.email == email)
    if ip is not None:
        stmt = stmt.where(LoginAttempt.ip == ip)
    n, first = db.execute(stmt).one()
    return int(n or 0), first


def _wait_minutes(first, window: timedelta) -> int:
    if first is None:
        return math.ceil(window.total_seconds() / 60)
    if first.tzinfo is None:
        from datetime import timezone
        first = first.replace(tzinfo=timezone.utc)
    left = (first + window - now()).total_seconds()
    return max(1, math.ceil(left / 60))


def check_login(db: Session, email: str, ip: str) -> None:
    since = now() - WINDOW
    n_mail, first_mail = _count(db, "login", since, email=email)
    n_ip, first_ip = _count(db, "login", since, ip=ip) if ip else (0, None)
    if n_mail >= PER_EMAIL or n_ip >= PER_IP:
        mins = _wait_minutes(first_mail if n_mail >= PER_EMAIL else first_ip, WINDOW)
        raise HTTPException(429, {"fields": {"password": f"Terlalu banyak percobaan. Coba lagi dalam {mins} menit."}})


def fail_login(db: Session, email: str, ip: str) -> int:
    """Catat satu kali salah. Kembalikan jumlah salah untuk email ini dalam jendela waktu (termasuk yang barusan)."""
    db.execute(delete(LoginAttempt).where(LoginAttempt.at < now() - timedelta(days=1)))  # bersih-bersih sambil jalan
    db.add(LoginAttempt(kind="login", email=email, ip=ip))
    db.flush()
    return _count(db, "login", now() - WINDOW, email=email)[0]


def clear_login(db: Session, email: str) -> None:
    db.execute(delete(LoginAttempt).where(LoginAttempt.kind == "login", LoginAttempt.email == email))


def allow_lupa(db: Session, email: str, ip: str) -> bool:
    """Maksimal 3 permintaan link per email per jam. False = diam-diam tidak dikirim (respons tetap sama)."""
    n, _ = _count(db, "lupa", now() - LUPA_WINDOW, email=email)
    if n >= LUPA_PER_EMAIL:
        return False
    db.add(LoginAttempt(kind="lupa", email=email, ip=ip))
    return True
