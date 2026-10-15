"""Masuk dengan Google: OAuth 2.0 Authorization Code + PKCE, sepenuhnya di server.

/api/auth/google/start membuat state, nonce, dan code_verifier (disimpan di cookie bertanda tangan 10 menit), lalu
mengarahkan ke Google. /api/auth/google/callback menukar code dengan token, memverifikasi id_token lewat JWKS Google
(aud, iss, exp, nonce), lalu mencari/menautkan/membuat akun dan memberi sesi Orvella biasa.
"""
from __future__ import annotations

import base64
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Klass, User
from ..security import issue_session
from .auth import DEFAULT_PREFS

router = APIRouter(prefix="/api/auth", tags=["google"])

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
ISSUERS = ["https://accounts.google.com", "accounts.google.com"]
COOKIE = "orvella_oauth"
COOKIE_PATH = "/api/auth/google"
FLOW_MINUTES = 10

_jwks: jwt.PyJWKClient | None = None


class GoogleError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def enabled() -> bool:
    return bool(settings.google_client_id and settings.google_client_secret)


def redirect_uri(request: Request) -> str:
    base = settings.public_url.rstrip("/") or str(request.base_url).rstrip("/")
    return f"{base}/api/auth/google/callback"


def safe_next(nxt: str | None) -> str:
    """Hanya path lokal ("/..."), bukan "//host" atau "/\\host" yang bisa dipakai untuk open redirect."""
    if not nxt or not nxt.startswith("/") or nxt.startswith("//") or nxt.startswith("/\\") or any(c in nxt for c in "\r\n"):
        return ""
    return nxt


def home_for(user: User) -> str:
    if user.role == "learner" and not user.onboarded:
        return "/mulai/tujuan"
    return "/beranda"  # semua peran mendarat di desktop; halaman Admin/Mentor dibuka dari menu Orvella


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


# ------------------------------------------------------------ bagian Google ---
def _exchange_code(code: str, uri: str, verifier: str) -> dict[str, Any]:
    try:
        r = httpx.post(TOKEN_URL, data={"code": code, "client_id": settings.google_client_id, "client_secret": settings.google_client_secret,
                                        "redirect_uri": uri, "grant_type": "authorization_code", "code_verifier": verifier}, timeout=10)
    except httpx.HTTPError as e:
        raise GoogleError("google-token") from e
    if r.status_code != 200:
        raise GoogleError("google-token")
    return r.json()


def _signing_key(token: str) -> Any:
    global _jwks
    if _jwks is None:
        _jwks = jwt.PyJWKClient(JWKS_URL, cache_keys=True, lifespan=3600)
    try:
        return _jwks.get_signing_key_from_jwt(token).key
    except jwt.PyJWTError as e:
        raise GoogleError("google-token") from e


def verify_id_token(token: str, nonce: str) -> dict[str, Any]:
    try:
        claims = jwt.decode(token, _signing_key(token), algorithms=["RS256"], audience=settings.google_client_id, issuer=ISSUERS,
                            options={"require": ["exp", "iat", "sub", "aud", "iss"]}, leeway=30)
    except jwt.PyJWTError as e:
        raise GoogleError("google-token") from e
    if not secrets.compare_digest(str(claims.get("nonce", "")), nonce):
        raise GoogleError("google-token")
    return claims


def find_or_create(db: Session, claims: dict[str, Any]) -> tuple[User, bool]:
    """Cari lewat google_sub, lalu tautkan ke email yang sama (hanya kalau Google sudah memverifikasinya), atau buat akun baru."""
    sub = str(claims["sub"])
    user = db.scalar(select(User).where(User.google_sub == sub))
    if user:
        return user, False
    email = str(claims.get("email") or "").strip().lower()
    verified = claims.get("email_verified") in (True, "true")
    if not email:
        raise GoogleError("google-email")
    existing = db.scalar(select(User).where(func.lower(User.email) == email))
    if existing:
        if not verified:
            raise GoogleError("google-email")
        existing.google_sub = sub
        return existing, False
    if not verified:
        raise GoogleError("google-email")
    name = str(claims.get("given_name") or claims.get("name") or email.split("@")[0]).strip()[:120] or "Teman"
    klass = db.scalar(select(Klass).order_by(Klass.id))  # sama dengan daftar lewat email: masuk kelas pertama
    user = User(email=email, name=name, password_hash=None, google_sub=sub, role="learner",
                org_id=klass.org_id if klass else None, class_id=klass.id if klass else None, prefs=dict(DEFAULT_PREFS))
    db.add(user)
    return user, True


# ------------------------------------------------------------------- rute ---
@router.get("/providers")
def providers() -> dict[str, bool]:
    return {"google": enabled()}


def _fail(code: str) -> RedirectResponse:
    r = RedirectResponse(f"/masuk?galat={code}", status_code=302)
    r.delete_cookie(COOKIE, path=COOKIE_PATH)
    return r


@router.get("/google/start")
def google_start(request: Request, next: str = "") -> RedirectResponse:  # noqa: A002
    if not enabled():
        return _fail("google-nonaktif")
    state, nonce, verifier = secrets.token_urlsafe(24), secrets.token_urlsafe(24), secrets.token_urlsafe(48)
    challenge = _b64(hashlib.sha256(verifier.encode()).digest())
    flow = jwt.encode({"state": state, "nonce": nonce, "v": verifier, "next": safe_next(next),
                       "exp": datetime.now(timezone.utc) + timedelta(minutes=FLOW_MINUTES)}, settings.secret_key, algorithm="HS256")
    params = {"client_id": settings.google_client_id, "redirect_uri": redirect_uri(request), "response_type": "code",
              "scope": "openid email profile", "state": state, "nonce": nonce, "code_challenge": challenge,
              "code_challenge_method": "S256", "prompt": "select_account", "access_type": "online"}
    r = RedirectResponse(f"{AUTH_URL}?{urlencode(params)}", status_code=302)
    r.set_cookie(COOKIE, flow, max_age=FLOW_MINUTES * 60, httponly=True, samesite="lax", secure=settings.cookie_secure, path=COOKIE_PATH)
    return r


@router.get("/google/callback")
def google_callback(request: Request, code: str = "", state: str = "", error: str = "", db: Session = Depends(get_db)) -> RedirectResponse:
    if not enabled():
        return _fail("google-nonaktif")
    if error:
        return _fail("google-batal" if error == "access_denied" else "google-token")
    try:
        flow = jwt.decode(request.cookies.get(COOKIE, ""), settings.secret_key, algorithms=["HS256"])
    except jwt.PyJWTError:
        return _fail("google-state")
    if not code or not state or not secrets.compare_digest(state, str(flow.get("state", ""))):
        return _fail("google-state")
    try:
        tokens = _exchange_code(code, redirect_uri(request), str(flow["v"]))
        claims = verify_id_token(str(tokens.get("id_token", "")), str(flow["nonce"]))
        user, _new = find_or_create(db, claims)
    except GoogleError as e:
        db.rollback()
        return _fail(e.code)
    db.commit()
    r = RedirectResponse(safe_next(flow.get("next")) or home_for(user), status_code=302)
    if user.role == "learner" and not user.onboarded:
        r.headers["location"] = "/mulai/tujuan"
    issue_session(r, user)
    r.delete_cookie(COOKIE, path=COOKIE_PATH)
    return r
