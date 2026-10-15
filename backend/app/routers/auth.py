import hashlib
import json
import secrets
from datetime import timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..config import settings
from ..models import Chapter, Klass, PasswordReset, Path, User, now
from ..security import clear_session, current_user, hash_password, issue_session, password_problem, verify_password
from ..services import activity, audit, guard, learning, mailer
from ..views import me_view

router = APIRouter(prefix="/api", tags=["auth"])

DEFAULT_PREFS = {"orvi": True, "reminders": True, "mentor_sees_wrong": True, "language": "id",
                 # Orvella OS: status terlihat teman ("on"/"off"), tur Orvi sudah dilihat, musik terakhir
                 "presence": "on", "tour_done": False, "music": None,
                 # desktop: catatan tempel dan setelan timer fokus (menit kerja/istirahat)
                 "note": "", "pomodoro": {"work": 25, "rest": 5}}
PREF_LIMITS = {"note": 3000}  # batas panjang JSON per kunci; kunci lain 500


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=200)
    password: str = ""


class LoginIn(BaseModel):
    email: str
    password: str = ""


@router.post("/auth/register")
def register(body: RegisterIn, response: Response, db: Session = Depends(get_db)) -> dict[str, Any]:
    email = body.email.strip().lower()
    errors: dict[str, str] = {}
    if "@" not in email:
        errors["email"] = "Email belum valid."
    if not body.password:
        errors["password"] = "Kata sandi tidak boleh kosong."
    elif (p := password_problem(body.password, email)):
        errors["password"] = p
    if not body.name.strip():
        errors["name"] = "Nama panggilan tidak boleh kosong."
    if not errors and db.scalar(select(User).where(func.lower(User.email) == email)):
        errors["email"] = "Email ini sudah terdaftar. Coba masuk."
    if errors:
        raise HTTPException(422, {"fields": errors})
    klass = db.scalar(select(Klass).order_by(Klass.id))  # demo: new learners join the first class
    user = User(email=email, name=body.name.strip(), password_hash=hash_password(body.password), role="learner",
                org_id=klass.org_id if klass else None, class_id=klass.id if klass else None, prefs=dict(DEFAULT_PREFS))
    db.add(user)
    db.commit()
    issue_session(response, user)
    return me_view(db, user)


@router.post("/auth/login")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)) -> dict[str, Any]:
    if not body.password:
        raise HTTPException(422, {"fields": {"password": "Kata sandi tidak boleh kosong."}})
    email, ip = body.email.strip().lower(), guard.client_ip(request)
    guard.check_login(db, email, ip)  # 429 kalau sudah terlalu sering salah (per email & per IP)
    user = db.scalar(select(User).where(func.lower(User.email) == email))
    if user is not None and not user.password_hash and user.google_sub:
        raise HTTPException(401, {"fields": {"password": "Akun ini dibuat lewat Google. Pakai tombol Masuk dengan Google."}})
    if user is None or not verify_password(body.password, user.password_hash):
        fails = guard.fail_login(db, email, ip)
        if fails == guard.PER_EMAIL:
            audit.record(db, None, "login.locked", user, email=email, fails=fails)
        db.commit()
        raise HTTPException(401, {"fields": {"password": "Email atau kata sandi belum cocok."}})
    guard.clear_login(db, email)
    db.commit()
    issue_session(response, user)
    return me_view(db, user)


@router.post("/auth/logout")
def logout(response: Response) -> dict[str, bool]:
    clear_session(response)
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    return me_view(db, user)


# ------------------------------------------------------- kata sandi ---
class PasswordIn(BaseModel):
    lama: str = ""
    baru: str


