"""Superadmin: admin plus ngatur admin lain dan batas Orvi AI; role-nya tidak bisa diberikan lewat API."""
import subprocess
import sys
from pathlib import Path

from sqlalchemy import select

from app.models import User
from app.security import hash_password
from app.services import ai_quota

from .conftest import PASSWORD, login

ADMIN, MENTOR = "sekar@smksig.sch.id", "dimas@smksig.sch.id"
SUPER = "super-uji@contoh.id"


def _super(db) -> User:
    u = db.scalar(select(User).where(User.email == SUPER))
    if u is None:
        u = User(email=SUPER, name="Super Uji", password_hash=hash_password(PASSWORD), role="superadmin", onboarded=True, prefs={})
        db.add(u)
        db.commit()
    return u


def _uid(db, email: str) -> int:
    return db.scalar(select(User.id).where(User.email == email))


def test_superadmin_passes_admin_guards(client, db):
    _super(db)
    login(client, SUPER)
    assert client.get("/api/admin/overview").status_code == 200
    me = client.get("/api/me").json()
    assert me["role"] == "superadmin" and me["ai"]["unlimited"] is True and me["ai"]["limit"] is None


def test_admin_manages_learners_and_mentors_only(client, db):
    login(client, ADMIN)
    r = client.post("/api/admin/users", json={"name": "Admin Baru", "email": "adm-baru@contoh.id", "password": "x" * 12, "role": "admin"})
    assert r.status_code == 403
    r = client.post("/api/admin/users", json={"name": "Mentor Baru", "email": "mtr-baru@contoh.id", "password": "x" * 12, "role": "mentor"})
    assert r.status_code == 200
    mid = r.json()["id"]
    assert client.patch(f"/api/admin/users/{mid}", json={"role": "admin"}).status_code == 403
    lst = client.get("/api/admin/users").json()
    assert lst["me"]["assignable"] == ["learner", "mentor"]
    sekar = next(i for i in lst["items"] if i["id"] == _uid(db, ADMIN))
    assert sekar["editable"] is False  # admin tidak bisa ngubah admin (termasuk dirinya)


def test_superadmin_manages_admins(client, db):
    _super(db)
    login(client, SUPER)
    r = client.post("/api/admin/users", json={"name": "Admin Kedua", "email": "adm-dua@contoh.id", "password": "x" * 12, "role": "admin"})
    assert r.status_code == 200
    aid = r.json()["id"]
    assert client.patch(f"/api/admin/users/{aid}", json={"role": "mentor"}).json()["role"] == "mentor"
    assert client.get("/api/admin/users").json()["me"]["assignable"] == ["learner", "mentor", "admin"]


def test_superadmin_role_cannot_be_given_or_changed_by_api(client, db):
    sup = _super(db)
    login(client, SUPER)
    r = client.post("/api/admin/users", json={"name": "S", "email": "s2@contoh.id", "password": "x" * 12, "role": "superadmin"})
    assert r.status_code == 422
    lid = _uid(db, MENTOR)
    assert client.patch(f"/api/admin/users/{lid}", json={"role": "superadmin"}).status_code == 422
    assert client.patch(f"/api/admin/users/{sup.id}", json={"role": "admin"}).status_code == 409  # dirinya sendiri juga gak bisa
    login(client, ADMIN)
    assert client.patch(f"/api/admin/users/{sup.id}", json={"role": "learner"}).status_code == 403


def test_ai_limits(client, db):
    sup = _super(db)
    lid = db.scalar(select(User.id).where(User.role == "learner").order_by(User.id))
    # admin biasa cuma bisa baca
    login(client, ADMIN)
    got = client.get("/api/admin/ai").json()
    assert got["limit"] == 30 and got["window_hours"] == 5 and got["editable"] is False
    assert client.put("/api/admin/ai", json={"limit": 50, "window_hours": 5}).status_code == 403
    assert client.patch(f"/api/admin/users/{lid}", json={"ai_limit": 5}).status_code == 403
    # superadmin bisa ubah bawaan dan batas per orang
    login(client, SUPER)
    assert client.put("/api/admin/ai", json={"limit": 5000, "window_hours": 5}).status_code == 422
    assert client.put("/api/admin/ai", json={"limit": 40, "window_hours": 0}).status_code == 422
    assert client.put("/api/admin/ai", json={"limit": 40, "window_hours": 3}).json()["limit"] == 40
    assert client.patch(f"/api/admin/users/{lid}", json={"ai_limit": -5}).status_code == 422
    assert client.patch(f"/api/admin/users/{lid}", json={"ai_limit": 10}).json()["ai_effective"] == 10
    assert client.patch(f"/api/admin/users/{lid}", json={"ai_limit": -1}).json()["ai_effective"] is None
    assert client.patch(f"/api/admin/users/{lid}", json={"ai_default": True}).json()["ai_effective"] == 40
    db.expire_all()
    assert ai_quota.limit_for(db, db.get(User, sup.id)) is None  # superadmin selalu tanpa batas
    assert ai_quota.limit_for(db, db.get(User, lid)) == 40
    client.put("/api/admin/ai", json={"limit": 30, "window_hours": 5})  # kembalikan bawaan untuk tes lain


def test_set_role_script_never_prints_password(db):
    root = Path(__file__).resolve().parent.parent
    run = subprocess.run([sys.executable, "scripts/set_role.py", "skrip-uji@contoh.id", "mentor", "--name", "Skrip Uji", "--password-stdin"],
                         cwd=root, input="rahasia-banget-123\n", capture_output=True, text=True, timeout=60)
    assert run.returncode == 0, run.stderr
    assert "rahasia" not in run.stdout + run.stderr and "role=mentor" in run.stdout
    db.expire_all()
    u = db.scalar(select(User).where(User.email == "skrip-uji@contoh.id"))
    assert u is not None and u.role == "mentor" and u.password_hash
