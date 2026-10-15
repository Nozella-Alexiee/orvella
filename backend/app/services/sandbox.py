"""Sandbox projects (Orvella OS): free-form projects stored as Notebook rows of kind
`program` or `web`, plus snapshots, replay chunks, gallery visibility and stars.

Program projects hold several flat files; the runner always writes the entry under the
language's fixed name (main.py, Main.java, …) and compiles only that file for C/C++/Go.
"""
from __future__ import annotations

import difflib
import json
import re
import zlib
from datetime import date, datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import AppSetting, Klass, Notebook, NotebookMember, NotebookReplay, NotebookSnapshot, NotebookStar, User, now
from ..security import is_admin
from . import activity, runner

ENTRY = {"python": "main.py", "javascript": "main.js", "php": "main.php", "c": "main.c", "cpp": "main.cpp", "rust": "main.rs",
         "go": "main.go", "java": "Main.java", "kotlin": "main.kt", "sql": "main.sql"}
WEB_PATH = re.compile(r"^(?!/)(?!.*\.\.)(?!.*//)[A-Za-z0-9_][A-Za-z0-9_./-]{0,119}$")
FLAT_NAME = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$")
MAX_FILES_WEB, MAX_FILES_PROGRAM, MAX_BYTES = 40, 20, 300_000
MAX_SNAPSHOTS = 50
MAX_CHUNK_BYTES, MAX_REPLAY_BYTES = 256_000, 5_000_000
KINDS = ("program", "web")


# ------------------------------------------------------------------ files ---
def program_parts(nb: Notebook) -> tuple[str, dict[str, str], str]:
    """(entry, files, stdin) for a program project; older rows stored {code, stdin}."""
    f = nb.files or {}
    entry = ENTRY.get(nb.lang or "", "main.txt")
    if isinstance(f.get("files"), dict):
        files = {str(k): str(v) for k, v in f["files"].items()}
        return str(f.get("entry") or entry), files or {entry: ""}, str(f.get("stdin", ""))
    return entry, {entry: str(f.get("code", ""))}, str(f.get("stdin", ""))


def files_of(nb: Notebook) -> dict[str, str]:
    if nb.kind == "web":
        return dict((nb.files or {}).get("files", {}))
    return program_parts(nb)[1]


def clean_files(kind: str, files: dict[str, Any]) -> dict[str, str]:
    limit, pattern = (MAX_FILES_WEB, WEB_PATH) if kind == "web" else (MAX_FILES_PROGRAM, FLAT_NAME)
    if len(files) > limit:
        raise HTTPException(400, f"Maksimal {limit} berkas per proyek.")
    out: dict[str, str] = {}
    for path, body in files.items():
        path = str(path).strip()
        if not pattern.match(path) or ".." in path:
            raise HTTPException(400, f"Nama berkas tidak valid: {path}")
        out[path] = str(body)
    if sum(len(v) for v in out.values()) > MAX_BYTES:
        raise HTTPException(413, "Proyek terlalu besar (maksimal 300 KB kode).")
    return out


def set_files(nb: Notebook, files: dict[str, str], stdin: str | None = None) -> None:
    # berkas berubah di luar room ngoding bareng: riwayat Yjs lama tidak lagi cocok (room membuat yang baru)
    nb.ystate = None
    nb.ygen = None
    if nb.kind == "web":
        nb.files = {**(nb.files or {}), "files": files}
        return
    entry, _, old_stdin = program_parts(nb)
    if entry not in files:
        raise HTTPException(400, f"Berkas utama {entry} tidak boleh dihapus atau diganti nama.")
    nb.files = {"entry": entry, "files": files, "stdin": (old_stdin if stdin is None else stdin)[:8000], "code": files[entry]}


# ------------------------------------------------------------- permission ---
def setting(db: Session, key: str, default: dict[str, Any]) -> dict[str, Any]:
    row = db.get(AppSetting, key)
    return {**default, **(row.value if row and row.value else {})}