@router.post("/me/password")
def change_password(body: PasswordIn, response: Response, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Ganti kata sandi. Akun khusus Google boleh membuat kata sandi pertama tanpa kata sandi lama.
    Semua sesi lain keluar (pw_changed_at); sesi ini diterbitkan ulang."""
    if user.password_hash and not verify_password(body.lama, user.password_hash):
        raise HTTPException(422, {"fields": {"lama": "Kata sandi lama belum cocok."}})
    if (p := password_problem(body.baru, user.email)):
        raise HTTPException(422, {"fields": {"baru": p}})
    user.password_hash = hash_password(body.baru)
    user.pw_changed_at = now()
    audit.record(db, user, "password.change", user)
    db.commit()
    issue_session(response, user)
    return {"ok": True}


class LupaIn(BaseModel):
    email: str = Field(max_length=200)


LUPA_OK = {"ok": True, "pesan": "Kalau emailnya terdaftar, link buat atur ulang kata sandi udah dikirim. Cek juga folder spam."}
RESET_MINUTES = 30


def _token_hash(t: str) -> str:
    return hashlib.sha256(t.encode()).hexdigest()


@router.post("/auth/lupa")
def forgot(body: LupaIn, request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Selalu jawab sama, terdaftar atau tidak, supaya orang tidak bisa mengecek email mana yang terdaftar."""
    email = body.email.strip().lower()
    if "@" not in email or not guard.allow_lupa(db, email, guard.client_ip(request)):
        db.commit()
        return LUPA_OK
    user = db.scalar(select(User).where(func.lower(User.email) == email))
    base = settings.public_url.rstrip("/") or str(request.base_url).rstrip("/")
    if user is not None and not user.password_hash:
        mailer.send(user.email, "Masuk ke Orvella", f"Halo {user.name},\n\nAkunmu di Orvella masuk lewat Google, jadi gak punya kata sandi. "
                    f"Buka {base}/masuk lalu pilih Masuk dengan Google.\n\nKalau kamu gak minta ini, abaikan aja email ini.")
    elif user is not None:
        token = secrets.token_urlsafe(32)
        db.add(PasswordReset(user_id=user.id, token_hash=_token_hash(token), expires_at=now() + timedelta(minutes=RESET_MINUTES)))
        mailer.send(user.email, "Atur ulang kata sandi Orvella", f"Halo {user.name},\n\nBuka link ini buat bikin kata sandi baru "
                    f"(berlaku {RESET_MINUTES} menit, sekali pakai):\n{base}/reset-sandi/{token}\n\nKalau kamu gak minta ini, abaikan aja. Kata sandimu gak berubah.")
    db.commit()
    return LUPA_OK


class ResetIn(BaseModel):
    token: str = Field(max_length=200)
    baru: str


@router.post("/auth/reset")
def reset_password(body: ResetIn, db: Session = Depends(get_db)) -> dict[str, Any]:
    r = db.scalar(select(PasswordReset).where(PasswordReset.token_hash == _token_hash(body.token)))
    exp = r.expires_at if r is not None and r.expires_at.tzinfo else (r.expires_at.replace(tzinfo=now().tzinfo) if r is not None else None)
    if r is None or r.used_at is not None or exp < now():
        raise HTTPException(410, "Link ini udah kedaluwarsa atau udah dipakai. Minta link baru ya.")
    user = db.get(User, r.user_id)
    if user is None:
        raise HTTPException(410, "Link ini udah gak berlaku.")
    if (p := password_problem(body.baru, user.email)):
        raise HTTPException(422, {"fields": {"baru": p}})
    user.password_hash = hash_password(body.baru)
    user.pw_changed_at = now()  # semua sesi lama keluar
    r.used_at = now()
    guard.clear_login(db, user.email.lower())
    audit.record(db, None, "password.reset", user)
    db.commit()
    return {"ok": True}


class MeUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    daily_goal_min: Literal[5, 10, 20, 30] | None = None
    prefs: dict[str, Any] | None = None


@router.patch("/me")
def update_me(body: MeUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    if body.name is not None and body.name.strip():
        user.name = body.name.strip()
    if body.daily_goal_min is not None:
        user.daily_goal_min = body.daily_goal_min
    if body.prefs is not None:
        allowed = {k: v for k, v in body.prefs.items() if k in DEFAULT_PREFS}
        too_long = [k for k, v in allowed.items() if len(json.dumps(v, default=str)) > PREF_LIMITS.get(k, 500)]
        if too_long:
            raise HTTPException(422, {"fields": {"prefs": f"Isi \"{too_long[0]}\" terlalu panjang."}, "keys": too_long})
        user.prefs = {**DEFAULT_PREFS, **(user.prefs or {}), **allowed}
    db.commit()
    return me_view(db, user)


class DeleteIn(BaseModel):
    confirm: str


@router.delete("/me")
def delete_me(body: DeleteIn, response: Response, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, bool]:
    if body.confirm.strip().lower() != user.email.lower():
        raise HTTPException(422, {"fields": {"confirm": "Ketik email akunmu untuk konfirmasi."}})
    if user.role != "learner":
        raise HTTPException(403, "Akun staf dihapus lewat admin.")
    db.delete(user)
    db.commit()
    clear_session(response)
    return {"ok": True}


class OnboardingIn(BaseModel):
    goal: Literal["sekolah", "karier", "bikin", "penasaran"]
    placement: Literal["a", "b", "c"]  # a = "x bernilai 8" (knows basics) · b = wrong · c = never seen code
    daily_goal_min: Literal[5, 10, 20, 30]


@router.post("/onboarding")
def onboarding(body: OnboardingIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    path = db.scalar(select(Path).order_by(Path.id))
    chapters = [c for c in learning.path_chapters(db, path.id) if c.kind == "chapter"] if path else []
    user.goal = body.goal
    user.daily_goal_min = body.daily_goal_min
    start = chapters[0] if chapters else None
    skipped = None
    if body.placement == "a" and len(chapters) > 1 and chapters[1].version:
        skipped = chapters[0]
        learning.mark_chapter_skipped(db, user, skipped)
        start = chapters[1]
    if start and start.version:
        learning.ensure_progress(db, user, start)
    user.onboarded = True
    activity.record_activity(db, user, 0)
    db.commit()
    return {
        "start": learning.chapter_ref(start) if start else None,
        "skipped": learning.chapter_ref(skipped) if skipped else None,
        "me": me_view(db, user),
    }


@router.get("/onboarding/preview")
def onboarding_preview(placement: Literal["a", "b", "c"], db: Session = Depends(get_db),
                       user: User = Depends(current_user)) -> dict[str, Any]:
    """Tells the last onboarding step where the learner will start."""
    path = db.scalar(select(Path).order_by(Path.id))
    chapters = [c for c in learning.path_chapters(db, path.id) if c.kind == "chapter"] if path else []
    if placement == "a" and len(chapters) > 1 and chapters[1].version:
        return {"start": learning.chapter_ref(chapters[1]), "skipped": learning.chapter_ref(chapters[0])}
    return {"start": learning.chapter_ref(chapters[0]) if chapters else None, "skipped": None}


def first_chapter(db: Session) -> Chapter | None:
    return db.scalar(select(Chapter).where(Chapter.kind == "chapter").order_by(Chapter.position))
