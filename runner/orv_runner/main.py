"""Orvella runner API. Internal only: every call needs `Authorization: Bearer $RUNNER_TOKEN`."""
from __future__ import annotations

import hmac
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from . import config as cfg
from . import sandbox
from .langs import LANGS, PUBLIC_LANGS

if not cfg.TOKEN or len(cfg.TOKEN) < 16:
    raise RuntimeError("RUNNER_TOKEN wajib diisi (minimal 16 karakter).")

app = FastAPI(title="Orvella runner", docs_url=None, redoc_url=None, openapi_url=None)


def auth(authorization: str = Header(default="")) -> None:
    token = authorization.removeprefix("Bearer ").strip()
    if not hmac.compare_digest(token.encode(), cfg.TOKEN.encode()):
        raise HTTPException(401, "Token runner salah.")


@app.on_event("startup")
def _startup() -> None:
    cfg.JOBS_DIR.mkdir(parents=True, exist_ok=True)
    sandbox.cleanup_stale()
    try:
        from . import workspace
        workspace.startup()
    except ImportError:
        pass


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


class TestIn(BaseModel):
    id: str = Field(max_length=40)
    stdin: str = Field(default="", max_length=64_000)
    expect: str = Field(default="", max_length=64_000)
    match: str = Field(default="trim", pattern="^(trim|exact|contains|tokens|regex)$")


class RunIn(BaseModel):
    lang: str
    code: str = Field(default="", max_length=cfg.MAX_TOTAL_BYTES)
    files: dict[str, str] = Field(default_factory=dict)
    stdin: str = Field(default="", max_length=64_000)
    tests: list[TestIn] = Field(default_factory=list, max_length=30)
    timeout: float | None = Field(default=None, gt=0, le=cfg.MAX_RUN_TIMEOUT)
    memory: int | None = Field(default=None, ge=32, le=cfg.MAX_MEMORY_MB)


@app.post("/run", dependencies=[Depends(auth)])
def run(body: RunIn) -> dict[str, Any]:
    if body.lang not in LANGS:
        raise HTTPException(400, f"Bahasa tidak dikenal: {body.lang}")
    if len(body.files) > cfg.MAX_FILES or any(not sandbox.safe_name(n) for n in body.files):
        raise HTTPException(400, "Nama berkas tidak valid.")
    if len(body.code) + sum(len(v) for v in body.files.values()) > cfg.MAX_TOTAL_BYTES:
        raise HTTPException(413, "Kode terlalu besar.")
    try:
        return sandbox.run(sandbox.RunRequest(lang=body.lang, code=body.code, files=body.files, stdin=body.stdin,
                                              tests=[t.model_dump() for t in body.tests], timeout=body.timeout, memory=body.memory))
    except sandbox.Busy as e:
        raise HTTPException(429, str(e)) from e


@app.get("/status", dependencies=[Depends(auth)])
def status(versions: bool = False) -> dict[str, Any]:
    have = sandbox.images()
    langs = []
    for l in PUBLIC_LANGS:
        langs.append({"id": l.id, "name": l.name, "image": sandbox.image_name(l.image), "available": have.get(l.image, False),
                      "version": sandbox.version(l) if versions and have.get(l.image) else sandbox._versions.get(l.id, ""),
                      "run_timeout": l.run_timeout, "run_mem": l.run_mem, "compiled": bool(l.compile)})
    out: dict[str, Any] = {"queue": sandbox.QUEUE.stats(), "langs": langs, "limits": {
        "max_run_timeout": cfg.MAX_RUN_TIMEOUT, "max_memory_mb": cfg.MAX_MEMORY_MB, "max_concurrency": cfg.MAX_RUN_CONCURRENCY}}
    try:
        from . import workspace
        out["sessions"] = workspace.stats()
    except ImportError:
        pass
    return out


# ---------------------------------------------------------- workspace sessions
from . import workspace  # noqa: E402


def _ws_call(fn, *a, **kw):
    try:
        return fn(*a, **kw)
    except sandbox.Busy as e:
        raise HTTPException(429, str(e)) from e
    except (ValueError, FileNotFoundError) as e:
        raise HTTPException(400, str(e)) from e


class SessionIn(BaseModel):
    sid: str = Field(pattern=r"^p\d{1,10}$")
    owner: int
    stack: str
    files: dict[str, str] = Field(default_factory=dict)