def put_setting(db: Session, key: str, value: dict[str, Any]) -> None:
    row = db.get(AppSetting, key)
    if row is None:
        db.add(AppSetting(key=key, value=value))
    else:
        row.value = value
        row.updated_at = now()


def gallery_public(db: Session) -> bool:
    return bool(setting(db, "gallery", {"public": False})["public"])


def _mentor_of(db: Session, owner: User | None, user: User) -> bool:
    if owner is None or not owner.class_id or user.role != "mentor":
        return False
    k = db.get(Klass, owner.class_id)
    return bool(k and k.mentor_id == user.id)


# proyek yang sedang disiarkan live ke kelas: {notebook_id: owner_id} (diisi services/kolab.py, satu proses)
LIVE: dict[int, int] = {}


def member_role(db: Session, user: User, nb: Notebook) -> str | None:
    return db.scalar(select(NotebookMember.role).where(NotebookMember.notebook_id == nb.id, NotebookMember.user_id == user.id))


def can_view(db: Session, user: User, nb: Notebook) -> bool:
    if nb.user_id == user.id or is_admin(user):
        return True
    owner = db.get(User, nb.user_id)
    if _mentor_of(db, owner, user) or member_role(db, user, nb):
        return True
    if LIVE.get(nb.id) == nb.user_id and owner and owner.class_id and owner.class_id == user.class_id:
        return True
    if nb.published_at is None or nb.visibility == "private":
        return False
    if nb.visibility == "public" and gallery_public(db):
        return True
    return bool(owner and owner.class_id and owner.class_id == user.class_id)


def can_see_replay(db: Session, user: User, nb: Notebook) -> bool:
    if nb.user_id == user.id or is_admin(user) or _mentor_of(db, db.get(User, nb.user_id), user):
        return True
    return nb.share_replay and can_view(db, user, nb)


def access(db: Session, user: User, nb: Notebook) -> str | None:
    """owner | edit | view | None. edit/view dari undangan ngoding bareng; view juga untuk mentor, admin, Galeri, dan siaran."""
    if nb.user_id == user.id:
        return "owner"
    role = member_role(db, user, nb)
    if role in ("edit", "view"):
        return role
    return "view" if can_view(db, user, nb) else None


def get_project(db: Session, user: User, nid: int, edit: bool = False, collab: bool = False) -> Notebook:
    """edit=True: hanya pemilik (hapus, terbitkan, ubah nama). collab=True: pemilik atau teman yang boleh mengedit."""
    nb = db.get(Notebook, nid)
    if nb is None or nb.kind not in KINDS:
        raise HTTPException(404, "Proyek tidak ditemukan.")
    a = access(db, user, nb)
    if a is None:
        raise HTTPException(404, "Proyek tidak ditemukan.")
    if edit and a != "owner":
        raise HTTPException(403, "Hanya pemilik yang bisa mengubah proyek ini. Remix dulu untuk mencobanya.")
    if collab and a not in ("owner", "edit"):
        raise HTTPException(403, "Kamu hanya bisa melihat proyek ini. Minta pemiliknya memberi izin edit.")
    return nb


# ------------------------------------------------------------------ views ---
def _initials(name: str) -> str:
    parts = [p for p in name.split() if p]
    return (parts[0][0] + (parts[1][0] if len(parts) > 1 else parts[0][1:2])).upper() if parts else "?"


def owner_view(db: Session, uid: int) -> dict[str, Any]:
    u = db.get(User, uid)
    k = db.get(Klass, u.class_id) if u and u.class_id else None
    return {"id": uid, "name": u.name if u else "?", "initials": _initials(u.name) if u else "?", "class": k.name if k else None}


def starred(db: Session, user: User, nid: int) -> bool:
    return db.get(NotebookStar, (user.id, nid)) is not None


