"""Reads compiler and runtime error output for every language into one shape:

    {"line": int | None, "col": int | None, "severity": "error" | "warning", "message": str, "code": str}

`primary()` picks the error the learner should see first ({name, message, line,
col, phase}); the editor marks its line and Orvi explains it (services/explain.py).
"""
from __future__ import annotations

import re
from typing import Any

Diag = dict[str, Any]

SIGNALS = {134: "Aborted", 136: "Arithmetic exception", 137: "Killed", 139: "Segmentation fault", 135: "Bus error"}


def _d(line: Any, col: Any, sev: str, msg: str, code: str = "") -> Diag:
    return {"line": int(line) if line else None, "col": int(col) if col else None, "severity": sev,
            "message": msg.strip(), "code": code}


# ------------------------------------------------------------ compilers ---
_GCC = re.compile(r"^(?:\./|/box/)?main\.(?:c|cpp):(\d+):(\d+): (fatal error|error|warning): (.+)$", re.M)
_LD = re.compile(r"undefined reference to [`'‘]([^'’`]+)['’`]")


def _gcc(text: str) -> list[Diag]:
    out = [_d(m[1], m[2], "error" if "error" in m[3] else "warning", re.sub(r"\s*\[-W[\w=-]+\]$", "", m[4]))
           for m in _GCC.finditer(text)]
    out += [_d(None, None, "error", f"undefined reference to '{m[1]}'", "ld") for m in _LD.finditer(text)]
    return out


_RUST_HEAD = re.compile(r"^(error|warning)(?:\[(E\d{4})\])?: (.+)$")
_RUST_AT = re.compile(r"^\s*--> (?:/box/)?main\.rs:(\d+):(\d+)")


def _rust(text: str) -> list[Diag]:
    out: list[Diag] = []
    pending: Diag | None = None
    for line in text.splitlines():
        h = _RUST_HEAD.match(line)
        if h:
            if pending and pending["message"]:
                out.append(pending)
            msg = h[3]
            if msg.startswith(("aborting due to", "could not compile")) or re.match(r"\d+ warnings? emitted", msg):
                pending = None
                continue
            pending = _d(None, None, h[1], msg, h[2] or "")
            continue
        a = _RUST_AT.match(line)
        if a and pending is not None and pending["line"] is None:
            pending["line"], pending["col"] = int(a[1]), int(a[2])
    if pending:
        out.append(pending)
    return out


_JAVAC = re.compile(r"^(\w+)\.java:(\d+): (error|warning): (.+)$")


def _javac(text: str) -> list[Diag]:
    out: list[Diag] = []
    lines = text.splitlines()
    for i, line in enumerate(lines):
        m = _JAVAC.match(line)
        if not m:
            continue
        msg, col = m[4], None
        # javac prints the source line, then a caret under the problem
        for j in range(i + 1, min(i + 3, len(lines))):
            if lines[j].strip() == "^":
                col = lines[j].index("^") + 1
                break
        sym = next((l.strip() for l in lines[i + 1:i + 6] if l.strip().startswith("symbol:")), "")
        if sym:
            msg = f"{msg} ({sym.split(':', 1)[1].strip()})"
        out.append(_d(m[2], col, m[3], msg))
    return out


_KOTLIN = re.compile(r"^(?:/box/)?main\.kt:(\d+):(\d+): (error|warning): (.+)$", re.M)


def _kotlin(text: str) -> list[Diag]:
    return [_d(m[1], m[2], m[3], m[4]) for m in _KOTLIN.finditer(text)]


_GO = re.compile(r"^(?:\./|/box/)?main\.go:(\d+):(\d+): (.+)$", re.M)


def _go(text: str) -> list[Diag]:
    return [_d(m[1], m[2], "error", m[3]) for m in _GO.finditer(text)]


COMPILE_PARSERS = {"c": _gcc, "cpp": _gcc, "rust": _rust, "java": _javac, "kotlin": _kotlin, "go": _go}


def compile_diagnostics(lang: str, text: str) -> list[Diag]:
    fn = COMPILE_PARSERS.get(lang)
    return fn(text) if fn else []


# ------------------------------------------------------------- runtime ---
_PY_FILE = re.compile(r'File "(?:/box/)?main\.py", line (\d+)')
_PY_ERR = re.compile(r"^(\w+(?:Error|Exception|Exit|Interrupt|Warning)|StopIteration)(?:: (.*))?$")
_JS_FIRST = re.compile(r"^(?:/box/)?main\.js:(\d+)$", re.M)
_JS_ERR = re.compile(r"^(\w*Error|Error)(?: \[[\w_]+\])?: (.*)$", re.M)
_JS_AT = re.compile(r"\((?:/box/)?main\.js:(\d+):(\d+)\)|at (?:/box/)?main\.js:(\d+):(\d+)")
_PHP = re.compile(r"^(?:PHP )?(Parse error|Fatal error|Warning|Notice|Deprecated): +(.+?) in (?:/box/)?main\.php(?: on line |:)(\d+)", re.M)
_JAVA_EX = re.compile(r'Exception in thread "main" ([\w.$]+)(?:: (.*))?')
_JAVA_AT = re.compile(r"\((\w+)\.(?:java|kt):(\d+)\)")
_RUST_PANIC = re.compile(r"panicked at (?:/box/)?main\.rs:(\d+):(\d+):\n(.+)")
_GO_PANIC = re.compile(r"^panic: (.+)$", re.M)
_GO_AT = re.compile(r"/box/main\.go:(\d+)")
_SQL = re.compile(r"^Error di baris (\d+): (.+)$", re.M)
_CPP_WHAT = re.compile(r"terminate called after throwing an instance of '([^']+)'\n\s*what\(\):\s*(.+)")


