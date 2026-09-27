"""Studio Materi: mentors and admins build learning paths in any language.

Mentors create and edit their own paths and publish them straight to their classes;
only admins put a path in the public catalog. Chapter drafts are edited through the
Builder endpoints in admin.py (which check the same ownership).
"""
from __future__ import annotations

import html
import json
import re
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Chapter, ChapterProgress, Klass, Path, User, now
from ..security import current_user, require_role
from ..services import content as content_svc, learning, paths as paths_svc, quickquiz, runner
from ..views import ago

router = APIRouter(prefix="/api/studio", tags=["studio"])
staff = require_role("admin", "mentor")

LANGS = ("python", "javascript", "html", "c", "cpp", "rust", "java", "go", "kotlin", "php", "sql", "css")
LEVELS = ("Pemula", "Menengah", "Mahir")


def _summary(content: dict[str, Any]) -> str:
    c = content_svc.phase_counts(content)
    parts = [f"{c['scenes']} scene", f"{c['items']} soal", f"{c['bank']} kuis"]
    if content.get("challenge"):
        parts.append("challenge")
    return " · ".join(parts)


def _classes(db: Session, me: User) -> list[dict[str, Any]]:
    ids = paths_svc.mentor_class_ids(db, me)
    rows = db.scalars(select(Klass).where(Klass.id.in_(ids)).order_by(Klass.name)) if ids else []
    return [{"id": k.id, "name": k.name, "learners": db.scalar(select(func.count()).select_from(User).where(User.class_id == k.id, User.role == "learner")) or 0}
            for k in rows]


def _path_card(db: Session, p: Path) -> dict[str, Any]:
    chapters = [c for c in learning.path_chapters(db, p.id) if c.kind == "chapter"]
    owner = db.get(User, p.owner_id) if p.owner_id else None
    learners = db.scalar(select(func.count(func.distinct(ChapterProgress.user_id))).where(
        ChapterProgress.chapter_id.in_([c.id for c in chapters]))) if chapters else 0
    return {"id": p.id, "slug": p.slug, "title": p.title, "description": p.description, "language": p.language, "level": p.level,
            "visibility": p.visibility, "class_ids": p.class_ids or [], "owner": owner.name if owner else "Tim Orvella",
            "chapters": len(chapters), "published": sum(1 for c in chapters if c.version), "learners": learners or 0,
            "updated": ago(max((c.updated_at for c in chapters), default=p.created_at or now()))}


@router.get("/overview")
def overview(me: User = Depends(staff), db: Session = Depends(get_db)) -> dict[str, Any]:
    mine = [p for p in db.scalars(select(Path).order_by(Path.id)) if paths_svc.can_edit(me, p)]
    return {"paths": [_path_card(db, p) for p in mine], "classes": _classes(db, me), "admin": me.role == "admin",
            "langs": list(LANGS), "levels": list(LEVELS)}


