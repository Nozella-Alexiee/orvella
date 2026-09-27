"""One-shot sandbox runs: write the job's files to the shared volume, compile in
one container, then run every test in its own container and compare stdout here.

Every container gets: no network, read-only rootfs, a small /tmp tmpfs,
uid 10001, all capabilities dropped, no-new-privileges, memory/CPU/pids/file
size limits and a wall-clock limit enforced by this process. The job folder is
mounted read-only while the learner's program runs, so a program cannot change
what later tests see, and pass/fail is decided outside the sandbox.
"""
from __future__ import annotations

import os
import re
import secrets
import shutil
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Iterator

import docker
from docker.errors import APIError, ImageNotFound, NotFound
from docker.types import LogConfig, Mount, Ulimit

from . import config as cfg
from .langs import LANGS, Lang, plan

_client: docker.DockerClient | None = None
_client_lock = threading.Lock()


def client() -> docker.DockerClient:
    global _client
    with _client_lock:
        if _client is None:
            _client = docker.from_env(version="auto", timeout=120)
        return _client


# ------------------------------------------------------------------ queue ---
class Busy(RuntimeError):
    pass


class _Queue:
    def __init__(self, slots: int):
        self.sem = threading.BoundedSemaphore(max(1, slots))
        self.lock = threading.Lock()
        self.active = 0
        self.waiting = 0
        self.done = 0
        self.slots = max(1, slots)

    @contextmanager
    def slot(self) -> Iterator[None]:
        with self.lock:
            if self.waiting >= cfg.MAX_QUEUE:
                raise Busy("Antrean runner sedang penuh. Coba lagi sebentar.")
            self.waiting += 1
        self.sem.acquire()
        with self.lock:
            self.waiting -= 1
            self.active += 1
        try:
            yield
        finally:
            with self.lock:
                self.active -= 1
                self.done += 1
            self.sem.release()

    def stats(self) -> dict[str, int]:
        with self.lock:
            return {"active": self.active, "waiting": self.waiting, "slots": self.slots, "done": self.done}


QUEUE = _Queue(cfg.MAX_RUN_CONCURRENCY)


# ------------------------------------------------------------------- jobs ---
_SAFE_NAME = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$")
_UID = 10001


def safe_name(name: str) -> bool:
    return bool(_SAFE_NAME.match(name)) and ".." not in name


@dataclass
class Job:
    id: str
    path: Path

    def write(self, rel: str, data: str | bytes, owner: bool = False) -> None:
        p = self.path / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(data, str):
            data = data.encode("utf-8")
        p.write_bytes(data)
        os.chmod(p, 0o644)
        if owner:
            os.chown(p, _UID, _UID)


@contextmanager
def new_job() -> Iterator[Job]:
    jid = secrets.token_hex(8)
    path = cfg.JOBS_DIR / jid
    path.mkdir(parents=True)
    os.chmod(path, 0o755)
    out = path / "out"
    out.mkdir()
    os.chown(out, _UID, _UID)
    (path / "in").mkdir()
    (path / ".orv").mkdir()
    try:
        yield Job(jid, path)
    finally:
        shutil.rmtree(path, ignore_errors=True)


def cleanup_stale() -> None:
    """Removes leftovers from a previous crash: only containers labelled as one-shot sandbox runs."""
    try:
        for c in client().containers.list(all=True, filters={"label": ["orvella.sandbox=1", "orvella.kind=run"]}):
            try:
                c.remove(force=True)
            except (APIError, NotFound):
                pass
    except Exception:  # noqa: BLE001 - docker may be unreachable at startup; runs will report it
        pass
    if cfg.JOBS_DIR.exists():
        for p in cfg.JOBS_DIR.iterdir():
            shutil.rmtree(p, ignore_errors=True)


# --------------------------------------------------------------- execution ---
@dataclass
class Exec:
    exit: int | None = None
    stdout: str = ""
    stderr: str = ""
    ms: int = 0
    mem_kb: int | None = None
    timeout: bool = False
    oom: bool = False
    truncated: bool = False
    error: str = ""  # runner-side problem (image missing, docker down)

    def as_dict(self) -> dict[str, Any]:
        return {k: getattr(self, k) for k in ("exit", "stdout", "stderr", "ms", "mem_kb", "timeout", "oom", "truncated", "error")}


# The program runs under a tiny shell wrapper that feeds stdin from a file and reports the exit
# code and the cgroup's peak memory on stderr afterwards. A program can only fake its own stats.
_WRAP = ('in="$1"; shift; "$@" < "$in"; c=$?; '
         'printf "\\n\\036ORV %s %s\\n" "$c" "$(cat /sys/fs/cgroup/memory.peak 2>/dev/null || echo 0)" >&2; exit $c')
_STATS = re.compile(r"\n?\x1eORV (\d+) (\d+)\n?$")


