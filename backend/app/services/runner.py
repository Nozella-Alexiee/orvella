"""Runs learner code.

* `run()`: the original JavaScript test harness (runner/sandbox.mjs: node:vm,
  tests such as `expr` evaluated inside the program's context). With the runner
  service configured it runs inside a sandbox container; without it (local
  development, tests) it falls back to a Node subprocess with Node's permission
  model and a clean environment.
* `execute()`: any language through the runner service (runner/ in the repo):
  one run with stdin, or stdin → stdout tests that the runner compares itself.
"""
from __future__ import annotations

import json
import os
import subprocess
import threading
import time
from collections import deque
from pathlib import Path
from typing import Any

import httpx

from ..config import settings
from . import compilers

SANDBOX = Path(__file__).resolve().parent.parent.parent / "runner" / "sandbox.mjs"
MAX_CODE_CHARS = 20_000
LANG_IDS = ("python", "javascript", "php", "c", "cpp", "rust", "go", "java", "kotlin", "sql")


class RunnerUnavailable(RuntimeError):
    pass


class RateLimited(RunnerUnavailable):
    pass


# ---------------------------------------------------------------- transport
_http: httpx.Client | None = None


def configured() -> bool:
    return bool(settings.runner_url and settings.runner_token)


def _client() -> httpx.Client:
    global _http
    if _http is None:
        _http = httpx.Client(base_url=settings.runner_url.rstrip("/"), timeout=httpx.Timeout(120, connect=3),
                             headers={"Authorization": f"Bearer {settings.runner_token}"})
    return _http


def _post(path: str, body: dict[str, Any]) -> dict[str, Any]:
    try:
        r = _client().post(path, json=body)
    except httpx.HTTPError as e:
        raise RunnerUnavailable("Runner kode sedang tidak bisa dihubungi. Coba lagi sebentar.") from e
    if r.status_code == 429:
        raise RunnerUnavailable(r.json().get("detail", "Antrean runner penuh. Coba lagi sebentar."))
    if r.status_code != 200:
        raise RunnerUnavailable(f"Runner menolak permintaan ({r.status_code}).")
    return r.json()