class PathIn(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    language: str
    level: str = "Pemula"
    description: str = Field(default="", max_length=2000)


@router.post("/paths")
def create_path(body: PathIn, me: User = Depends(staff), db: Session = Depends(get_db)) -> dict[str, Any]:
    if body.language not in LANGS:
        raise HTTPException(400, "Bahasa tidak dikenal.")
    p = Path(slug=paths_svc.slugify(db, body.title), title=body.title.strip(), description=body.description.strip(),
             language=body.language, level=body.level if body.level in LEVELS else "Pemula", owner_id=me.id,
             visibility="draft", class_ids=[])
    db.add(p)
    db.commit()
    return _path_card(db, p)


@router.get("/paths/{pid}")
def path_detail(pid: int, me: User = Depends(staff), db: Session = Depends(get_db)) -> dict[str, Any]:
    p = paths_svc.require_edit(me, db.get(Path, pid))
    chapters = []
    for c in learning.path_chapters(db, p.id):
        if c.kind != "chapter":
            continue
        chapters.append({"id": c.id, "number": c.number, "title": c.title, "subtitle": c.subtitle, "icon": c.icon, "status": c.status,
                         "version": c.version, "summary": _summary(c.draft or {}), "problems": len(_problems(c.draft or {})),
                         "updated": ago(c.updated_at)})
    others = [{"id": o.id, "title": o.title, "language": o.language} for o in db.scalars(select(Path).order_by(Path.id))
              if o.id != p.id and paths_svc.can_edit(me, o)]
    return {"path": _path_card(db, p), "chapters": chapters, "classes": _classes(db, me), "admin": me.role == "admin", "others": others}


def _problems(draft: dict[str, Any]) -> list[str]:
    from .admin import validate
    return validate(draft)


class PathPatch(BaseModel):
    title: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    level: str | None = None
    visibility: str | None = Field(default=None, pattern="^(draft|class|public)$")
    class_ids: list[int] | None = None


@router.patch("/paths/{pid}")
def update_path(pid: int, body: PathPatch, me: User = Depends(staff), db: Session = Depends(get_db)) -> dict[str, Any]:
    p = paths_svc.require_edit(me, db.get(Path, pid))
    if body.title is not None and body.title.strip():
        p.title = body.title.strip()
    if body.description is not None:
        p.description = body.description.strip()
    if body.level in LEVELS:
        p.level = body.level
    before = set(p.class_ids or []) if p.visibility == "class" else set()
    if body.class_ids is not None:
        allowed = paths_svc.mentor_class_ids(db, me)
        bad = set(body.class_ids) - allowed
        if bad:
            raise HTTPException(403, "Kamu hanya bisa menerbitkan ke kelas yang kamu ajar.")
        p.class_ids = sorted(set(body.class_ids))
    if body.visibility is not None:
        if body.visibility == "public" and me.role != "admin":
            raise HTTPException(403, "Hanya admin yang bisa memasukkan jalur ke katalog umum.")
        if body.visibility == "class" and not p.class_ids:
            raise HTTPException(422, "Pilih minimal satu kelas.")
        p.visibility = body.visibility
    # learners of newly added classes hear about it
    if p.visibility == "class":
        published = [c for c in learning.path_chapters(db, p.id) if c.version]
        for cid in set(p.class_ids or []) - before:
            if not published:
                break
            for u in db.scalars(select(User).where(User.class_id == cid, User.role == "learner")):
                learning.notify(db, u.id, "path", f"Materi baru: {p.title}", f"{me.name} menerbitkan jalur ini untuk kelasmu.", "/jalur")
    db.commit()
    return _path_card(db, p)


class ChapterIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    subtitle: str = Field(default="", max_length=160)
    icon: str = "box"


def _new_chapter(db: Session, p: Path, me: User, title: str, subtitle: str, icon: str, draft: dict[str, Any]) -> Chapter:
    last = db.scalar(select(func.max(Chapter.position)).where(Chapter.path_id == p.id)) or 0
    num = (db.scalar(select(func.max(Chapter.number)).where(Chapter.path_id == p.id, Chapter.kind == "chapter")) or 0) + 1
    base = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:48] or f"bab-{num}"
    slug, n = base, 2
    while db.scalar(select(Chapter).where(Chapter.path_id == p.id, Chapter.slug == slug)):
        slug, n = f"{base}-{n}", n + 1
    ch = Chapter(path_id=p.id, position=last + 1, number=num, kind="chapter", slug=slug, title=title.strip(), subtitle=subtitle,
                 icon=icon, map_x=36 if num % 2 else 64, status="draft", version=0, draft=draft, updated_by=me.id)
    db.add(ch)
    db.flush()
    return ch


@router.post("/paths/{pid}/chapters")
def create_chapter(pid: int, body: ChapterIn, me: User = Depends(staff), db: Session = Depends(get_db)) -> dict[str, Any]:
    p = paths_svc.require_edit(me, db.get(Path, pid))
    draft = content_svc.empty_content()
    draft["language"] = p.language
    ch = _new_chapter(db, p, me, body.title, body.subtitle, body.icon, draft)
    db.commit()
    return {"id": ch.id}


class OrderIn(BaseModel):
    ids: list[int]


@router.post("/paths/{pid}/order")
def reorder(pid: int, body: OrderIn, me: User = Depends(staff), db: Session = Depends(get_db)) -> dict[str, bool]:
    p = paths_svc.require_edit(me, db.get(Path, pid))
    chapters = {c.id: c for c in learning.path_chapters(db, p.id) if c.kind == "chapter"}
    if set(body.ids) != set(chapters):
        raise HTTPException(422, "Urutan harus memuat semua bab.")
    for i, cid in enumerate(body.ids, 1):
        chapters[cid].position = i
        chapters[cid].number = i
        chapters[cid].map_x = 36 if i % 2 else 64
    db.commit()
    return {"ok": True}


class CopyIn(BaseModel):
    path_id: int


