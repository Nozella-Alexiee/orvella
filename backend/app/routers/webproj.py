"""Fullstack web projects: start/stop the dev server in the runner, sync files, logs, the
project's database, and signed links into the preview proxy."""
from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Notebook, User, now
from ..security import current_user
from ..services import activity, badges, preview, runner, stacks
from ..services import sandbox as sb

router = APIRouter(prefix="/api/web", tags=["web"])

PATH = re.compile(r"^(?!/)(?!.*\.\.)(?!.*//)[A-Za-z0-9_][A-Za-z0-9_./-]{0,119}$")
MAX_FILES = 40
MAX_BYTES = 300_000


def sid_of(nb: Notebook) -> str:
    return f"p{nb.id}"


def _project(db: Session, user: User, nid: int, view: bool = False) -> Notebook:
    """Pemilik dan teman ngoding bareng yang boleh mengedit. view=True: juga yang hanya menonton (status & pratinjau)."""
    nb = db.get(Notebook, nid)
    a = sb.access(db, user, nb) if nb is not None and nb.kind == "web" else None
    if a is None or (not view and a not in ("owner", "edit")):
        raise HTTPException(404, "Proyek tidak ditemukan.")
    return nb


def clean_files(files: dict[str, Any]) -> dict[str, str]:
    out: dict[str, str] = {}
    for path, body in list(files.items())[:MAX_FILES]:
        path = str(path).strip()
        if not PATH.match(path):
            raise HTTPException(400, f"Nama berkas tidak valid: {path}")
        out[path] = str(body)
    if sum(len(v) for v in out.values()) > MAX_BYTES:
        raise HTTPException(413, "Proyek terlalu besar (maksimal 300 KB kode).")
    return out


def _files(nb: Notebook) -> dict[str, str]:
    return dict((nb.files or {}).get("files", {}))


def _run(fn, *a, **kw):
    try:
        return fn(*a, **kw)
    except runner.RateLimited as e:
        raise HTTPException(429, str(e)) from e
    except runner.RunnerRejected as e:
        raise HTTPException(400, str(e)) from e
    except runner.RunnerUnavailable as e:
        raise HTTPException(503, str(e)) from e


def _view(request: Request, nb: Notebook, user: User, st: dict[str, Any]) -> dict[str, Any]:
    stack = (nb.files or {}).get("stack", "static")
    out = {"status": st, "stack": stack}
    if st.get("state") in ("running", "exited"):
        out["preview"] = preview.enter_url(request, sid_of(nb), user.id, stacks.STACKS.get(stack, {}).get("entry", "/"))
        out["preview_origin"] = preview.origin(request)
    return out


@router.post("/{nid}/start")
def start(nid: int, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    nb = _project(db, user, nid)
    runner.check_rate(user.id)
    stack = (nb.files or {}).get("stack", "static")
    apply_db_seed(db, nb)
    st = _run(runner.call, "POST", "/sessions", {"sid": sid_of(nb), "owner": user.id, "stack": stack, "files": _files(nb)})
    activity.record_activity(db, user, 0)
    badges.mark(user, "web")
    new = badges.evaluate(db, user, night=badges.is_night())
    db.commit()
    return {**_view(request, nb, user, st), "lencana_baru": new}


@router.post("/{nid}/stop")
def stop(nid: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    nb = _project(db, user, nid)
    _run(runner.call, "DELETE", f"/sessions/{sid_of(nb)}")
    return {"status": {"state": "stopped"}}


@router.get("/{nid}/status")
def status(nid: int, request: Request, since: float | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    nb = _project(db, user, nid, view=True)
    st = _run(runner.call, "GET", f"/sessions/{sid_of(nb)}")
    logs = _run(runner.call, "GET", f"/sessions/{sid_of(nb)}/logs", params={"since": since} if since else None) if st.get("state") != "stopped" else {"lines": [], "cursor": since or 0}
    return {**_view(request, nb, user, st), "logs": logs}


class FilesIn(BaseModel):
    write: dict[str, str] = Field(default_factory=dict)
    delete: list[str] = Field(default_factory=list)
    running: bool = False


@router.put("/{nid}/files")
def files(nid: int, body: FilesIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Saves changed files (and deletions) to the project, and into the running server when it runs."""
    nb = _project(db, user, nid)
    current = _files(nb)
    for p in body.delete:
        current.pop(p, None)
    current.update(body.write)
    current = clean_files(current)
    nb.files = {**(nb.files or {}), "files": current}
    nb.updated_at = now()
    activity.record_activity(db, user, 0)
    db.commit()
    synced = False
    if body.running:
        try:
            runner.call("PUT", f"/sessions/{sid_of(nb)}/files", {"write": {k: current[k] for k in body.write if k in current}, "delete": body.delete})
            synced = True
        except runner.RunnerUnavailable:
            synced = False
    return {"saved": True, "synced": synced, "count": len(current)}


@router.get("/{nid}/preview")
def preview_link(nid: int, request: Request, path: str = "/", user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, str]:
    nb = _project(db, user, nid, view=True)
    return {"url": preview.enter_url(request, sid_of(nb), user.id, path), "origin": preview.origin(request)}


def _engine(nb: Notebook) -> str:
    return "mysql" if (nb.files or {}).get("stack") == "php" else "sqlite"


@router.get("/{nid}/db")
def database(nid: int, file: str = "", user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    nb = _project(db, user, nid)
    return _run(runner.call, "GET", f"/sessions/{sid_of(nb)}/db", params={"engine": _engine(nb), "file": file})


class QueryIn(BaseModel):
    sql: str = Field(min_length=1, max_length=20_000)
    file: str = ""


@router.post("/{nid}/db")
def query(nid: int, body: QueryIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    nb = _project(db, user, nid)
    runner.check_rate(user.id)
    return _run(runner.call, "POST", f"/sessions/{sid_of(nb)}/db", {"engine": _engine(nb), "sql": body.sql, "file": body.file})


@router.get("/{nid}/db/dump")
def db_dump(nid: int, file: str = "", user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Isi database proyek sebagai skrip .sql (untuk diunduh, dipindah, atau dicadangkan)."""
    nb = _project(db, user, nid)
    return _run(runner.call, "GET", f"/sessions/{sid_of(nb)}/db/dump", params={"engine": _engine(nb), "file": file})


class LoadIn(BaseModel):
    sql: str = Field(min_length=1, max_length=2_000_000)
    file: str = ""


@router.post("/{nid}/db/load")
def db_load(nid: int, body: LoadIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Jalankan berkas .sql ke database proyek (mis. hasil unduh dari proyek lain)."""
    nb = _project(db, user, nid)
    runner.check_rate(user.id)
    return _run(runner.call, "POST", f"/sessions/{sid_of(nb)}/db/load", {"engine": _engine(nb), "sql": body.sql, "file": body.file})


def apply_db_seed(db: Session, nb: Notebook) -> None:
    """database.sql dari proyek yang diimpor dimuat sekali, sebelum server proyek pertama kali menyala."""
    seed = (nb.files or {}).get("db_seed")
    if not isinstance(seed, dict) or not seed.get("sql"):
        return
    _run(runner.call, "POST", f"/sessions/{sid_of(nb)}/db/load", {"engine": _engine(nb), "sql": seed["sql"], "file": seed.get("file") or ""})
    files = dict(nb.files or {})
    files.pop("db_seed", None)
    nb.files = files
    db.commit()