def image_name(short: str) -> str:
    return f"{cfg.IMAGE_PREFIX}{short}:latest"


def _job_mount(job: Job, read_only: bool) -> Mount:
    m = Mount(target="/box", source=cfg.JOBS_VOLUME, type="volume", read_only=read_only, no_copy=True)
    m["VolumeOptions"]["Subpath"] = job.id
    return m


def _decode(b: bytes, limit: int) -> tuple[str, bool]:
    cut = len(b) > limit
    return b[:limit].decode("utf-8", errors="replace"), cut


def _ms(state: dict[str, Any]) -> int:
    try:
        a = datetime.fromisoformat(state["StartedAt"][:26].rstrip("Z") + "+00:00")
        b = datetime.fromisoformat(state["FinishedAt"][:26].rstrip("Z") + "+00:00")
        return max(0, int((b - a).total_seconds() * 1000))
    except (KeyError, ValueError):
        return 0


def execute(image: str, cmd: list[str], job: Job, *, read_only: bool, mem_mb: int, timeout: float, pids: int = 128,
            env: dict[str, str] | None = None, extra_mounts: list[Mount] | None = None, fsize_mb: int = 16,
            kind: str = "run") -> Exec:
    """Runs one container to completion and returns its output. Waits for a free queue slot first."""
    mem_mb = min(mem_mb, cfg.MAX_MEMORY_MB)
    with QUEUE.slot():
        dc = client()
        try:
            c = dc.containers.create(
                image=image_name(image), command=cmd, working_dir="/box", user=cfg.SANDBOX_UID,
                network_mode="none", read_only=True, tmpfs={"/tmp": "rw,exec,nosuid,nodev,size=64m,mode=1777"},
                mounts=[_job_mount(job, read_only), *(extra_mounts or [])],
                cap_drop=["ALL"], security_opt=["no-new-privileges"], init=True, hostname="orvella",
                mem_limit=f"{mem_mb}m", memswap_limit=f"{mem_mb}m", nano_cpus=1_000_000_000, pids_limit=pids,
                ulimits=[Ulimit(name="nofile", soft=256, hard=256), Ulimit(name="fsize", soft=fsize_mb << 20, hard=fsize_mb << 20),
                         Ulimit(name="core", soft=0, hard=0)],
                environment={"HOME": "/tmp", "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8", "TMPDIR": "/tmp", **(env or {})},
                labels={"orvella.sandbox": "1", "orvella.kind": "run", "orvella.job": job.id, "orvella.step": kind},
                log_config=LogConfig(type="json-file", config={"max-size": "2m", "max-file": "1"}),
                stdin_open=False, tty=False, detach=True,
            )
        except ImageNotFound:
            return Exec(error=f"Image {image_name(image)} belum dibangun (jalankan scripts/build-sandbox.sh).")
        except APIError as e:
            return Exec(error=f"Docker menolak membuat container: {e.explanation or e}")
        res = Exec()
        try:
            c.start()
            try:
                res.exit = int(c.wait(timeout=timeout)["StatusCode"])
            except Exception:  # noqa: BLE001 - requests' ReadTimeout/ConnectionError: time is up
                res.timeout = True
                try:
                    c.kill()
                except (APIError, NotFound):
                    pass
                try:
                    c.wait(timeout=10)
                except Exception:  # noqa: BLE001
                    pass
            c.reload()
            state = c.attrs.get("State", {})
            res.oom = bool(state.get("OOMKilled"))
            res.ms = min(_ms(state), int(timeout * 1000)) if not res.timeout else int(timeout * 1000)
            out = c.logs(stdout=True, stderr=False)
            err = c.logs(stdout=False, stderr=True)
            res.stdout, cut1 = _decode(out, cfg.MAX_STDOUT)
            m = _STATS.search(err.decode("utf-8", errors="replace")[-200:]) if err else None
            if m:
                err = err[: len(err) - len(m.group(0).encode())]
                res.exit = int(m.group(1))
                peak = int(m.group(2))
                res.mem_kb = peak // 1024 if peak else None
                if res.exit == 137 and peak >= (mem_mb << 20) * 0.9:
                    res.oom = True
            res.stderr, cut2 = _decode(err, cfg.MAX_STDERR)
            res.truncated = cut1 or cut2
        except APIError as e:
            res.error = f"Docker error: {e.explanation or e}"
        finally:
            try:
                c.remove(force=True)
            except (APIError, NotFound):
                pass
        return res


