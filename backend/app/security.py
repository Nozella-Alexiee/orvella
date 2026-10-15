from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import User

ALGO = "HS256"


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8")[:72], bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(pw.encode("utf-8")[:72], hashed.encode())
    except ValueError:
        return False


MIN_PASSWORD, MAX_PASSWORD = 8, 128


def password_problem(pw: str, email: str = "") -> str | None:
    """Aturan kata sandi baru (daftar, dibuat admin, ganti, reset). Kata sandi lama yang lebih pendek tetap bisa dipakai masuk."""
    if len(pw) < MIN_PASSWORD:
        return f"Minimal {MIN_PASSWORD} karakter."
    if len(pw) > MAX_PASSWORD:
        return f"Maksimal {MAX_PASSWORD} karakter."
    if email and pw.strip().lower() == email.strip().lower():
        return "Jangan pakai email sebagai kata sandi."
    return None


def issue_session(response: Response, user: User) -> None:
    now_ = datetime.now(timezone.utc)
    exp = now_ + timedelta(days=settings.session_days)
    # ims (waktu terbit, milidetik) dipakai untuk menolak sesi lama setelah kata sandi diganti (lihat user_from_token)
    token = jwt.encode({"sub": str(user.id), "role": user.role, "ims": int(now_.timestamp() * 1000), "exp": exp}, settings.secret_key, algorithm=ALGO)
    response.set_cookie(
        settings.session_cookie, token, max_age=settings.session_days * 86400,
        httponly=True, samesite="lax", secure=settings.cookie_secure, path="/",
    )


def clear_session(response: Response) -> None:
    response.delete_cookie(settings.session_cookie, path="/")


def user_from_token(db: Session, token: str | None) -> User | None:
    if not token:
        return None
    try:
        data = jwt.decode(token, settings.secret_key, algorithms=[ALGO])
    except jwt.PyJWTError:
        return None
    user = db.get(User, int(data["sub"]))
    if user is not None and user.pw_changed_at is not None:
        changed = user.pw_changed_at if user.pw_changed_at.tzinfo else user.pw_changed_at.replace(tzinfo=timezone.utc)
        if int(data.get("ims", 0)) < int(changed.timestamp() * 1000):
            return None  # sesi terbit sebelum kata sandi diganti/direset (sesi lama tanpa ims juga ditolak)
    return user


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    user = user_from_token(db, request.cookies.get(settings.session_cookie))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Silakan masuk dulu.")
    return user


# superadmin = admin + boleh ngatur admin lain dan batas Tanya Orvi. Role ini cuma bisa dikasih lewat
# scripts/set_role.py di server, tidak pernah lewat API.
ADMIN_ROLES = frozenset({"admin", "superadmin"})


def is_admin(user: User | None) -> bool:
    return user is not None and user.role in ADMIN_ROLES


def is_superadmin(user: User | None) -> bool:
    return user is not None and user.role == "superadmin"


def require_role(*roles: str):
    """Guard per peran. Kalau "admin" diizinkan, superadmin otomatis ikut diizinkan."""
    allowed = set(roles) | ({"superadmin"} if "admin" in roles else set())

    def dep(user: User = Depends(current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Kamu tidak punya akses ke halaman ini.")
        return user
    return dep
