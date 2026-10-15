"""Set someone's role from the server, including "superadmin" (which the API never hands out).

    python scripts/set_role.py <email> <role> [--name "Nama"] [--password-stdin]

Roles: learner | mentor | admin | superadmin.
- The email already exists: its role (and name, when given) is changed. Progress and data stay.
- The email is new: a Google-only account is created (no password). The first "Masuk dengan Google"
  with that verified email links to it (routers/google.py find_or_create).
- --password-stdin: also set a password read from standard input. Meant for throwaway test accounts;
  the password never appears in the command line or the output.

Prints only id, email, name and role.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import func, select  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.models import Klass, User  # noqa: E402
from app.routers.auth import DEFAULT_PREFS  # noqa: E402
from app.security import hash_password  # noqa: E402
from app.services import audit  # noqa: E402

ROLES = ("learner", "mentor", "admin", "superadmin")


def main() -> int:
    ap = argparse.ArgumentParser(description="Set a user's role (also superadmin).")
    ap.add_argument("email")
    ap.add_argument("role", choices=ROLES)
    ap.add_argument("--name", default="")
    ap.add_argument("--password-stdin", action="store_true", help="read a password from stdin (test accounts only)")
    a = ap.parse_args()
    email = a.email.strip().lower()
    if "@" not in email:
        print("Email tidak valid.", file=sys.stderr)
        return 2
    password = sys.stdin.readline().rstrip("\n") if a.password_stdin else ""
    if a.password_stdin and not password:
        print("Password dari stdin kosong.", file=sys.stderr)
        return 2
    with SessionLocal() as db:
        u = db.scalar(select(User).where(func.lower(User.email) == email))
        made = u is None
        before = None if made else u.role
        if made:
            klass = db.scalar(select(Klass).order_by(Klass.id))
            u = User(email=email, name=a.name.strip() or email.split("@")[0], password_hash=None, role=a.role,
                     org_id=klass.org_id if klass else None, prefs=dict(DEFAULT_PREFS))
            db.add(u)
        u.role = a.role
        if a.name.strip():
            u.name = a.name.strip()[:120]
        if a.role != "learner":
            u.onboarded = True
        if password:
            u.password_hash = hash_password(password)
        db.flush()
        if before != a.role:
            audit.record(db, None, "server.role", u, **{"from": before, "to": a.role})
        db.commit()
        print(f"{'dibuat' if made else 'diubah'}: id={u.id} email={u.email} nama={u.name} role={u.role}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
