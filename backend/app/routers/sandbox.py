"""Mode Sandbox (Orvella OS): free-form projects, snapshots, replay, gallery, stars and remix.

Projects are Notebook rows of kind `program` or `web`, so the runner sessions (sid `p{id}`),
the preview proxy and /api/web/* keep working unchanged.
"""
from __future__ import annotations

from typing import Any

import re

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import delete, insert, select, update
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Notebook, NotebookReplay, NotebookSnapshot, NotebookStar, User, now
from ..security import current_user, require_role
from ..services import activity, badges, runner, stacks
from ..services import sandbox as sb
from ..services.kolab import from_sync, kolab
from ..services import sandbox_zip
from .workspace import STARTERS, run_view

router = APIRouter(prefix="/api", tags=["sandbox"])
admin_only = require_role("admin")


# ------------------------------------------------------------------ projects ---
@router.get("/sandbox")
def my_projects(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    rows = db.scalars(select(Notebook).where(Notebook.user_id == user.id, Notebook.kind.in_(sb.KINDS)).order_by(Notebook.updated_at.desc()))
    return {"items": [sb.card(db, user, nb) for nb in rows], "gallery_public": sb.gallery_public(db)}


class CreateIn(BaseModel):
    title: str | None = Field(default=None, max_length=160)
    kind: str = Field(pattern="^(program|web)$")
    lang: str = "python"
    stack: str = "static"
    files: dict[str, str] | None = None  # impor (seret berkas dari komputer)
    description: str = Field(default="", max_length=600)


@router.post("/sandbox")
def create(body: CreateIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    if body.kind == "web":
        if body.stack not in stacks.STACKS:
            raise HTTPException(400, "Stack tidak dikenal.")
        files = sb.clean_files("web", body.files) if body.files else stacks.template(body.stack)
        nb = Notebook(user_id=user.id, title=(body.title or f"Proyek {stacks.STACKS[body.stack]['name']}")[:160], cells=[], kind="web",
                      lang=body.stack, files={"stack": body.stack, "files": files}, description=body.description)
    else:
        if body.lang not in sb.ENTRY:
            raise HTTPException(400, "Bahasa tidak dikenal.")
        entry = sb.ENTRY[body.lang]
        code, stdin = STARTERS.get(body.lang, ("", ""))
        files = {entry: code}
        if body.files:
            files.update(sb.clean_files("program", body.files))
            files = sb.clean_files("program", files)
        nb = Notebook(user_id=user.id, title=(body.title or f"Program {body.lang} baru")[:160], cells=[], kind="program", lang=body.lang,
                      files={"entry": entry, "files": files, "stdin": stdin, "code": files[entry]}, description=body.description)
    db.add(nb)
    db.flush()
    sb.take_snapshot(db, nb, "Awal proyek", auto=True, force=True)
    activity.record_activity(db, user, 0)
    db.commit()
    return sb.project_view(db, user, nb)


@router.get("/sandbox/{nid}")
def get_project(nid: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    return sb.project_view(db, user, sb.get_project(db, user, nid))


class MetaIn(BaseModel):
    title: str | None = Field(default=None, max_length=160)
    description: str | None = Field(default=None, max_length=600)
    share_replay: bool | None = None


@router.patch("/sandbox/{nid}")
def update_meta(nid: int, body: MetaIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    nb = sb.get_project(db, user, nid, edit=True)
    if body.title is not None:
        nb.title = body.title.strip()[:160] or nb.title
    if body.description is not None:
        nb.description = body.description.strip()
    if body.share_replay is not None:
        nb.share_replay = body.share_replay
    nb.updated_at = now()
    db.commit()
    return sb.project_view(db, user, nb)


@router.delete("/sandbox/{nid}")
def delete_project(nid: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, bool]:
    nb = sb.get_project(db, user, nid, edit=True)
    if nb.kind == "web" and runner.configured():
        try:
            runner.call("DELETE", f"/projects/p{nb.id}")
        except runner.RunnerUnavailable:
            pass
    db.delete(nb)
    db.commit()
    return {"ok": True}


class FilesIn(BaseModel):
    rev: int | None = None
    write: dict[str, str] = Field(default_factory=dict)
    delete: list[str] = Field(default_factory=list)
    rename: dict[str, str] = Field(default_factory=dict)
    stdin: str | None = Field(default=None, max_length=8000)
    running: bool = False


@router.patch("/sandbox/{nid}/files")
def save_files(nid: int, body: FilesIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Saves changed files. A stale `rev` (another tab saved first) returns 409 so nothing is overwritten silently."""
    nb = sb.get_project(db, user, nid, collab=True)
    if kolab.active(nb.id):
        if body.write or body.delete or body.rename:
            raise HTTPException(409, {"code": "kolab", "message": "Proyek ini sedang dibuka untuk ngoding bareng. Menyambung ulang…", "rev": nb.rev})
        if body.stdin is not None and nb.kind == "program":  # input program tidak ada di dokumen bersama
            nb.files = {**(nb.files or {}), "stdin": body.stdin[:8000]}
            db.commit()
        return {"rev": nb.rev, "saved": True, "synced": False, "count": len(sb.files_of(nb))}
    if body.rev is not None and body.rev != (nb.rev or 0):
        raise HTTPException(409, {"code": "stale", "message": "Proyek ini diubah di tempat lain. Muat ulang untuk melihat versi terbaru.", "rev": nb.rev})
    current = sb.files_of(nb)
    for old, new in body.rename.items():
        if old in current:
            current[new] = current.pop(old)
    for p in body.delete:
        current.pop(p, None)
    current.update(body.write)
    current = sb.clean_files(nb.kind, current)
    sb.set_files(nb, current, body.stdin)
    nb.rev = (nb.rev or 0) + 1
    nb.updated_at = now()
    activity.record_activity(db, user, 0)
    db.commit()
    synced = False
    if body.running and nb.kind == "web":
        try:
            runner.call("PUT", f"/sessions/p{nb.id}/files", {"write": {k: current[k] for k in {**body.write, **{v: 1 for v in body.rename.values()}} if k in current},
                                                            "delete": body.delete + list(body.rename)})
            synced = True
        except runner.RunnerUnavailable:
            synced = False
    return {"rev": nb.rev, "saved": True, "synced": synced, "count": len(current)}


class RunIn(BaseModel):
    stdin: str | None = Field(default=None, max_length=8000)


@router.post("/sandbox/{nid}/run")
def run(nid: int, body: RunIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    nb = sb.get_project(db, user, nid, collab=True)
    if nb.kind != "program":
        raise HTTPException(400, "Proyek web dijalankan lewat pratinjau atau server proyek.")
    res = sb.run_program(db, user, nb, body.stdin)
    sb.bump_quest(user, "runs")
    badges.after_run(user, nb.lang or "", bool(res.get("ok")))
    activity.record_activity(db, user, 0)
    new = badges.evaluate(db, user, night=badges.is_night())
    db.commit()
    return {**run_view(res), "lencana_baru": new}


@router.post("/sandbox/{nid}/ran")
def ran(nid: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Web projects run in the browser; the client reports a run so the daily quest counts it."""
    sb.get_project(db, user, nid, collab=True)
    sb.bump_quest(user, "runs")
    badges.mark(user, "web")
    new = badges.evaluate(db, user, night=badges.is_night())
    db.commit()
    return {"ok": True, "lencana_baru": new}


# ------------------------------------------------------------ unduh & impor ---
DB_STACKS = {"node": "sqlite", "flask": "sqlite", "fastapi": "sqlite", "php": "mysql"}


@router.get("/sandbox/{nid}/export")
def export_zip(nid: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    """Proyek sebagai .zip: berkas, orvella.json, dan database.sql (hanya untuk pemilik, kalau ada databasenya)."""
    nb = sb.get_project(db, user, nid)
    if kolab.active(nb.id):  # ketikan terakhir di room ngoding bareng ikut terunduh
        from_sync(kolab.flush_nid, nb.id)
        db.refresh(nb)
    stack = (nb.files or {}).get("stack") if nb.kind == "web" else None
    entry, files, stdin = sb.program_parts(nb) if nb.kind == "program" else (None, sb.files_of(nb), "")
    manifest: dict[str, Any] = {"description": nb.description or "", "kind": nb.kind, "lang": nb.lang if nb.kind == "program" else None,
                                "stack": stack, "entry": entry, "stdin": stdin, "db": None}
    sql = None
    engine = DB_STACKS.get(stack or "")
    if engine and nb.user_id == user.id:
        seed = (nb.files or {}).get("db_seed")
        if isinstance(seed, dict) and seed.get("sql"):
            sql, manifest["db"] = seed["sql"], {"engine": engine, "file": seed.get("file", "")}
        elif runner.configured():
            try:
                r = runner.call("GET", f"/sessions/p{nb.id}/db/dump", params={"engine": engine})
                sql, manifest["db"] = r.get("sql") or None, {"engine": engine, "file": r.get("file", "")}
            except runner.RunnerUnavailable:
                sql = None  # belum ada database, atau runner mati: zip tetap berisi kodenya
    data = sandbox_zip.build(nb.title, manifest, files, sql)
    name = re.sub(r"[^a-z0-9]+", "-", nb.title.lower()).strip("-") or "proyek"
    return Response(data, media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{name}.zip"',
                                                               "X-Orvella-Database": "1" if sql else "0"})


@router.post("/sandbox/import")
async def import_zip(file: UploadFile = File(...), user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    data = await file.read(sandbox_zip.MAX_ZIP + 1)
    p = sandbox_zip.parse(data)
    title = p["title"] or (file.filename or "Proyek impor").rsplit(".", 1)[0][:160]
    if p["kind"] == "web":
        files = sb.clean_files("web", p["files"])
        payload: dict[str, Any] = {"stack": p["stack"], "files": files}
        if p["db_seed"]:
            payload["db_seed"] = p["db_seed"]
        nb = Notebook(user_id=user.id, title=title, cells=[], kind="web", lang=p["stack"], files=payload, description=p["description"])
    else:
        files = sb.clean_files("program", p["files"])
        nb = Notebook(user_id=user.id, title=title, cells=[], kind="program", lang=p["lang"], description=p["description"],
                      files={"entry": p["entry"], "files": files, "stdin": p["stdin"], "code": files[p["entry"]]})
    db.add(nb)
    db.flush()
    sb.take_snapshot(db, nb, "Diimpor dari .zip", auto=True, force=True)
    activity.record_activity(db, user, 0)
    db.commit()
    return {**sb.project_view(db, user, nb), "db_seed": bool(p["db_seed"]), "skipped": p["skipped"]}


# ----------------------------------------------------------------- snapshots ---
class SnapIn(BaseModel):
    label: str = Field(default="", max_length=120)


@router.get("/sandbox/{nid}/snapshots")
def snapshots(nid: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    nb = sb.get_project(db, user, nid, collab=True)
    rows = db.scalars(select(NotebookSnapshot).where(NotebookSnapshot.notebook_id == nb.id).order_by(NotebookSnapshot.id.desc()))
    return {"items": [sb.snapshot_view(s) for s in rows]}


@router.post("/sandbox/{nid}/snapshots")
def snapshot(nid: int, body: SnapIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    nb = sb.get_project(db, user, nid, collab=True)
    if kolab.active(nb.id):  # ketikan terakhir di room belum tentu sudah tersimpan
        from_sync(kolab.flush_nid, nb.id)
        db.refresh(nb)
    snap = sb.take_snapshot(db, nb, body.label or "Snapshot")
    db.commit()
    if snap is None:
        return {"created": False, "message": "Proyek sama persis dengan snapshot terakhir."}
    return {"created": True, "snapshot": sb.snapshot_view(snap)}


def _snap(db: Session, nb: Notebook, sid: int) -> NotebookSnapshot:
    s = db.get(NotebookSnapshot, sid)
    if s is None or s.notebook_id != nb.id:
        raise HTTPException(404, "Snapshot tidak ditemukan.")
    return s


@router.get("/sandbox/{nid}/snapshots/{sid}")
def snapshot_files(nid: int, sid: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    nb = sb.get_project(db, user, nid, collab=True)
    s = _snap(db, nb, sid)
    return {**sb.snapshot_view(s), "files": s.files}


@router.post("/sandbox/{nid}/snapshots/{sid}/restore")
def restore(nid: int, sid: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    nb = sb.get_project(db, user, nid, edit=True)
    s = _snap(db, nb, sid)
    if kolab.active(nb.id):
        from_sync(kolab.flush_nid, nb.id)
        db.refresh(nb)
    sb.take_snapshot(db, nb, "Sebelum dipulihkan", auto=True)
    sb.set_files(nb, dict(s.files))
    nb.rev = (nb.rev or 0) + 1
    nb.updated_at = now()
    db.commit()
    # teman yang sedang ngoding bareng langsung melihat isi yang dipulihkan
    from_sync(kolab.replace_files, nb.id, sb.files_of(nb))
    return sb.project_view(db, user, nb)


# -------------------------------------------------------------------- replay ---
class ReplayIn(BaseModel):
    session: str = Field(pattern=r"^[A-Za-z0-9_-]{4,16}$")
    seq: int = Field(ge=0, le=100_000)
    events: list[Any] = Field(max_length=2000)


@router.post("/sandbox/{nid}/replay")
def replay_append(nid: int, body: ReplayIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    nb = sb.get_project(db, user, nid, edit=True)
    data = sb.pack(body.events)
    if len(data) > sb.MAX_CHUNK_BYTES:
        raise HTTPException(413, "Potongan replay terlalu besar.")
    if sb.replay_bytes(db, nb) + len(data) > sb.MAX_REPLAY_BYTES:
        return {"stored": False, "reason": "full"}
    exists = db.scalar(select(NotebookReplay.id).where(NotebookReplay.notebook_id == nb.id, NotebookReplay.session == body.session, NotebookReplay.seq == body.seq))
    if exists:
        return {"stored": True, "duplicate": True}
    base = None
    if body.seq == 0:
        snap = sb.take_snapshot(db, nb, "Awal sesi replay", auto=True, force=True)
        base = snap.id if snap else None
    db.add(NotebookReplay(notebook_id=nb.id, session=body.session, seq=body.seq, base_snapshot_id=base, data=data, n_events=len(body.events)))
    db.commit()
    return {"stored": True}


@router.get("/sandbox/{nid}/replay")
def replay_sessions(nid: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    nb = sb.get_project(db, user, nid)
    if not sb.can_see_replay(db, user, nb):
        raise HTTPException(403, "Replay proyek ini tidak dibagikan.")
    rows = db.execute(select(NotebookReplay.session, NotebookReplay.n_events, NotebookReplay.created_at).where(NotebookReplay.notebook_id == nb.id)
                      .order_by(NotebookReplay.id)).all()
    from ..views import ago, iso
    out: dict[str, dict[str, Any]] = {}
    for sess, n, at in rows:
        d = out.setdefault(sess, {"session": sess, "events": 0, "started": iso(at), "ago": ago(at)})
        d["events"] += n
    return {"items": list(reversed(list(out.values())))}


@router.get("/sandbox/{nid}/replay/{session}")
def replay_get(nid: int, session: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    nb = sb.get_project(db, user, nid)
    if not sb.can_see_replay(db, user, nb):
        raise HTTPException(403, "Replay proyek ini tidak dibagikan.")
    rows = db.scalars(select(NotebookReplay).where(NotebookReplay.notebook_id == nb.id, NotebookReplay.session == session).order_by(NotebookReplay.seq)).all()
    if not rows:
        raise HTTPException(404, "Replay tidak ditemukan.")
    base = db.get(NotebookSnapshot, rows[0].base_snapshot_id) if rows[0].base_snapshot_id else None
    events: list[Any] = []
    for r in rows:
        events.extend(sb.unpack(r.data))
    return {"session": session, "base": base.files if base else {}, "events": events}


# ------------------------------------------------------------------- gallery ---
class PublishIn(BaseModel):
    visibility: str = Field(pattern="^(class|public)$")
    description: str | None = Field(default=None, max_length=600)
    title: str | None = Field(default=None, max_length=160)
    share_replay: bool = False


@router.post("/sandbox/{nid}/publish")
def publish(nid: int, body: PublishIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    nb = sb.get_project(db, user, nid, edit=True)
    if body.visibility == "public" and not sb.gallery_public(db):
        raise HTTPException(403, "Galeri publik belum dibuka admin. Terbitkan untuk kelasmu dulu.")
    first = nb.published_at is None
    nb.visibility = body.visibility
    nb.published_at = nb.published_at or now()
    nb.share_replay = body.share_replay
    if body.title:
        nb.title = body.title.strip()[:160] or nb.title
    if body.description is not None:
        nb.description = body.description.strip()
    if first:
        sb.bump_quest(user, "publish")
    db.commit()
    return sb.project_view(db, user, nb)


@router.post("/sandbox/{nid}/unpublish")
def unpublish(nid: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    nb = sb.get_project(db, user, nid, edit=True)
    nb.visibility = "private"
    nb.published_at = None
    db.commit()
    return sb.project_view(db, user, nb)


@router.get("/gallery")
def gallery(scope: str = "class", sort: str = "new", lang: str = "", offset: int = 0,
            user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    q = select(Notebook).where(Notebook.kind.in_(sb.KINDS), Notebook.published_at.is_not(None), Notebook.visibility != "private")
    if scope == "public":
        if not sb.gallery_public(db):
            return {"items": [], "public": False, "next": None}
        q = q.where(Notebook.visibility == "public")
    elif scope == "mine":
        q = q.where(Notebook.user_id == user.id)
    else:
        if not user.class_id:
            q = q.where(Notebook.user_id == user.id)
        else:
            q = q.join(User, User.id == Notebook.user_id).where(User.class_id == user.class_id)
    if lang:
        q = q.where(Notebook.lang == lang)
    q = q.order_by(Notebook.star_count.desc(), Notebook.published_at.desc()) if sort == "stars" else q.order_by(Notebook.published_at.desc())
    rows = [nb for nb in db.scalars(q.offset(max(0, offset)).limit(25)) if sb.can_view(db, user, nb)]
    return {"items": [sb.card(db, user, nb, with_preview=True) for nb in rows[:24]], "public": sb.gallery_public(db),
            "next": offset + 24 if len(rows) > 24 else None}


@router.get("/gallery/{nid}")
def gallery_item(nid: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    nb = sb.get_project(db, user, nid)
    if nb.published_at is None and nb.user_id != user.id:
        raise HTTPException(404, "Proyek tidak ditemukan.")
    return sb.project_view(db, user, nb)


@router.put("/gallery/{nid}/star")
def star(nid: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    nb = sb.get_project(db, user, nid)
    if nb.published_at is None:
        raise HTTPException(409, "Proyek ini belum diterbitkan.")
    if not sb.starred(db, user, nb.id):
        db.execute(insert(NotebookStar).values(user_id=user.id, notebook_id=nb.id, created_at=now()))
        db.execute(update(Notebook).where(Notebook.id == nb.id).values(star_count=Notebook.star_count + 1))
        db.commit()
    db.refresh(nb)
    return {"stars": nb.star_count, "starred": True}


@router.delete("/gallery/{nid}/star")
def unstar(nid: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    nb = sb.get_project(db, user, nid)
    if sb.starred(db, user, nb.id):
        db.execute(delete(NotebookStar).where(NotebookStar.user_id == user.id, NotebookStar.notebook_id == nb.id))
        db.execute(update(Notebook).where(Notebook.id == nb.id).values(star_count=Notebook.star_count - 1))
        db.commit()
    db.refresh(nb)
    return {"stars": max(0, nb.star_count), "starred": False}


@router.post("/gallery/{nid}/remix")
def remix(nid: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    src = sb.get_project(db, user, nid)
    if src.published_at is None and src.user_id != user.id:
        raise HTTPException(404, "Proyek tidak ditemukan.")
    files = dict(src.files or {})
    if src.kind == "program":
        entry, fs, stdin = sb.program_parts(src)
        files = {"entry": entry, "files": fs, "stdin": stdin, "code": fs.get(entry, "")}
    nb = Notebook(user_id=user.id, title=f"Remix · {src.title}"[:160], cells=[], kind=src.kind, lang=src.lang, files=files,
                  description=src.description, remix_of_id=src.id)
    db.add(nb)
    db.flush()
    sb.take_snapshot(db, nb, f"Remix dari {src.title}"[:120], auto=True, force=True)
    if src.user_id != user.id:
        sb.bump_quest(user, "remix")
    db.commit()
    return sb.project_view(db, user, nb)


# ------------------------------------------------------------------- quests ---
@router.get("/quests")
def quests(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    return sb.quest_state(db, user)


@router.post("/quests/claim")
def claim(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    xp = sb.claim_quests(db, user)
    db.commit()
    return {"xp": xp, **sb.quest_state(db, user), "xp_week": activity.week_xp(db, user.id)}


# -------------------------------------------------------------- OS settings ---
class OsSettingsIn(BaseModel):
    gallery_public: bool | None = None
    music_enabled: bool | None = None
    curated: list[dict[str, str]] | None = Field(default=None, max_length=24)


@router.get("/admin/os")
def os_settings(_: User = Depends(admin_only), db: Session = Depends(get_db)) -> dict[str, Any]:
    from ..services import music
    return {"gallery_public": sb.gallery_public(db), **music.settings(db)}


@router.put("/admin/os")
def put_os_settings(body: OsSettingsIn, me: User = Depends(admin_only), db: Session = Depends(get_db)) -> dict[str, Any]:
    from ..services import audit, music
    keys = [k for k, v in (("galeri publik", body.gallery_public), ("app Musik", body.music_enabled), ("playlist", body.curated)) if v is not None]
    if keys:
        audit.record(db, me, "os.settings", None, keys=keys)
    if body.gallery_public is not None:
        sb.put_setting(db, "gallery", {"public": body.gallery_public})
    if body.music_enabled is not None or body.curated is not None:
        cur = music.settings(db)
        music.put(db, cur["music_enabled"] if body.music_enabled is None else body.music_enabled, cur["curated"] if body.curated is None else body.curated)
    db.commit()
    return {"gallery_public": sb.gallery_public(db), **music.settings(db)}
