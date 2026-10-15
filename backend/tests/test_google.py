"""Masuk dengan Google: token endpoint dan JWKS Google dipalsukan dengan kunci RSA lokal."""
import time
import uuid
from urllib.parse import parse_qs, urlparse

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import settings
from app.models import User
from app.routers import google

KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture()
def gg(monkeypatch):
    """Google aktif, dengan id_token yang bisa diatur per tes."""
    monkeypatch.setattr(settings, "google_client_id", "cid.apps.googleusercontent.com")
    monkeypatch.setattr(settings, "google_client_secret", "rahasia")
    seen: dict = {"claims": {}, "exchanged": []}

    def exchange(code, uri, verifier):
        seen["exchanged"].append((code, uri, verifier))
        return {"id_token": seen["token"](seen["nonce"])}

    monkeypatch.setattr(google, "_exchange_code", exchange)
    monkeypatch.setattr(google, "_signing_key", lambda token: KEY.public_key())
    return seen


def id_token(nonce: str, **over) -> str:
    now = int(time.time())
    claims = {"iss": "https://accounts.google.com", "aud": "cid.apps.googleusercontent.com", "sub": uuid.uuid4().hex, "email": f"g-{uuid.uuid4().hex[:6]}@gmail.com",
              "email_verified": True, "name": "Gita Ayu", "given_name": "Gita", "iat": now, "exp": now + 600, "nonce": nonce, **over}
    return jwt.encode(claims, KEY, algorithm="RS256", headers={"kid": "uji"})


def start(c: TestClient, gg: dict, nxt: str = "") -> str:
    r = c.get("/api/auth/google/start" + (f"?next={nxt}" if nxt else ""), follow_redirects=False)
    assert r.status_code == 302
    q = parse_qs(urlparse(r.headers["location"]).query)
    flow = jwt.decode(c.cookies.get("orvella_oauth"), settings.secret_key, algorithms=["HS256"])
    gg["nonce"] = flow["nonce"]
    return q["state"][0]


def callback(c: TestClient, state: str, code: str = "kode"):
    return c.get(f"/api/auth/google/callback?code={code}&state={state}", follow_redirects=False)


def test_providers(client, monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "")
    assert client.get("/api/auth/providers").json() == {"google": False}
    r = client.get("/api/auth/google/start", follow_redirects=False)
    assert r.headers["location"] == "/masuk?galat=google-nonaktif"
    monkeypatch.setattr(settings, "google_client_id", "x")
    monkeypatch.setattr(settings, "google_client_secret", "y")
    assert client.get("/api/auth/providers").json() == {"google": True}


def test_start_uses_pkce_and_signed_cookie(client, gg):
    r = client.get("/api/auth/google/start?next=/sandbox", follow_redirects=False)
    loc = urlparse(r.headers["location"])
    q = {k: v[0] for k, v in parse_qs(loc.query).items()}
    assert loc.netloc == "accounts.google.com"
    assert q["code_challenge_method"] == "S256" and q["scope"] == "openid email profile" and q["prompt"] == "select_account"
    assert q["redirect_uri"] == "http://testserver/api/auth/google/callback"
    flow = jwt.decode(client.cookies.get("orvella_oauth"), settings.secret_key, algorithms=["HS256"])
    assert flow["state"] == q["state"] and flow["nonce"] == q["nonce"] and flow["next"] == "/sandbox"
    assert google._b64(__import__("hashlib").sha256(flow["v"].encode()).digest()) == q["code_challenge"]


def test_new_user_goes_to_onboarding(client, gg, db):
    email = f"baru-{uuid.uuid4().hex[:6]}@gmail.com"
    gg["token"] = lambda n: id_token(n, email=email, sub="sub-baru-" + email)
    r = callback(client, start(client, gg))
    assert r.status_code == 302 and r.headers["location"] == "/mulai/tujuan"
    me = client.get("/api/me").json()
    assert me["email"] == email and me["name"] == "Gita" and not me["onboarded"]
    u = db.scalar(select(User).where(User.email == email))
    assert u.password_hash is None and u.google_sub == "sub-baru-" + email and u.class_id
    assert gg["exchanged"][0][1] == "http://testserver/api/auth/google/callback"
    assert client.cookies.get("orvella_oauth") is None  # alur sekali pakai
    # akun khusus Google tidak bisa masuk dengan kata sandi
    r = client.post("/api/auth/login", json={"email": email, "password": "apa-saja"})
    assert r.status_code == 401 and "Google" in r.json()["detail"]["fields"]["password"]
    # masuk lagi lewat Google: akun yang sama
    client.cookies.clear()
    r = callback(client, start(client, gg))
    assert client.get("/api/me").json()["email"] == email


def test_links_verified_email_and_respects_next(client, gg, db):
    email = f"lama-{uuid.uuid4().hex[:6]}@gmail.com"
    client.post("/api/auth/register", json={"name": "Lama", "email": email, "password": "sandi-lama"})
    client.post("/api/onboarding", json={"goal": "penasaran", "placement": "c", "daily_goal_min": 10})
    client.cookies.clear()
    gg["token"] = lambda n: id_token(n, email=email.upper(), sub="sub-lama")
    r = callback(client, start(client, gg, "/sandbox"))
    assert r.headers["location"] == "/sandbox"
    u = db.scalar(select(User).where(User.email == email))
    assert u.google_sub == "sub-lama"
    assert client.post("/api/auth/login", json={"email": email, "password": "sandi-lama"}).status_code == 200  # sandi lama tetap jalan


def test_unverified_email_is_not_linked(client, gg, db):
    email = f"clash-{uuid.uuid4().hex[:6]}@gmail.com"
    client.post("/api/auth/register", json={"name": "Clash", "email": email, "password": "rahasia-123"})
    client.cookies.clear()
    gg["token"] = lambda n: id_token(n, email=email, email_verified=False, sub="sub-clash")
    r = callback(client, start(client, gg))
    assert r.headers["location"] == "/masuk?galat=google-email"
    assert db.scalar(select(User).where(User.email == email)).google_sub is None
    assert client.get("/api/me").status_code == 401


@pytest.mark.parametrize("over", [{"aud": "orang-lain"}, {"iss": "https://evil.example"}, {"nonce": "salah"}, {"exp": int(time.time()) - 3600}])
def test_bad_id_token(client, gg, over):
    gg["token"] = lambda n: id_token(**{"nonce": n, **over})
    r = callback(client, start(client, gg))
    assert r.headers["location"] == "/masuk?galat=google-token"
    assert client.get("/api/me").status_code == 401


def test_state_must_match_cookie(client, gg):
    gg["token"] = lambda n: id_token(n)
    start(client, gg)
    assert callback(client, "state-palsu").headers["location"] == "/masuk?galat=google-state"
    client.cookies.clear()
    assert callback(client, "apa-saja").headers["location"] == "/masuk?galat=google-state"
    assert not gg["exchanged"]  # code tidak pernah ditukar


def test_cancelled_and_open_redirect(client, gg):
    r = client.get("/api/auth/google/callback?error=access_denied", follow_redirects=False)
    assert r.headers["location"] == "/masuk?galat=google-batal"
    for bad in ("//evil.example/x", "/\\evil.example", "https://evil.example", "javascript:alert(1)"):
        assert google.safe_next(bad) == ""
    assert google.safe_next("/galeri?tab=kelas") == "/galeri?tab=kelas"