@router.post("/chapters/{cid}/copy")
def copy_chapter(cid: int, body: CopyIn, me: User = Depends(staff), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Copies a chapter (its draft) into another path, e.g. the same lesson for another language."""
    src = db.get(Chapter, cid)
    if src is None:
        raise HTTPException(404, "Bab tidak ditemukan.")
    paths_svc.require_view(db, me, db.get(Path, src.path_id))
    dst = paths_svc.require_edit(me, db.get(Path, body.path_id))
    draft = content_svc.clone(src.draft or content_svc.empty_content())
    draft["language"] = dst.language
    ch = _new_chapter(db, dst, me, src.title, src.subtitle, src.icon, draft)
    ch.description = src.description
    db.commit()
    return {"id": ch.id, "path_id": dst.id}


@router.delete("/chapters/{cid}")
def delete_chapter(cid: int, me: User = Depends(staff), db: Session = Depends(get_db)) -> dict[str, bool]:
    ch = paths_svc.require_chapter_edit(db, me, cid)
    if ch.version and me.role != "admin":
        raise HTTPException(409, "Bab yang sudah terbit tidak bisa dihapus. Ubah isinya lalu terbitkan versi baru.")
    if db.scalar(select(func.count()).select_from(ChapterProgress).where(ChapterProgress.chapter_id == ch.id)):
        raise HTTPException(409, "Sudah ada siswa yang membuka bab ini.")
    db.delete(ch)
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------- helpers
class ParseIn(BaseModel):
    text: str = Field(max_length=200_000)
    format: str = Field(default="text", pattern="^(text|csv)$")


@router.post("/quiz/parse")
def parse_quiz(body: ParseIn, me: User = Depends(staff)) -> dict[str, Any]:
    return quickquiz.parse_csv(body.text) if body.format == "csv" else quickquiz.parse_text(body.text)


_YT = re.compile(r"^[A-Za-z0-9_-]{11}$")


def youtube_id(url: str) -> tuple[str | None, int]:
    """Video id and start second from any common YouTube link (watch, youtu.be, shorts, embed, live)."""
    url = url.strip()
    if _YT.match(url):
        return url, 0
    try:
        u = urlparse(url if "://" in url else "https://" + url)
    except ValueError:
        return None, 0
    host = (u.hostname or "").lower().removeprefix("www.").removeprefix("m.")
    q = parse_qs(u.query)
    vid = None
    if host == "youtu.be":
        vid = u.path.strip("/").split("/")[0]
    elif host in ("youtube.com", "music.youtube.com", "youtube-nocookie.com"):
        if u.path == "/watch":
            vid = (q.get("v") or [None])[0]
        else:
            m = re.match(r"^/(?:shorts|embed|live|v)/([^/?#]+)", u.path)
            vid = m.group(1) if m else None
    start = 0
    t = (q.get("t") or q.get("start") or ["0"])[0]
    m = re.match(r"^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$", t)
    if m:
        start = int(m.group(1) or 0) * 3600 + int(m.group(2) or 0) * 60 + int(m.group(3) or 0)
    return (vid if vid and _YT.match(vid) else None), start


@router.get("/oembed")
def oembed(url: str, me: User = Depends(staff)) -> dict[str, Any]:
    vid, start = youtube_id(url)
    if not vid:
        raise HTTPException(422, "Tautan YouTube tidak dikenali. Contoh: https://youtu.be/abcdEFGhijk")
    title, author = "", ""
    try:
        r = httpx.get("https://www.youtube.com/oembed", params={"url": f"https://www.youtube.com/watch?v={vid}", "format": "json"}, timeout=5)
        if r.status_code == 200:
            d = r.json()
            title, author = d.get("title", ""), d.get("author_name", "")
        elif r.status_code in (401, 403, 404):
            raise HTTPException(422, "Video ini tidak bisa disematkan (privat, dihapus, atau penyematan dimatikan pemiliknya).")
    except httpx.HTTPError:
        pass  # offline server: keep the id, the mentor can type a title
    return {"id": vid, "start": start, "title": title, "author": author, "thumb": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"}


class SolutionIn(BaseModel):
    language: str
    code: str = Field(max_length=runner.MAX_CODE_CHARS)
    tests: list[dict[str, Any]] = Field(default_factory=list, max_length=30)


@router.post("/solution")
def test_solution(body: SolutionIn, me: User = Depends(staff)) -> dict[str, Any]:
    """Runs a reference solution against a challenge's or code item's tests, so the mentor knows the tests are right."""
    if not body.tests:
        raise HTTPException(422, "Tambahkan minimal satu tes.")
    tests = [{**t, "kind": t.get("kind") or "io", "id": str(t.get("id") or i), "hidden": False} for i, t in enumerate(body.tests, 1)]
    res = runner.run_tests(body.language, body.code, tests, me.id, with_output=True)
    return {"results": res["results"], "error": res["error"], "logs": res["logs"]}


class TraceIn(BaseModel):
    code: str = Field(max_length=8000)
    stdin: str = Field(default="", max_length=4000)


@router.post("/trace", include_in_schema=False)
def trace_for_studio(body: TraceIn, me: User = Depends(staff)) -> dict[str, Any]:
    return trace(body.code, body.stdin, me.id)


def trace(code: str, stdin: str, user_id: int) -> dict[str, Any]:
    """Python memory steps (runner/helpers/pytrace.py) for the memory animation."""
    runner.check_rate(user_id)
    res = runner.call("POST", "/run", {"lang": "python-trace", "code": code, "stdin": stdin})
    r = res.get("run") or {}
    if r.get("timeout"):
        return {"steps": [], "error": {"name": "TimeoutError", "message": "Program terlalu lama untuk dianimasikan.", "line": None}}
    try:
        data = json.loads(r.get("stdout") or "")
    except ValueError:
        return {"steps": [], "error": {"name": "Error", "message": html.escape((r.get("stderr") or "Gagal membuat animasi.")[-300:]), "line": None}}
    return data