# ------------------------------------------------------------------ compare ---
def _norm_lines(s: str) -> list[str]:
    lines = [l.rstrip() for l in s.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    while lines and not lines[-1]:
        lines.pop()
    return lines


def compare(got: str, expect: str, match: str = "trim") -> bool:
    if match == "exact":
        return got.replace("\r\n", "\n").rstrip("\n") == expect.replace("\r\n", "\n").rstrip("\n")
    if match == "contains":
        return expect.strip() in got
    if match == "tokens":
        return got.split() == expect.split()
    if match == "regex":
        try:
            return re.search(expect, got, re.M | re.S) is not None
        except re.error:
            return False
    return _norm_lines(got) == _norm_lines(expect)


# -------------------------------------------------------------------- runs ---
@dataclass
class RunRequest:
    lang: str
    code: str = ""
    files: dict[str, str] = field(default_factory=dict)
    stdin: str = ""
    tests: list[dict[str, Any]] = field(default_factory=list)
    timeout: float | None = None
    memory: int | None = None


def _helpers(job: Job) -> None:
    for name in ("sqlrun.py", "sandbox.mjs"):
        src = cfg.HELPERS_DIR / name
        if src.exists():
            job.write(f".orv/{name}", src.read_bytes())


def run(req: RunRequest) -> dict[str, Any]:
    lang: Lang | None = LANGS.get(req.lang)
    if lang is None:
        raise ValueError(f"Bahasa tidak dikenal: {req.lang}")
    code = req.code if req.code else req.files.get(lang.file, "")
    code, filename, compile_cmd, run_cmd = plan(lang, code)
    run_timeout = min(req.timeout or lang.run_timeout, cfg.MAX_RUN_TIMEOUT)
    run_mem = min(req.memory or lang.run_mem, cfg.MAX_MEMORY_MB)
    out: dict[str, Any] = {"lang": lang.id, "file": filename, "compile": None, "run": None, "tests": []}
    t_start = time.monotonic()
    with new_job() as job:
        for name, body in req.files.items():
            if name != lang.file:
                job.write(name, body)
        job.write(filename, code)
        _helpers(job)
        mounts: list[Mount] = []
        if lang.id == "go":
            mounts.append(Mount(target="/gocache", source=cfg.GOCACHE_VOLUME, type="volume"))
        if compile_cmd:
            comp = execute(lang.image, list(compile_cmd), job, read_only=False, mem_mb=lang.compile_mem,
                           timeout=min(lang.compile_timeout, cfg.MAX_COMPILE_TIMEOUT), pids=max(lang.pids, 256),
                           env=lang.env, extra_mounts=mounts, fsize_mb=96, kind="compile")
            ok = comp.exit == 0 and not comp.timeout and not comp.error
            out["compile"] = {**comp.as_dict(), "ok": ok}
            if not ok:
                out["tests"] = [{"id": t.get("id"), "pass": False, "skipped": True} for t in req.tests]
                out["ms"] = int((time.monotonic() - t_start) * 1000)
                return out

        def one(idx: int, stdin: str) -> Exec:
            job.write(f"in/{idx}.txt", stdin)
            return execute(lang.image, ["sh", "-c", _WRAP, "orv", f"/box/in/{idx}.txt", *run_cmd], job, read_only=True,
                           mem_mb=run_mem, timeout=run_timeout, pids=lang.pids, env=lang.env)

        if not req.tests:
            out["run"] = one(0, req.stdin).as_dict()
        else:
            with ThreadPoolExecutor(max_workers=max(1, min(QUEUE.slots, len(req.tests)))) as pool:
                futures = [pool.submit(one, i + 1, str(t.get("stdin", ""))) for i, t in enumerate(req.tests)]
                results = [f.result() for f in futures]
            for t, r in zip(req.tests, results):
                ok = (not r.error and not r.timeout and r.exit == 0
                      and compare(r.stdout, str(t.get("expect", "")), str(t.get("match", "trim"))))
                out["tests"].append({"id": t.get("id"), "pass": ok, **r.as_dict()})
    out["ms"] = int((time.monotonic() - t_start) * 1000)
    return out


# ----------------------------------------------------------------- status ---
_versions: dict[str, str] = {}


def images() -> dict[str, bool]:
    have: dict[str, bool] = {}
    for short in sorted({l.image for l in LANGS.values()}):
        try:
            client().images.get(image_name(short))
            have[short] = True
        except ImageNotFound:
            have[short] = False
        except Exception:  # noqa: BLE001 - docker unreachable
            have[short] = False
    return have


def version(lang: Lang, refresh: bool = False) -> str:
    if lang.id in _versions and not refresh:
        return _versions[lang.id]
    if not lang.version:
        return ""
    with new_job() as job:
        r = execute(lang.image, list(lang.version), job, read_only=True, mem_mb=max(lang.run_mem, 512), timeout=30, pids=256,
                    env=lang.env, kind="version")
    text = (r.stdout or r.stderr).strip().splitlines()
    v = text[-1][:80] if text and not r.error else ""
    if v:
        _versions[lang.id] = v
    return v