def card(db: Session, user: User, nb: Notebook, with_preview: bool = False) -> dict[str, Any]:
    from ..views import ago, iso
    out = {"id": nb.id, "title": nb.title, "description": nb.description or "", "kind": nb.kind, "lang": nb.lang,
           "stack": (nb.files or {}).get("stack") if nb.kind == "web" else None, "visibility": nb.visibility or "private",
           "published": iso(nb.published_at), "stars": nb.star_count or 0, "starred": starred(db, user, nb.id),
           "updated": ago(nb.updated_at), "owner": owner_view(db, nb.user_id), "mine": nb.user_id == user.id}
    if with_preview and nb.kind == "web" and (nb.files or {}).get("stack") == "static":
        files = files_of(nb)
        if sum(len(v) for v in files.values()) <= 60_000:
            out["preview"] = files
    return out


def project_view(db: Session, user: User, nb: Notebook) -> dict[str, Any]:
    base = card(db, user, nb)
    if nb.kind == "web":
        extra = {"files": files_of(nb), "entry": None, "stdin": ""}
    else:
        entry, files, stdin = program_parts(nb)
        extra = {"files": files, "entry": entry, "stdin": stdin}
    remix = db.get(Notebook, nb.remix_of_id) if nb.remix_of_id else None
    a = access(db, user, nb)
    return {**base, **extra, "rev": nb.rev or 0, "can_edit": a in ("owner", "edit"), "access": a, "live": LIVE.get(nb.id) == nb.user_id,
            "share_replay": bool(nb.share_replay),
            "replay": can_see_replay(db, user, nb),
            "remix_of": {"id": remix.id, "title": remix.title, "owner": owner_view(db, remix.user_id)} if remix else None}


# -------------------------------------------------------------- snapshots ---
def _diff_stats(a: dict[str, str], b: dict[str, str]) -> dict[str, int]:
    add = rem = 0
    for f in set(a) | set(b):
        for line in difflib.ndiff(a.get(f, "").splitlines(), b.get(f, "").splitlines()):
            if line.startswith("+ "):
                add += 1
            elif line.startswith("- "):
                rem += 1
    return {"add": add, "del": rem}


def last_snapshot(db: Session, nb: Notebook) -> NotebookSnapshot | None:
    return db.scalar(select(NotebookSnapshot).where(NotebookSnapshot.notebook_id == nb.id).order_by(NotebookSnapshot.id.desc()).limit(1))


def take_snapshot(db: Session, nb: Notebook, label: str = "", auto: bool = False, force: bool = False) -> NotebookSnapshot | None:
    files = files_of(nb)
    prev = last_snapshot(db, nb)
    if prev is not None and prev.files == files and not force:
        return None
    snap = NotebookSnapshot(notebook_id=nb.id, label=(label or ("Otomatis" if auto else "Snapshot"))[:120], files=files,
                            stats=_diff_stats(prev.files if prev else {}, files), auto=auto)
    db.add(snap)
    db.flush()
    # simpan paling banyak 50: yang otomatis dibuang lebih dulu
    ids = db.scalars(select(NotebookSnapshot.id).where(NotebookSnapshot.notebook_id == nb.id).order_by(NotebookSnapshot.auto.desc(), NotebookSnapshot.id)).all()
    for sid in ids[: max(0, len(ids) - MAX_SNAPSHOTS)]:
        db.delete(db.get(NotebookSnapshot, sid))
    return snap


def snapshot_view(s: NotebookSnapshot) -> dict[str, Any]:
    from ..views import ago, iso
    return {"id": s.id, "label": s.label, "stats": s.stats or {}, "auto": s.auto, "at": iso(s.created_at), "ago": ago(s.created_at)}


# ----------------------------------------------------------------- replay ---
def replay_bytes(db: Session, nb: Notebook) -> int:
    return int(db.scalar(select(func.coalesce(func.sum(func.length(NotebookReplay.data)), 0)).where(NotebookReplay.notebook_id == nb.id)) or 0)