def runtime_error(lang: str, stderr: str, exit_code: int | None) -> dict[str, Any] | None:
    """{name, message, line, col} for a program that stopped with an error, or None."""
    s = stderr or ""
    if lang == "python":
        lines = [l for l in s.strip().splitlines() if l.strip()]
        name = msg = ""
        for l in reversed(lines):
            m = _PY_ERR.match(l.strip())
            if m:
                name, msg = m[1], m[2] or ""
                break
        if not name:
            return None
        at = _PY_FILE.findall(s)
        col = None
        return {"name": name, "message": msg, "line": int(at[-1]) if at else None, "col": col}
    if lang == "javascript":
        m = _JS_ERR.search(s)
        if not m:
            return None
        first = _JS_FIRST.search(s)
        at = _JS_AT.search(s)
        line = int(first[1]) if first else (int(at[1] or at[3]) if at else None)
        col = int(at[2] or at[4]) if at else None
        return {"name": m[1], "message": m[2], "line": line, "col": col}
    if lang == "php":
        found = list(_PHP.finditer(s))
        fatal = next((m for m in found if m[1] in ("Parse error", "Fatal error")), None)
        m = fatal or (found[0] if found else None)
        if not m:
            return None
        msg = re.sub(r"^Uncaught ", "", m[2])
        name = m[1]
        um = re.match(r"(\w*(?:Error|Exception)): (.*)", msg)
        if um:
            name, msg = um[1], um[2]
        return {"name": name, "message": msg, "line": int(m[3]), "col": None}
    if lang in ("java", "kotlin"):
        m = _JAVA_EX.search(s)
        if not m:
            return None
        at = _JAVA_AT.search(s)
        return {"name": m[1].split(".")[-1], "message": m[2] or "", "line": int(at[2]) if at else None, "col": None,
                "full": m[1]}
    if lang == "rust":
        m = _RUST_PANIC.search(s)
        if m:
            return {"name": "panic", "message": m[3].strip(), "line": int(m[1]), "col": int(m[2])}
    if lang == "go":
        m = _GO_PANIC.search(s)
        if m:
            at = _GO_AT.search(s)
            return {"name": "panic", "message": m[1].strip(), "line": int(at[1]) if at else None, "col": None}
    if lang == "sql":
        m = _SQL.search(s)
        if m:
            return {"name": "SQL error", "message": m[2], "line": int(m[1]), "col": None}
    if lang in ("c", "cpp"):
        m = _CPP_WHAT.search(s)
        if m:
            return {"name": m[1], "message": m[2].strip(), "line": None, "col": None}
    if exit_code in SIGNALS:
        return {"name": SIGNALS[exit_code], "message": f"kode keluar {exit_code}", "line": None, "col": None}
    return None


def primary(lang: str, res: dict[str, Any]) -> dict[str, Any] | None:
    """The single error to show first for a runner result (compile error, then the first failing run)."""
    comp = res.get("compile")
    if comp and not comp.get("ok"):
        if comp.get("timeout"):
            return {"name": "Timeout", "message": "Kompilasi terlalu lama.", "line": None, "col": None, "phase": "compile"}
        diags = [d for d in compile_diagnostics(lang, comp.get("stderr", "") + "\n" + comp.get("stdout", "")) if d["severity"] == "error"]
        if lang == "go":  # "declared and not used" is often a side effect of a typo reported after it
            diags.sort(key=lambda d: "not used" in d["message"])
        if diags:
            d = diags[0]
            name = f"error[{d['code']}]" if d["code"] and d["code"] != "ld" else "error"
            return {"name": name, "message": d["message"], "line": d["line"], "col": d["col"], "phase": "compile"}
        text = (comp.get("stderr") or comp.get("stdout") or comp.get("error") or "Kompilasi gagal.").strip().splitlines()
        return {"name": "error", "message": text[0][:300] if text else "Kompilasi gagal.", "line": None, "col": None, "phase": "compile"}
    runs = [res["run"]] if res.get("run") else [t for t in res.get("tests", []) if not t.get("skipped")]
    for r in runs:
        if r.get("error"):
            return {"name": "Runner", "message": r["error"], "line": None, "col": None, "phase": "run"}
        if r.get("timeout"):
            return {"name": "TimeoutError", "message": "Program berjalan terlalu lama (mungkin loop tanpa akhir).", "line": None, "col": None, "phase": "run"}
        if r.get("oom"):
            return {"name": "MemoryError", "message": "Program memakai memori melebihi batas.", "line": None, "col": None, "phase": "run"}
        if r.get("exit") not in (0, None):
            e = runtime_error(lang, r.get("stderr", ""), r.get("exit"))
            if e:
                return {**e, "phase": "run"}
            tail = (r.get("stderr") or "").strip().splitlines()
            return {"name": "Error", "message": tail[-1][:300] if tail else f"Program keluar dengan kode {r.get('exit')}.",
                    "line": None, "col": None, "phase": "run"}
        if lang == "php" and r.get("stderr"):  # PHP keeps running after a warning; still worth pointing out
            e = runtime_error(lang, r["stderr"], r.get("exit"))
            if e:
                return {**e, "phase": "run", "severity": "warning"}
    return None


def all_diagnostics(lang: str, res: dict[str, Any]) -> list[Diag]:
    """Every compiler message (errors and warnings) for the editor gutter."""
    comp = res.get("compile")
    if not comp:
        return []
    return compile_diagnostics(lang, (comp.get("stderr") or "") + "\n" + (comp.get("stdout") or ""))[:30]