def call(method: str, path: str, body: dict[str, Any] | None = None, params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Any other runner endpoint (workspace sessions). Errors from the runner keep their message."""
    if not configured():
        raise RunnerUnavailable("Runner belum aktif di server ini.")
    try:
        r = _client().request(method, path, json=body, params=params)
    except httpx.HTTPError as e:
        raise RunnerUnavailable("Runner kode sedang tidak bisa dihubungi. Coba lagi sebentar.") from e
    if r.status_code in (400, 429):
        try:
            msg = r.json().get("detail", "")
        except ValueError:
            msg = ""
        raise (RateLimited if r.status_code == 429 else RunnerRejected)(msg or "Permintaan ditolak runner.")
    if r.status_code != 200:
        raise RunnerUnavailable(f"Runner menolak permintaan ({r.status_code}).")
    return r.json()


class RunnerRejected(RunnerUnavailable):
    pass


def status(versions: bool = False) -> dict[str, Any] | None:
    if not configured():
        return None
    try:
        r = _client().get("/status", params={"versions": str(versions).lower()}, timeout=60)
        return r.json() if r.status_code == 200 else None
    except httpx.HTTPError:
        return None


# ------------------------------------------------------------- rate limit
_recent: dict[int, deque[float]] = {}
_rl_lock = threading.Lock()


def check_rate(user_id: int | None) -> None:
    if user_id is None:
        return
    now = time.monotonic()
    with _rl_lock:
        q = _recent.setdefault(user_id, deque())
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= settings.runs_per_minute:
            raise RateLimited("Terlalu sering menjalankan kode. Tunggu sebentar, lalu coba lagi.")
        q.append(now)


# ------------------------------------------------------ legacy JS harness
def _timeout_result(tests: list[dict[str, Any]] | None) -> dict[str, Any]:
    return {"logs": [], "error": {"name": "TimeoutError", "message": "Program berjalan terlalu lama (mungkin loop tanpa akhir).", "line": None},
            "vars": {}, "results": [{"id": t["id"], "pass": False, "detail": "program berhenti karena error", "ms": 0} for t in tests or []]}


def run(code: str, tests: list[dict[str, Any]] | None = None, var_names: list[str] | None = None) -> dict[str, Any]:
    if len(code) > MAX_CODE_CHARS:
        return {"logs": [], "error": {"name": "Error", "message": "Kode terlalu panjang.", "line": None},
                "vars": {}, "results": [{"id": t["id"], "pass": False, "detail": "kode terlalu panjang", "ms": 0} for t in tests or []]}
    job = {"code": code, "tests": tests or [], "vars": var_names or [], "timeoutMs": settings.runner_timeout_ms}
    if configured():
        res = _post("/run", {"lang": "js-harness", "stdin": json.dumps(job)})
        r = res.get("run") or {}
        if r.get("timeout"):
            return _timeout_result(tests)
        try:
            return json.loads(r.get("stdout") or "")
        except ValueError as e:
            raise RunnerUnavailable(f"Runner gagal: {(r.get('stderr') or r.get('error') or '')[:300]}") from e
    return _run_local(job, tests)


def _run_local(job: dict[str, Any], tests: list[dict[str, Any]] | None) -> dict[str, Any]:
    cmd = [
        settings.node_bin,
        "--permission",
        f"--allow-fs-read={SANDBOX.parent}",
        "--max-old-space-size=64",
        "--disallow-code-generation-from-strings",
        str(SANDBOX),
    ]
    # a clean environment: the app's secrets (database URL, keys) never reach the learner's program
    env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "LANG": "C.UTF-8"}
    if os.name == "nt":
        env["SYSTEMROOT"] = os.environ.get("SYSTEMROOT", r"C:\Windows")
    try:
        proc = subprocess.run(
            cmd, input=json.dumps(job), capture_output=True, text=True, encoding="utf-8", env=env,
            timeout=settings.runner_timeout_ms / 1000 + 4,
        )
    except FileNotFoundError as e:
        raise RunnerUnavailable("Node.js tidak ditemukan di server.") from e
    except subprocess.TimeoutExpired:
        return _timeout_result(tests)
    if proc.returncode != 0 or not proc.stdout.strip():
        raise RunnerUnavailable(f"Runner gagal: {proc.stderr.strip()[:300]}")
    return json.loads(proc.stdout)


def error_text(err: dict[str, Any] | None) -> str:
    if not err:
        return ""
    line = f" · baris {err['line']}" if err.get("line") else ""
    return f"{err['name']}: {err['message']}{line}"


# ------------------------------------------------------------ any language
def execute(lang: str, code: str, stdin: str = "", tests: list[dict[str, Any]] | None = None, *,
            timeout: float | None = None, memory: int | None = None, files: dict[str, str] | None = None) -> dict[str, Any]:
    """Runs a program through the runner service and adds `error` (the one to show first),
    `diagnostics` (compiler messages for the gutter) and `ok`."""
    if lang not in LANG_IDS:
        raise ValueError(f"Bahasa tidak dikenal: {lang}")
    if not configured():
        raise RunnerUnavailable("Runner multi-bahasa belum aktif di server ini.")
    if len(code) > MAX_CODE_CHARS:
        raise ValueError("Kode terlalu panjang.")
    body: dict[str, Any] = {"lang": lang, "code": code, "stdin": stdin[:64_000]}
    if tests:
        body["tests"] = [{"id": str(t["id"]), "stdin": str(t.get("stdin", "")), "expect": str(t.get("expect", "")),
                          "match": t.get("match") or "trim"} for t in tests]
    if files:
        body["files"] = files
    if timeout:
        body["timeout"] = timeout
    if memory:
        body["memory"] = memory
    res = _post("/run", body)
    res["error"] = compilers.primary(lang, res)
    res["diagnostics"] = compilers.all_diagnostics(lang, res)
    comp_ok = not res.get("compile") or res["compile"].get("ok")
    runs = [res["run"]] if res.get("run") else res.get("tests", [])
    res["ok"] = bool(comp_ok) and all(r.get("exit") == 0 and not r.get("timeout") and not r.get("error") for r in runs)
    return res


def lines(text: str, limit: int = 400) -> list[str]:
    out = (text or "").replace("\r\n", "\n").split("\n")
    if out and out[-1] == "":
        out.pop()
    return out[:limit]


def _short(s: str, n: int = 60) -> str:
    s = (s or "").strip().replace("\n", " ⏎ ")
    return s if len(s) <= n else s[: n - 1] + "…"


def run_tests(lang: str | None, code: str, tests: list[dict[str, Any]], user_id: int | None = None, with_output: bool = False) -> dict[str, Any]:
    """Runs a challenge's or an exam question's tests in any language.

    JavaScript tests of the original kinds (expr, stdout_last, ...) use the harness; stdin → stdout
    tests (kind "io") go through the multi-language runner. Returns the harness shape:
    {logs, error, results: [{id, pass, detail, ms}], diagnostics}."""
    lang = lang or "javascript"
    io = [t for t in tests if t.get("kind") == "io"]
    if lang == "javascript" and not io:
        return run(code, tests)
    check_rate(user_id)
    res = execute(lang, code, tests=io)
    by_id = {t["id"]: t for t in io}
    results = []
    for r in res.get("tests", []):
        t = by_id.get(r["id"], {})
        if r.get("pass"):
            detail = ""
        elif r.get("skipped"):
            detail = "kode belum bisa dikompilasi"
        elif t.get("hidden"):
            detail = "tes tersembunyi belum lulus"
        elif r.get("timeout"):
            detail = "terlalu lama (mungkin loop tanpa akhir)"
        elif r.get("exit") not in (0, None):
            detail = "program berhenti karena error"
        else:
            detail = f'diharapkan "{_short(t.get("expect", ""))}", keluaranmu "{_short(r.get("stdout", "")) or "(kosong)"}"'
        row = {"id": r["id"], "pass": bool(r.get("pass")), "detail": detail, "ms": max(1, int(r.get("ms") or 1))}
        if with_output and not r.get("skipped"):
            row["got"] = (r.get("stdout") or "")[:2000]
        results.append(row)
    shown = next((r for r in res.get("tests", []) if not by_id.get(r["id"], {}).get("hidden") and not r.get("skipped")), None)
    return {"logs": lines(shown.get("stdout", ""), 60) if shown else [], "error": res.get("error"), "results": results,
            "diagnostics": res.get("diagnostics", [])}