@app.post("/sessions", dependencies=[Depends(auth)])
def session_start(body: SessionIn) -> dict[str, Any]:
    return _ws_call(workspace.start, body.sid, body.owner, body.stack, body.files)


@app.get("/sessions/{sid}", dependencies=[Depends(auth)])
def session_status(sid: str) -> dict[str, Any]:
    workspace.touch(sid)
    return _ws_call(workspace.status, sid)


@app.delete("/sessions/{sid}", dependencies=[Depends(auth)])
def session_stop(sid: str) -> dict[str, bool]:
    _ws_call(workspace.check_sid, sid)
    workspace.stop(sid)
    return {"ok": True}


class FilesIn(BaseModel):
    write: dict[str, str] = Field(default_factory=dict)
    delete: list[str] = Field(default_factory=list)


@app.put("/sessions/{sid}/files", dependencies=[Depends(auth)])
def session_files(sid: str, body: FilesIn) -> dict[str, bool]:
    _ws_call(workspace.check_sid, sid)
    workspace.touch(sid)
    _ws_call(workspace.write_files, sid, body.write, body.delete)
    return {"ok": True}


@app.get("/sessions/{sid}/logs", dependencies=[Depends(auth)])
def session_logs(sid: str, since: float | None = None) -> dict[str, Any]:
    workspace.touch(sid)
    return _ws_call(workspace.logs, sid, since)


@app.get("/sessions/{sid}/db", dependencies=[Depends(auth)])
def session_db(sid: str, engine: str = "sqlite", file: str = "") -> dict[str, Any]:
    _ws_call(workspace.check_sid, sid)
    workspace.touch(sid)
    files = workspace.db_files(sid) if engine == "sqlite" else []
    if engine == "sqlite" and not file:
        file = files[0] if files else ""
    try:
        tables = workspace.tables(sid, engine, file) if (engine == "mysql" or file) else []
        error = ""
    except Exception as e:  # noqa: BLE001 - shown to the learner as-is (their own database)
        tables, error = [], str(e)[:300]
    return {"engine": engine, "files": files, "file": file, "tables": tables, "error": error}


class QueryIn(BaseModel):
    engine: str = Field(pattern="^(mysql|sqlite)$")
    sql: str = Field(max_length=20_000)
    file: str = ""


@app.post("/sessions/{sid}/db", dependencies=[Depends(auth)])
def session_query(sid: str, body: QueryIn) -> dict[str, Any]:
    _ws_call(workspace.check_sid, sid)
    workspace.touch(sid)
    try:
        return {"ok": True, **workspace.query(sid, body.engine, body.sql, body.file)}
    except (ValueError, FileNotFoundError) as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:  # noqa: BLE001 - SQL errors belong to the learner
        return {"ok": False, "error": str(e)[:500]}


@app.get("/sessions/{sid}/db/dump", dependencies=[Depends(auth)])
def session_dump(sid: str, engine: str = "sqlite", file: str = "") -> dict[str, Any]:
    _ws_call(workspace.check_sid, sid)
    try:
        return workspace.dump(sid, engine, file)
    except (ValueError, FileNotFoundError) as e:
        raise HTTPException(400, str(e) if not isinstance(e, FileNotFoundError) else "Belum ada berkas database untuk diunduh.") from e
    except Exception as e:  # noqa: BLE001 - the learner's own database
        raise HTTPException(400, f"Database belum bisa dibaca: {str(e)[:200]}") from e


class LoadIn(BaseModel):
    engine: str = Field(pattern="^(mysql|sqlite)$")
    sql: str = Field(max_length=2_100_000)
    file: str = ""


@app.post("/sessions/{sid}/db/load", dependencies=[Depends(auth)])
def session_load(sid: str, body: LoadIn) -> dict[str, Any]:
    _ws_call(workspace.check_sid, sid)
    try:
        return {"ok": True, **workspace.load(sid, body.engine, body.sql, body.file)}
    except (ValueError, FileNotFoundError) as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:  # noqa: BLE001 - SQL errors belong to the learner
        raise HTTPException(400, f"Impor gagal: {str(e)[:300]}") from e


@app.delete("/projects/{sid}", dependencies=[Depends(auth)])
def project_wipe(sid: str) -> dict[str, bool]:
    _ws_call(workspace.wipe, sid)
    return {"ok": True}
