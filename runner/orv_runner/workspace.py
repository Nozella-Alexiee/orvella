"""Workspace sessions: a learner's web project running as a long-lived dev server.

Each session gets its own container `orv-ws-<sid>` on its own internal Docker
network `orv-ws-<sid>` (no internet, no other learners). The preview proxy and,
for PHP projects, MariaDB are attached to that network so the proxy can reach
the app on port 8080 and the app can reach its own database as host `db`.

The runner only creates/removes containers and networks labelled
orvella.sandbox=1, and only attaches networks to Orvella's own preview and
MariaDB containers (label orvella.attach=preview|mysql in the same compose project).
"""
from __future__ import annotations

import hashlib
import hmac
import os
import re
import shutil
import sqlite3
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from docker.errors import APIError, ImageNotFound, NotFound
from docker.types import LogConfig, Mount, Ulimit

from . import config as cfg
from .sandbox import Busy, client, image_name, safe_name

SID = re.compile(r"^p\d{1,10}$")
PATH = re.compile(r"^(?!/)(?!.*\.\.)[A-Za-z0-9_][A-Za-z0-9_./-]{0,119}$")
_UID = 10001
PROJECT = os.environ.get("COMPOSE_PROJECT", "orvella")

STACKS: dict[str, dict[str, Any]] = {
    "static": {"image": "py", "cmd": ["python3", "-m", "http.server", "8080", "--bind", "0.0.0.0"], "mysql": False},
    "node": {"image": "node", "cmd": ["node", "--watch", "--disable-warning=ExperimentalWarning", "server.js"], "mysql": False},
    "php": {"image": "php", "cmd": ["php", "-S", "0.0.0.0:8080", "-t", "public"], "mysql": True},
    # --debug turns on the reloader and template auto-reload; --no-debugger keeps the in-browser console off
    "flask": {"image": "py", "cmd": ["flask", "--app", "app", "--debug", "run", "--host", "0.0.0.0", "--port", "8080", "--no-debugger"], "mysql": False},
    "fastapi": {"image": "py", "cmd": ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--reload"], "mysql": False},
}


@dataclass
class Session:
    sid: str
    owner: int
    stack: str
    container: str
    started: float
    last_active: float = field(default_factory=time.time)


_lock = threading.RLock()
SESSIONS: dict[str, Session] = {}


def _name(sid: str) -> str:
    return f"orv-ws-{sid}"


def workdir(sid: str) -> Path:
    return cfg.WORKSPACES_DIR / sid


def check_sid(sid: str) -> None:
    if not SID.match(sid):
        raise ValueError("Id sesi tidak valid.")


# ------------------------------------------------------------------- files
def write_files(sid: str, write: dict[str, str], delete: list[str] | None = None) -> None:
    root = workdir(sid)
    root.mkdir(parents=True, exist_ok=True)
    os.chown(root, _UID, _UID)
    total = sum(len(v) for v in write.values())
    if len(write) > 60 or total > cfg.MAX_TOTAL_BYTES * 2:
        raise ValueError("Proyek terlalu besar.")
    for rel in delete or []:
        if PATH.match(rel):
            p = root / rel
            if p.is_file():
                p.unlink()
    for rel, body in write.items():
        if not PATH.match(rel) or not all(safe_name(part) for part in rel.split("/")):
            raise ValueError(f"Nama berkas tidak valid: {rel}")
        p = root / rel
        # create parent folders owned by the sandbox user so the app can write next to its files
        cur = root
        for part in rel.split("/")[:-1]:
            cur = cur / part
            if not cur.exists():
                cur.mkdir()
                os.chown(cur, _UID, _UID)
        p.write_text(body, encoding="utf-8")
        os.chown(p, _UID, _UID)


def wipe(sid: str) -> None:
    check_sid(sid)
    stop(sid)
    shutil.rmtree(workdir(sid), ignore_errors=True)
    if cfg.MYSQL_HOST:
        try:
            _mysql_admin(f"DROP DATABASE IF EXISTS `{_db_name(sid)}`", f"DROP USER IF EXISTS '{_db_name(sid)}'@'%'")
        except Exception:  # noqa: BLE001
            pass


# ------------------------------------------------------------------- mysql
def _db_name(sid: str) -> str:
    return f"orv_{sid}"


def _db_pass(sid: str) -> str:
    return hmac.new(cfg.TOKEN.encode(), f"mysql:{sid}".encode(), hashlib.sha256).hexdigest()[:24]


def _mysql(user: str = "root", password: str | None = None, database: str | None = None):
    import pymysql
    return pymysql.connect(host=cfg.MYSQL_HOST, user=user, password=password if password is not None else cfg.MYSQL_ROOT_PASSWORD,
                           database=database, connect_timeout=5, read_timeout=10, write_timeout=10, autocommit=True, charset="utf8mb4")


def _mysql_admin(*stmts: str) -> None:
    con = _mysql()
    try:
        with con.cursor() as cur:
            for s in stmts:
                cur.execute(s)
    finally:
        con.close()


def provision_mysql(sid: str) -> dict[str, str]:
    db, pw = _db_name(sid), _db_pass(sid)
    _mysql_admin(f"CREATE DATABASE IF NOT EXISTS `{db}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
                 f"CREATE USER IF NOT EXISTS '{db}'@'%' IDENTIFIED BY '{pw}'",
                 f"ALTER USER '{db}'@'%' IDENTIFIED BY '{pw}' WITH MAX_USER_CONNECTIONS 10",
                 f"GRANT ALL PRIVILEGES ON `{db}`.* TO '{db}'@'%'")
    return {"DB_HOST": "db", "DB_PORT": "3306", "DB_NAME": db, "DB_USER": db, "DB_PASS": pw}


# ---------------------------------------------------------------- networks
def _attachable(role: str) -> list[Any]:
    return client().containers.list(filters={"label": [f"orvella.attach={role}", f"com.docker.compose.project={PROJECT}"]})


def _network(sid: str):
    dc = client()
    name = _name(sid)
    try:
        return dc.networks.get(name)
    except NotFound:
        return dc.networks.create(name, driver="bridge", internal=True, labels={"orvella.sandbox": "1", "orvella.session": sid})


def _attach(net, role: str, aliases: list[str] | None = None) -> None:
    for c in _attachable(role):
        try:
            net.connect(c, aliases=aliases)
        except APIError as e:
            if "already exists" not in str(e) and "already attached" not in str(e):
                raise


def _drop_network(sid: str) -> None:
    dc = client()
    try:
        net = dc.networks.get(_name(sid))
    except NotFound:
        return
    if net.attrs.get("Labels", {}).get("orvella.sandbox") != "1":
        return
    net.reload()
    for cid in list((net.attrs.get("Containers") or {}).keys()):
        try:
            net.disconnect(cid, force=True)
        except APIError:
            pass
    try:
        net.remove()
    except APIError:
        pass


# ----------------------------------------------------------------- sessions
def startup() -> None:
    """Rebuilds the session table from running containers (the runner may have restarted)."""
    cfg.WORKSPACES_DIR.mkdir(parents=True, exist_ok=True)
    try:
        for c in client().containers.list(all=True, filters={"label": ["orvella.sandbox=1", "orvella.kind=ws"]}):
            lab = c.labels
            sid = lab.get("orvella.session", "")
            if SID.match(sid):
                SESSIONS[sid] = Session(sid, int(lab.get("orvella.owner", "0") or 0), lab.get("orvella.stack", "static"), c.name, time.time())
    except Exception:  # noqa: BLE001
        pass
    threading.Thread(target=_reaper, daemon=True).start()


def _reaper() -> None:
    while True:
        time.sleep(30)
        limit = cfg.WS_IDLE_MINUTES * 60
        for sid, s in list(SESSIONS.items()):
            if time.time() - s.last_active > limit:
                stop(sid)


def touch(sid: str) -> None:
    s = SESSIONS.get(sid)
    if s:
        s.last_active = time.time()


def stats() -> dict[str, Any]:
    return {"active": len(SESSIONS), "max": cfg.MAX_WS_SESSIONS, "idle_minutes": cfg.WS_IDLE_MINUTES,
            "items": [{"sid": s.sid, "owner": s.owner, "stack": s.stack, "since": int(time.time() - s.started),
                       "idle": int(time.time() - s.last_active)} for s in SESSIONS.values()]}


def start(sid: str, owner: int, stack: str, files: dict[str, str]) -> dict[str, Any]:
    check_sid(sid)
    spec = STACKS.get(stack)
    if spec is None:
        raise ValueError(f"Stack tidak dikenal: {stack}")
    with _lock:
        if sid in SESSIONS:
            stop(sid)
        for other in [s for s in SESSIONS.values() if s.owner == owner and s.sid != sid]:
            stop(other.sid)  # one running project per learner
        if len(SESSIONS) >= cfg.MAX_WS_SESSIONS:
            raise Busy(f"Semua slot proyek web sedang dipakai ({len(SESSIONS)}/{cfg.MAX_WS_SESSIONS}). Coba lagi sebentar.")
        write_files(sid, files)
        env = {"PORT": "8080", "HOST": "0.0.0.0", "HOME": "/tmp", "LANG": "C.UTF-8", "PYTHONDONTWRITEBYTECODE": "1",
               "PYTHONUNBUFFERED": "1", "NODE_ENV": "development", "TMPDIR": "/tmp"}
        net = _network(sid)
        _attach(net, "preview")
        if spec["mysql"] and cfg.MYSQL_HOST:
            env.update(provision_mysql(sid))
            _attach(net, "mysql", aliases=["db"])
        mount = Mount(target="/app", source=cfg.WORKSPACES_VOLUME, type="volume", no_copy=True)
        mount["VolumeOptions"]["Subpath"] = sid
        dc = client()
        try:
            old = dc.containers.get(_name(sid))
            if old.labels.get("orvella.sandbox") == "1":
                old.remove(force=True)
        except NotFound:
            pass
        try:
            c = dc.containers.create(
                image=image_name(spec["image"]), command=spec["cmd"], name=_name(sid), working_dir="/app", user=cfg.SANDBOX_UID,
                network=net.name, read_only=True, tmpfs={"/tmp": "rw,exec,nosuid,nodev,size=64m,mode=1777"}, mounts=[mount],
                cap_drop=["ALL"], security_opt=["no-new-privileges"], init=True, hostname="app",
                mem_limit=f"{cfg.WS_MEMORY_MB}m", memswap_limit=f"{cfg.WS_MEMORY_MB}m", nano_cpus=500_000_000, pids_limit=128,
                ulimits=[Ulimit(name="nofile", soft=512, hard=512), Ulimit(name="fsize", soft=32 << 20, hard=32 << 20), Ulimit(name="core", soft=0, hard=0)],
                environment=env,
                labels={"orvella.sandbox": "1", "orvella.kind": "ws", "orvella.session": sid, "orvella.owner": str(owner), "orvella.stack": stack},
                log_config=LogConfig(type="json-file", config={"max-size": "1m", "max-file": "1"}), detach=True,
            )
        except ImageNotFound as e:
            _drop_network(sid)
            raise ValueError(f"Image {image_name(spec['image'])} belum dibangun.") from e
        c.start()
        SESSIONS[sid] = Session(sid, owner, stack, c.name, time.time())
        return status(sid)


def stop(sid: str) -> None:
    with _lock:
        SESSIONS.pop(sid, None)
        try:
            c = client().containers.get(_name(sid))
            if c.labels.get("orvella.sandbox") == "1":
                c.remove(force=True)
        except NotFound:
            pass
        except APIError:
            pass
        _drop_network(sid)


def status(sid: str) -> dict[str, Any]:
    check_sid(sid)
    s = SESSIONS.get(sid)
    if s is None:
        return {"state": "stopped"}
    try:
        c = client().containers.get(s.container)
    except NotFound:
        SESSIONS.pop(sid, None)
        return {"state": "stopped"}
    st = c.attrs.get("State", {})
    state = "running" if st.get("Running") else "exited"
    return {"state": state, "exit": None if state == "running" else st.get("ExitCode"), "oom": bool(st.get("OOMKilled")),
            "stack": s.stack, "since": int(time.time() - s.started), "idle_limit": cfg.WS_IDLE_MINUTES * 60}


def logs(sid: str, since: float | None = None) -> dict[str, Any]:
    check_sid(sid)
    s = SESSIONS.get(sid)
    if s is None:
        return {"lines": [], "cursor": since or 0}
    try:
        c = client().containers.get(s.container)
    except NotFound:
        return {"lines": [], "cursor": since or 0}
    kw: dict[str, Any] = {"timestamps": True, "tail": 300}
    if since:
        kw["since"] = since
    raw = c.logs(stdout=True, stderr=True, **kw).decode("utf-8", errors="replace")
    lines, cursor = [], since or 0
    for line in raw.splitlines():
        ts, _, text = line.partition(" ")
        try:
            t = _ts(ts)
        except ValueError:
            continue
        if since and t <= since:
            continue
        cursor = max(cursor, t)
        lines.append({"t": t, "text": text[:2000]})
    return {"lines": lines[-300:], "cursor": cursor}


def _ts(s: str) -> float:
    from datetime import datetime
    base, _, frac = s.rstrip("Z").partition(".")
    dt = datetime.fromisoformat(base + "+00:00")
    return dt.timestamp() + float("0." + (frac or "0"))


# ---------------------------------------------------------------- database
def _sqlite_path(sid: str, file: str) -> Path:
    if not PATH.match(file) or not file.endswith((".db", ".sqlite", ".sqlite3")):
        raise ValueError("Berkas database tidak valid.")
    p = workdir(sid) / file
    if not p.is_file():
        raise FileNotFoundError(file)
    return p


def db_files(sid: str) -> list[str]:
    root = workdir(sid)
    if not root.exists():
        return []
    return sorted(str(p.relative_to(root)) for p in root.rglob("*") if p.is_file() and p.suffix in (".db", ".sqlite", ".sqlite3"))[:10]


def query(sid: str, engine: str, sql: str, file: str = "", limit: int = 200) -> dict[str, Any]:
    check_sid(sid)
    sql = sql.strip()
    if not sql:
        raise ValueError("Kueri kosong.")
    if engine == "mysql":
        con = _mysql(_db_name(sid), _db_pass(sid), _db_name(sid))
        try:
            with con.cursor() as cur:
                cur.execute("SET SESSION max_statement_time = 5")
                cur.execute(sql)
                cols = [d[0] for d in cur.description] if cur.description else []
                rows = [list(r) for r in cur.fetchmany(limit)] if cols else []
                return {"columns": cols, "rows": _jsonable(rows), "affected": cur.rowcount if not cols else None}
        finally:
            con.close()
    con = sqlite3.connect(f"file:{_sqlite_path(sid, file)}?mode=rw", uri=True, timeout=2)
    try:
        con.setconfig(sqlite3.SQLITE_DBCONFIG_DEFENSIVE, True)
        con.execute("PRAGMA trusted_schema = OFF")
        deadline = time.monotonic() + 4
        con.set_progress_handler(lambda: 1 if time.monotonic() > deadline else 0, 10_000)
        cur = con.execute(sql)
        cols = [d[0] for d in cur.description] if cur.description else []
        rows = [list(r) for r in cur.fetchmany(limit)] if cols else []
        con.commit()
        return {"columns": cols, "rows": _jsonable(rows), "affected": cur.rowcount if not cols else None}
    finally:
        con.close()


def tables(sid: str, engine: str, file: str = "") -> list[dict[str, Any]]:
    if engine == "mysql":
        r = query(sid, "mysql", "SELECT table_name, table_rows FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name")
        return [{"name": row[0], "rows": row[1]} for row in r["rows"]]
    r = query(sid, "sqlite", "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name", file)
    out = []
    for (name,) in r["rows"]:
        cnt = query(sid, "sqlite", f'SELECT COUNT(*) FROM "{str(name).replace(chr(34), "")}"', file)["rows"][0][0]
        out.append({"name": name, "rows": cnt})
    return out


def _jsonable(rows: list[list[Any]]) -> list[list[Any]]:
    out = []
    for r in rows:
        out.append([v if isinstance(v, (int, float, str)) or v is None else (v.hex() if isinstance(v, (bytes, bytearray)) else str(v)) for v in r])
    return out
