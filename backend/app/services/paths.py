"""Who may see and edit which learning path.

* public paths are in everyone's catalog (only admins make a path public)
* class paths are visible to learners of the listed classes and to their mentors
* draft paths are visible to their owner only
* a class's main path (Klass.path_id) is always visible to that class
Admins see and edit everything; mentors edit the paths they own.
"""
from __future__ import annotations

import re

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Chapter, Klass, Path, User
from ..security import is_admin


def mentor_class_ids(db: Session, user: User) -> set[int]:
    if is_admin(user):
        return set(db.scalars(select(Klass.id)))
    if user.role == "mentor":
        return set(db.scalars(select(Klass.id).where(Klass.mentor_id == user.id)))
    return set()


def can_view(db: Session, user: User, path: Path) -> bool:
    if is_admin(user) or path.owner_id == user.id or path.visibility == "public":
        return True
    classes = set(path.class_ids or [])
    if user.class_id:
        klass = db.get(Klass, user.class_id)
        if klass and klass.path_id == path.id:
            return True
        if path.visibility == "class" and user.class_id in classes:
            return True
    if user.role == "mentor" and path.visibility == "class" and classes & mentor_class_ids(db, user):
        return True
    return False


def can_edit(user: User, path: Path) -> bool:
    return is_admin(user) or (user.role == "mentor" and path.owner_id == user.id)


def visible(db: Session, user: User) -> list[Path]:
    return [p for p in db.scalars(select(Path).order_by(Path.id)) if can_view(db, user, p)]


def require_view(db: Session, user: User, path: Path | None) -> Path:
    if path is None or not can_view(db, user, path):
        raise HTTPException(404, "Jalur tidak ditemukan.")
    return path


def require_edit(user: User, path: Path | None) -> Path:
    if path is None:
        raise HTTPException(404, "Jalur tidak ditemukan.")
    if not can_edit(user, path):
        raise HTTPException(403, "Kamu hanya bisa mengubah jalur milikmu sendiri.")
    return path


def require_chapter_edit(db: Session, user: User, chapter_id: int) -> Chapter:
    ch = db.get(Chapter, chapter_id)
    if ch is None:
        raise HTTPException(404, "Bab tidak ditemukan.")
    require_edit(user, db.get(Path, ch.path_id))
    return ch


def current(db: Session, user: User) -> Path:
    """The path Beranda and /peta follow: the learner's last pick, else the class path, else the first public one."""
    slug = (user.prefs or {}).get("path")
    if slug:
        p = db.scalar(select(Path).where(Path.slug == slug))
        if p and can_view(db, user, p):
            return p
    klass = db.get(Klass, user.class_id) if user.class_id else None
    if klass and klass.path_id:
        p = db.get(Path, klass.path_id)
        if p:
            return p
    p = db.scalar(select(Path).where(Path.visibility == "public").order_by(Path.id)) or db.scalar(select(Path).order_by(Path.id))
    if p is None:
        raise HTTPException(404, "Belum ada jalur belajar.")
    return p


def slugify(db: Session, title: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:48] or "jalur"
    slug, n = base, 2
    while db.scalar(select(Path).where(Path.slug == slug)):
        slug, n = f"{base}-{n}", n + 1
    return slug