def pack(events: list[Any]) -> bytes:
    return zlib.compress(json.dumps(events, separators=(",", ":")).encode(), 6)


def unpack(data: bytes) -> list[Any]:
    return json.loads(zlib.decompress(data).decode())


# ----------------------------------------------------------------- quests ---
def bump_quest(user: User, key: str, n: int = 1) -> None:
    """Daily counters (runs, remix, publish) kept in user.prefs["quest"]; reset each local day."""
    today = activity.local_today().isoformat()
    prefs = dict(user.prefs or {})
    q = dict(prefs.get("quest") or {})
    if q.get("day") != today:
        q = {"day": today, "claimed": []}
    q[key] = int(q.get(key, 0)) + n
    prefs["quest"] = q
    user.prefs = prefs


def quest_state(db: Session, user: User) -> dict[str, Any]:
    from ..models import XpEvent
    today = activity.local_today()
    q = dict((user.prefs or {}).get("quest") or {})
    if q.get("day") != today.isoformat():
        q = {"day": today.isoformat(), "claimed": []}
    start = datetime.combine(today, datetime.min.time(), activity.LOCAL_TZ)
    phases = db.scalar(select(func.count()).select_from(XpEvent).where(XpEvent.user_id == user.id, XpEvent.created_at >= start,
                                                                      XpEvent.amount > 0, XpEvent.reason != "Quest harian")) or 0
    items = [
        {"id": "run", "icon": "play", "title": "Jalankan 3 program di Sandbox", "n": min(3, int(q.get("runs", 0))), "of": 3, "xp": 30},
        {"id": "learn", "icon": "zap", "title": "Selesaikan 1 kegiatan belajar", "n": min(1, int(phases)), "of": 1, "xp": 40},
        {"id": "share", "icon": "git-fork", "title": "Terbitkan atau remix 1 proyek", "n": min(1, int(q.get("remix", 0)) + int(q.get("publish", 0))), "of": 1, "xp": 25},
    ]
    for it in items:
        it["claimed"] = it["id"] in (q.get("claimed") or [])
    return {"day": q["day"], "items": items}


def claim_quests(db: Session, user: User) -> int:
    st = quest_state(db, user)
    ready = [i for i in st["items"] if i["n"] >= i["of"] and not i["claimed"]]
    if not ready:
        return 0
    xp = sum(i["xp"] for i in ready)
    activity.add_xp(db, user, xp, "Quest harian")
    prefs = dict(user.prefs or {})
    q = dict(prefs.get("quest") or {"day": st["day"]})
    q["day"] = st["day"]
    q["claimed"] = list(q.get("claimed") or []) + [i["id"] for i in ready]
    prefs["quest"] = q
    user.prefs = prefs
    return xp


def today() -> date:
    return activity.local_today()


def run_program(db: Session, user: User, nb: Notebook, stdin: str | None) -> dict[str, Any]:
    from ..services import runtime
    entry, files, saved_stdin = program_parts(nb)
    lang = nb.lang or ""
    if lang not in runner.LANG_IDS:
        raise HTTPException(400, "Bahasa ini tidak dijalankan di server.")
    enabled, timeout, memory = runtime.limits(db, lang)
    if not enabled:
        raise HTTPException(409, "Bahasa ini sedang dinonaktifkan oleh admin.")
    rest = {k: v for k, v in files.items() if k != entry}
    try:
        runner.check_rate(user.id)
        return runner.execute(lang, files.get(entry, ""), saved_stdin if stdin is None else stdin, timeout=timeout, memory=memory, files=rest or None)
    except runner.RateLimited as e:
        raise HTTPException(429, str(e)) from e
    except runner.RunnerRejected as e:
        raise HTTPException(400, str(e)) from e
    except runner.RunnerUnavailable as e:
        raise HTTPException(503, str(e)) from e
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
