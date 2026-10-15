"""Pengaman masuk, ganti/lupa/reset kata sandi, sesi lama keluar, log aktivitas admin, dan kelas sendiri."""
import re
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select

from app.main import app
from app.models import AdminEvent, LoginAttempt, PasswordReset, User
from app.security import hash_password
from app.services import guard, mailer

from .conftest import PASSWORD, login

ADMIN = "sekar@smksig.sch.id"
SUPER = "super-keamanan@contoh.id"


@pytest.fixture(autouse=True)
def _bersih(db):
    """Catatan percobaan dari IP "testclient" dipakai bareng semua tes: bersihkan sebelum & sesudah."""
    db.execute(delete(LoginAttempt)); db.commit()
    yield
    db.execute(delete(LoginAttempt)); db.commit()


@pytest.fixture()
def outbox(monkeypatch):
    sent = []
    monkeypatch.setattr(mailer, "send", lambda to, subject, text: sent.append({"to": to, "subject": subject, "text": text}))
    return sent


def _learner(client) -> str:
    email = f"aman-{uuid.uuid4().hex[:6]}@contoh.id"
    r = client.post("/api/auth/register", json={"name": "Aman", "email": email, "password": "rahasia-awal-1"})
    assert r.status_code == 200, r.text
    return email


def _super(db) -> User:
    u = db.scalar(select(User).where(User.email == SUPER))
    if u is None:
        u = User(email=SUPER, name="Super Keamanan", password_hash=hash_password(PASSWORD), role="superadmin", onboarded=True, prefs={})
        db.add(u); db.commit()
    return u


def test_password_rules(client):
    r = client.post("/api/auth/register", json={"name": "A", "email": f"p-{uuid.uuid4().hex[:6]}@contoh.id", "password": "pendek"})
    assert r.status_code == 422 and r.json()["detail"]["fields"]["password"] == "Minimal 8 karakter."
    email = f"p-{uuid.uuid4().hex[:6]}@contoh.id"
    r = client.post("/api/auth/register", json={"name": "A", "email": email, "password": email})
    assert r.json()["detail"]["fields"]["password"] == "Jangan pakai email sebagai kata sandi."
    login(client, ADMIN)
    r = client.post("/api/admin/users", json={"name": "M", "email": "m-pendek@contoh.id", "password": "123", "role": "mentor"})
    assert r.status_code == 422


def test_login_lockout_per_email(client, db):
    email = _learner(client)
    client.cookies.clear()
    for _ in range(guard.PER_EMAIL):
        assert client.post("/api/auth/login", json={"email": email, "password": "salah-terus"}).status_code == 401
    # kata sandi benar pun ditolak selama dikunci
    r = client.post("/api/auth/login", json={"email": email, "password": "rahasia-awal-1"})
    assert r.status_code == 429 and "Terlalu banyak percobaan" in r.json()["detail"]["fields"]["password"]
    assert db.scalar(select(func.count()).select_from(AdminEvent).where(AdminEvent.action == "login.locked")) >= 1
    db.execute(delete(LoginAttempt)); db.commit()
    assert client.post("/api/auth/login", json={"email": email, "password": "rahasia-awal-1"}).status_code == 200


def test_login_success_clears_failures(client, db):
    email = _learner(client)
    client.cookies.clear()
    for _ in range(guard.PER_EMAIL - 1):
        client.post("/api/auth/login", json={"email": email, "password": "salah"})
    assert client.post("/api/auth/login", json={"email": email, "password": "rahasia-awal-1"}).status_code == 200
    assert db.scalar(select(func.count()).select_from(LoginAttempt).where(LoginAttempt.email == email)) == 0


def test_login_lockout_per_ip(client):
    for i in range(guard.PER_IP):
        client.post("/api/auth/login", json={"email": f"acak-{i}@contoh.id", "password": "salah"})
    r = client.post("/api/auth/login", json={"email": "orang-lain@contoh.id", "password": "salah"})
    assert r.status_code == 429


