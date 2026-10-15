"""Unduh & impor proyek Sandbox sebagai .zip.

Isi zip: berkas proyek apa adanya, `orvella.json` (judul, jenis, bahasa/stack, berkas utama, stdin,
database), dan `database.sql` kalau proyek web punya database. Impor menerima zip hasil unduhan
Orvella maupun zip biasa berisi kode (jenis proyek ditebak dari isinya).
"""
from __future__ import annotations

import io
import json
import posixpath
import zipfile
from typing import Any

from fastapi import HTTPException

from . import stacks
from .sandbox import ENTRY, FLAT_NAME, WEB_PATH

MANIFEST = "orvella.json"
DB_FILE = "database.sql"
MAX_ZIP = 2_000_000
MAX_ENTRIES = 120
MAX_FILE = 300_000
MAX_TOTAL = 2_600_000
MAX_SQL = 2_000_000
SKIP_DIRS = ("__MACOSX/", ".git/", "node_modules/", "__pycache__/", ".venv/", "venv/")
SKIP_NAMES = (".DS_Store", "Thumbs.db")
EXT_LANG = {"py": "python", "js": "javascript", "php": "php", "c": "c", "cpp": "cpp", "cc": "cpp", "rs": "rust", "go": "go",
            "java": "java", "kt": "kotlin", "sql": "sql"}


def build(nb_title: str, manifest: dict[str, Any], files: dict[str, str], sql: str | None) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(MANIFEST, json.dumps({"format": "orvella-sandbox", "version": 1, "title": nb_title, **manifest}, ensure_ascii=False, indent=2))
        for path, body in sorted(files.items()):
            z.writestr(path, body)
        if sql:
            z.writestr(DB_FILE, sql)
    return buf.getvalue()


def _read(z: zipfile.ZipFile) -> tuple[dict[str, str], dict[str, Any] | None, str | None, list[str]]:
    infos = [i for i in z.infolist() if not i.is_dir()]
    if len(infos) > MAX_ENTRIES:
        raise HTTPException(400, f"Isi zip terlalu banyak (maksimal {MAX_ENTRIES} berkas).")
    if sum(i.file_size for i in infos) > MAX_TOTAL:
        raise HTTPException(413, "Isi zip terlalu besar setelah dibuka.")
    names = [i.filename.replace("\\", "/") for i in infos]
    # zip dari GitHub/Finder biasanya punya satu folder induk: buang
    tops = {n.split("/", 1)[0] for n in names if not n.startswith(SKIP_DIRS)}
    strip = next(iter(tops)) + "/" if len(tops) == 1 and all("/" in n for n in names if not n.startswith(SKIP_DIRS)) else ""
    files: dict[str, str] = {}
    manifest, sql, skipped = None, None, []
    for info, raw in zip(infos, names):
        name = raw[len(strip):] if strip and raw.startswith(strip) else raw
        if not name or name.startswith(SKIP_DIRS) or any(f"/{d}" in f"/{name}" for d in SKIP_DIRS) or posixpath.basename(name) in SKIP_NAMES:
            continue
        norm = posixpath.normpath(name)
        if norm.startswith(("../", "/")) or norm == ".." or ".." in norm.split("/"):
            raise HTTPException(400, f"Nama berkas di zip tidak aman: {name}")
        limit = MAX_SQL if norm in (DB_FILE, MANIFEST) else MAX_FILE
        with z.open(info) as fh:
            data = fh.read(limit + 1)
        if len(data) > limit:
            raise HTTPException(413, f"{norm} terlalu besar.")
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            skipped.append(norm)  # gambar & berkas biner tidak disimpan di Sandbox
            continue
        if norm == MANIFEST:
            try:
                manifest = json.loads(text)
            except ValueError:
                raise HTTPException(400, "orvella.json di dalam zip rusak.") from None
        elif norm == DB_FILE:
            sql = text
        else:
            files[norm] = text
    return files, manifest, sql, skipped


def guess(files: dict[str, str]) -> dict[str, Any]:
    """Jenis proyek dari isinya, untuk zip tanpa orvella.json."""
    names = set(files)
    has = lambda *xs: any(x in names for x in xs)  # noqa: E731
    if has("server.js", "app.js") and any(n.endswith(".js") for n in names) and any(n.endswith((".html", ".json")) or n.startswith("public/") for n in names):
        return {"kind": "web", "stack": "node"}
    if any(n.endswith(".php") for n in names) and (has("public/index.php") or len([n for n in names if n.endswith(".php")]) > 1):
        return {"kind": "web", "stack": "php"}
    if has("app.py") and any(n.startswith("templates/") for n in names):
        return {"kind": "web", "stack": "flask"}
    if has("main.py") and any(n.startswith("static/") for n in names) and "fastapi" in files.get("main.py", "").lower():
        return {"kind": "web", "stack": "fastapi"}
    if any(n.endswith(".html") for n in names):
        return {"kind": "web", "stack": "static"}
    for n in sorted(names, key=lambda x: (not x.startswith("main."), x)):
        lang = EXT_LANG.get(n.rsplit(".", 1)[-1].lower())
        if lang:
            return {"kind": "program", "lang": lang}
    raise HTTPException(400, "Isi zip tidak dikenali. Sertakan index.html, server.js, app.py, atau main.<bahasa>.")


def parse(data: bytes) -> dict[str, Any]:
    """Zip → {kind, lang, stack, title, description, entry, stdin, files, db_seed, skipped}."""
    if len(data) > MAX_ZIP:
        raise HTTPException(413, "Berkas .zip terlalu besar (maksimal 2 MB).")
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise HTTPException(400, "Berkas ini bukan .zip yang valid.") from None
    with z:
        files, manifest, sql, skipped = _read(z)
    if not files:
        raise HTTPException(400, "Tidak ada berkas kode di dalam zip.")
    m = manifest if isinstance(manifest, dict) and manifest.get("format") == "orvella-sandbox" else {}
    kind = m.get("kind") if m.get("kind") in ("program", "web") else None
    meta = {"kind": kind, "lang": m.get("lang"), "stack": m.get("stack")} if kind else guess(files)
    out: dict[str, Any] = {"kind": meta["kind"], "title": str(m.get("title") or "")[:160], "description": str(m.get("description") or "")[:600],
                           "stdin": str(m.get("stdin") or "")[:8000], "skipped": skipped, "db_seed": None}
    if meta["kind"] == "web":
        stack = meta.get("stack") if meta.get("stack") in stacks.STACKS else "static"
        bad = [p for p in files if not WEB_PATH.match(p)]
        if bad:
            raise HTTPException(400, f"Nama berkas tidak valid: {bad[0]}")
        out.update(stack=stack, lang=stack, files=files)
        db = m.get("db") if isinstance(m.get("db"), dict) else {}
        if sql and sql.strip():
            out["db_seed"] = {"sql": sql, "file": str(db.get("file") or "")[:120]}
        return out
    lang = meta.get("lang") if meta.get("lang") in ENTRY else "python"
    flat: dict[str, str] = {}
    for p, body in files.items():  # program: berkas datar; folder diratakan
        base = posixpath.basename(p)
        if not FLAT_NAME.match(base) or base in flat:
            continue
        flat[base] = body
    entry = ENTRY[lang]
    if entry not in flat:
        cand = next((n for n in flat if n.rsplit(".", 1)[-1].lower() in [k for k, v in EXT_LANG.items() if v == lang]), None)
        if cand is None:
            raise HTTPException(400, f"Berkas utama {entry} tidak ada di dalam zip.")
        flat[entry] = flat.pop(cand)
    out.update(lang=lang, stack=None, files=flat, entry=entry)
    return out
