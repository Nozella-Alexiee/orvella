"""Log aktivitas admin & keamanan (tabel admin_events), dibaca superadmin di /admin/log.

record() dipanggil di transaksi yang sama dengan perubahannya, jadi log dan perubahan selalu ikut tersimpan atau batal bersama.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import AdminEvent, User

ROLE = {"learner": "Siswa", "mentor": "Mentor", "admin": "Admin", "superadmin": "Superadmin"}


def record(db: Session, actor: User | None, action: str, target: User | int | None = None, **detail: Any) -> None:
    tid = target.id if isinstance(target, User) else target
    db.add(AdminEvent(actor_id=actor.id if actor else None, action=action, target_id=tid, detail=detail))


def _ai(v: Any) -> str:
    return "bawaan" if v is None else "tanpa batas" if v == -1 else f"{v} pertanyaan"


def sentence(e: AdminEvent, actor: str, target: str) -> str:
    d = e.detail or {}
    a = e.action
    if a == "user.create":
        return f"{actor} membuat akun {target} sebagai {ROLE.get(d.get('role'), d.get('role'))}"
    if a == "user.role":
        return f"{actor} mengubah peran {target}: {ROLE.get(d.get('from'), d.get('from'))} → {ROLE.get(d.get('to'), d.get('to'))}"
    if a == "user.class":
        return f"{actor} memindahkan {target} ke kelas {d.get('to') or '–'}"
    if a == "user.ai_limit":
        return f"{actor} mengubah batas Orvi AI {target}: {_ai(d.get('from'))} → {_ai(d.get('to'))}"
    if a == "ai.settings":
        return f"{actor} mengubah batas Orvi AI bawaan jadi {d.get('limit')} pertanyaan per {d.get('window_hours')} jam"
    if a == "class.create":
        return f"{actor} membuat kelas {d.get('name')}"
    if a == "runtime.update":
        return f"{actor} mengubah setelan runtime kode"
    if a == "os.settings":
        return f"{actor} mengubah setelan Orvella OS ({', '.join(d.get('keys', []))})"
    if a == "server.role":
        return f"Server mengubah peran {target}: {ROLE.get(d.get('from'), d.get('from') or 'akun baru')} → {ROLE.get(d.get('to'), d.get('to'))}"
    if a == "login.locked":
        return f"Masuk ke {d.get('email')} dikunci sementara setelah {d.get('fails')} kali salah kata sandi"
    if a == "password.reset":
        return f"{target} mengatur ulang kata sandi lewat link email"
    if a == "password.change":
        return f"{target} mengganti kata sandi"
    return f"{actor}: {a}"


def page(db: Session, before: int | None = None, limit: int = 50) -> dict[str, Any]:
    stmt = select(AdminEvent).order_by(AdminEvent.id.desc()).limit(limit + 1)
    if before:
        stmt = stmt.where(AdminEvent.id < before)
    rows = list(db.scalars(stmt))
    more = len(rows) > limit
    rows = rows[:limit]
    ids = {r.actor_id for r in rows if r.actor_id} | {r.target_id for r in rows if r.target_id}
    names = {u.id: u.name for u in db.scalars(select(User).where(User.id.in_(ids)))} if ids else {}
    items = []
    for r in rows:
        actor = names.get(r.actor_id, "Akun terhapus") if r.actor_id else "Server"
        target = names.get(r.target_id, "akun terhapus") if r.target_id else ""
        items.append({"id": r.id, "at": r.at.isoformat() if r.at else None, "action": r.action, "actor": actor, "text": sentence(r, actor, target)})
    return {"items": items, "more": more}