def test_change_password_logs_out_other_sessions(client):
    email = _learner(client)
    other = TestClient(app)
    assert other.post("/api/auth/login", json={"email": email, "password": "rahasia-awal-1"}).status_code == 200
    assert other.get("/api/me").status_code == 200
    assert client.post("/api/me/password", json={"lama": "salah", "baru": "rahasia-baru-22"}).status_code == 422
    assert client.post("/api/me/password", json={"lama": "rahasia-awal-1", "baru": "pendek"}).status_code == 422
    assert client.post("/api/me/password", json={"lama": "rahasia-awal-1", "baru": "rahasia-baru-22"}).json()["ok"] is True
    assert client.get("/api/me").status_code == 200   # sesi ini diterbitkan ulang
    assert other.get("/api/me").status_code == 401    # sesi lain keluar
    client.cookies.clear()
    assert client.post("/api/auth/login", json={"email": email, "password": "rahasia-awal-1"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": email, "password": "rahasia-baru-22"}).status_code == 200


def test_google_only_account_can_set_first_password(client, db):
    email = f"g-{uuid.uuid4().hex[:6]}@gmail.com"
    u = User(email=email, name="Gugel", password_hash=None, google_sub=f"sub-{uuid.uuid4().hex[:8]}", role="learner", onboarded=True, prefs={})
    db.add(u); db.commit()
    from app.security import issue_session
    from fastapi import Response
    resp = Response(); issue_session(resp, u)
    client.cookies.set("orvella_session", resp.headers["set-cookie"].split("=", 1)[1].split(";", 1)[0])
    assert client.post("/api/me/password", json={"baru": "sandi-pertama-1"}).json()["ok"] is True
    client.cookies.clear()
    assert client.post("/api/auth/login", json={"email": email, "password": "sandi-pertama-1"}).status_code == 200


def test_forgot_and_reset(client, db, outbox):
    email = _learner(client)
    keep = TestClient(app)
    keep.post("/api/auth/login", json={"email": email, "password": "rahasia-awal-1"})
    client.cookies.clear()
    same = client.post("/api/auth/lupa", json={"email": "gak-ada@contoh.id"}).json()
    got = client.post("/api/auth/lupa", json={"email": email}).json()
    assert same == got  # jawabannya sama, terdaftar atau tidak
    assert len(outbox) == 1 and outbox[0]["to"] == email
    token = re.search(r"/reset-sandi/(\S+)", outbox[0]["text"]).group(1)
    assert db.scalar(select(PasswordReset).where(PasswordReset.token_hash != token)) is not None  # yang disimpan cuma hash
    assert client.post("/api/auth/reset", json={"token": token, "baru": "pendek"}).status_code == 422
    assert client.post("/api/auth/reset", json={"token": "token-ngawur", "baru": "rahasia-reset-3"}).status_code == 410
    assert client.post("/api/auth/reset", json={"token": token, "baru": "rahasia-reset-3"}).json()["ok"] is True
    assert client.post("/api/auth/reset", json={"token": token, "baru": "rahasia-reset-4"}).status_code == 410  # sekali pakai
    assert keep.get("/api/me").status_code == 401  # sesi lama keluar
    assert client.post("/api/auth/login", json={"email": email, "password": "rahasia-reset-3"}).status_code == 200


def test_forgot_rate_limit_and_google_only(client, db, outbox):
    email = _learner(client)
    client.cookies.clear()
    for _ in range(guard.LUPA_PER_EMAIL + 2):
        client.post("/api/auth/lupa", json={"email": email})
    assert len(outbox) == guard.LUPA_PER_EMAIL
    g = f"g2-{uuid.uuid4().hex[:6]}@gmail.com"
    db.add(User(email=g, name="Gugel", password_hash=None, google_sub=f"sub-{uuid.uuid4().hex[:8]}", role="learner", prefs={})); db.commit()
    client.post("/api/auth/lupa", json={"email": g})
    assert "lewat Google" in outbox[-1]["text"] and "/reset-sandi/" not in outbox[-1]["text"]


def test_activity_log(client, db):
    sup = _super(db)
    login(client, ADMIN)
    assert client.get("/api/admin/log").status_code == 403  # admin biasa gak bisa lihat
    lid = db.scalar(select(User.id).where(User.role == "learner").order_by(User.id))
    login(client, SUPER)
    client.patch(f"/api/admin/users/{lid}", json={"role": "mentor"})
    client.patch(f"/api/admin/users/{lid}", json={"role": "learner"})
    client.put("/api/admin/ai", json={"limit": 31, "window_hours": 5})
    client.put("/api/admin/ai", json={"limit": 30, "window_hours": 5})
    log = client.get("/api/admin/log").json()
    texts = [i["text"] for i in log["items"]]
    assert any("mengubah peran" in t and "Siswa → Mentor" in t for t in texts)
    assert any("batas Orvi AI bawaan jadi 31" in t for t in texts)
    assert all(i["actor"] for i in log["items"])
    older = client.get(f"/api/admin/log?sebelum={log['items'][0]['id']}").json()
    assert all(i["id"] < log["items"][0]["id"] for i in older["items"])
    assert sup.id


def test_own_class_can_change_but_not_own_role(client, db):
    login(client, ADMIN)
    me = client.get("/api/me").json()
    classes = client.get("/api/admin/users").json()["classes"]
    assert client.patch(f"/api/admin/users/{me['id']}", json={"class_id": classes[0]["id"]}).status_code == 200
    assert client.patch(f"/api/admin/users/{me['id']}", json={"role": "mentor"}).status_code == 409
    row = next(i for i in client.get("/api/admin/users").json()["items"] if i["id"] == me["id"])
    assert row["self"] is True
