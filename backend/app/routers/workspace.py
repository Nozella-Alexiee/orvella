"""Playground notebooks, diagnostics and projects (milestones + mentor thread)."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Chapter, Klass, Message, Notebook, Project, ProjectProgress, ReviewComment, Submission, User, now
from ..security import current_user
from ..services import activity, badges, diagnostics, learning, runner, runtime, stacks
from ..views import ago, person

router = APIRouter(prefix="/api", tags=["workspace"])

TEMPLATES = {
    "tebak-angka": {
        "title": "Tebak angka (game)",
        "cells": [
            {"type": "note", "src": "Komputer memilih angka rahasia. Kita cek tebakan dengan <b>perbandingan</b>."},
            {"type": "code", "src": 'const rahasia = 7;\nlet tebakan = 5;\nconsole.log("Tebakan:", tebakan);\nconsole.log("Benar?", tebakan === rahasia);'},
        ],
    },
}


# Starter programs for the "Program" playground (one file, any language) and the stdin that goes with them.
STARTERS: dict[str, tuple[str, str]] = {
    "python": ('# input() membaca kotak Input, satu baris setiap kali\n'
               'nama = input()\nprint(f"Halo, {nama}! Selamat datang di Orvella.")\n\nfor i in range(1, 4):\n    print(f"Hitung {i}")\n', "Orvi"),
    "javascript": ('// Input dibaca dari kotak Input (satu baris per nilai)\n'
                   'const input = require("fs").readFileSync(0, "utf8").trim().split("\\n");\n'
                   'const nama = input[0] || "teman";\nconsole.log(`Halo, ${nama}! Selamat datang di Orvella.`);\n', "Orvi"),
    "php": ('<?php\n$nama = trim(fgets(STDIN)) ?: "teman";\necho "Halo, $nama! Selamat datang di Orvella.\\n";\n', "Orvi"),
    "c": ('#include <stdio.h>\n\nint main(void) {\n    char nama[50];\n    scanf("%49s", nama);\n'
          '    printf("Halo, %s! Selamat datang di Orvella.\\n", nama);\n    return 0;\n}\n', "Orvi"),
    "cpp": ('#include <iostream>\n#include <string>\nusing namespace std;\n\nint main() {\n    string nama;\n    cin >> nama;\n'
            '    cout << "Halo, " << nama << "! Selamat datang di Orvella." << endl;\n    return 0;\n}\n', "Orvi"),
    "rust": ('use std::io;\n\nfn main() {\n    let mut nama = String::new();\n    io::stdin().read_line(&mut nama).unwrap();\n'
             '    println!("Halo, {}! Selamat datang di Orvella.", nama.trim());\n}\n', "Orvi"),
    "go": ('package main\n\nimport "fmt"\n\nfunc main() {\n\tvar nama string\n\tfmt.Scan(&nama)\n'
           '\tfmt.Printf("Halo, %s! Selamat datang di Orvella.\\n", nama)\n}\n', "Orvi"),
    "java": ('import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n'
             '        Scanner in = new Scanner(System.in);\n        String nama = in.next();\n'
             '        System.out.println("Halo, " + nama + "! Selamat datang di Orvella.");\n    }\n}\n', "Orvi"),
    "kotlin": ('fun main() {\n    val nama = readln()\n    println("Halo, $nama! Selamat datang di Orvella.")\n}\n', "Orvi"),
    "sql": ("-- Database baru dibuat setiap kali dijalankan (SQLite di memori)\n"
            "CREATE TABLE siswa (id INTEGER PRIMARY KEY, nama TEXT, nilai INTEGER);\n"
            "INSERT INTO siswa (nama, nilai) VALUES ('Ana', 90), ('Budi', 78), ('Citra', 85);\n\n"
            "SELECT nama, nilai FROM siswa WHERE nilai >= 80 ORDER BY nilai DESC;\n", ""),
    "html": ('<!doctype html>\n<html>\n<head>\n  <style>\n    body { font-family: system-ui, sans-serif; background: #FFF8EC; color: #2B2350; padding: 24px; }\n'
             '    .halo { color: #E8930C; }\n    button { font: inherit; padding: 8px 16px; border-radius: 10px; border: 0; background: #2B2350; color: #fff; }\n'
             '  </style>\n</head>\n<body>\n  <h1 class="halo">Halo, Orvella!</h1>\n  <p>Ubah kode ini dan lihat hasilnya langsung.</p>\n'
             '  <button onclick="this.textContent = \'Diklik!\'">Klik aku</button>\n</body>\n</html>\n', ""),
    "css": ('.halo {\n  color: #E8930C;\n  font-size: 2.5rem;\n}\n\n.kartu {\n  padding: 16px 20px;\n  border-radius: 16px;\n'
            '  background: #fff;\n  box-shadow: 0 6px 0 #2B235022;\n}\n', ""),
}
PROGRAM_LANGS = tuple(STARTERS)


def _new_id() -> str:
    import secrets
    return secrets.token_hex(4)


def _nb_view(db: Session, nb: Notebook) -> dict[str, Any]:
    ch = db.get(Chapter, nb.attached_chapter_id) if nb.attached_chapter_id else None
    return {"id": nb.id, "title": nb.title, "cells": nb.cells or [], "updated": ago(nb.updated_at),
            "attached": learning.chapter_ref(ch) if ch else None, "kind": nb.kind or "notebook", "lang": nb.lang or "javascript",
            "files": nb.files or {}}


def _get_nb(db: Session, user: User, nb_id: int) -> Notebook:
    nb = db.get(Notebook, nb_id)
    if nb is None or nb.user_id != user.id:
        raise HTTPException(404, "Notebook tidak ditemukan.")
    return nb


@router.get("/notebooks")
def notebooks(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    rows = db.scalars(select(Notebook).where(Notebook.user_id == user.id).order_by(Notebook.updated_at.desc()))
    pm = learning.progress_map(db, user.id)
    attachable = [learning.chapter_ref(db.get(Chapter, cid)) for cid in pm]
    return {"items": [{"id": n.id, "title": n.title, "updated": ago(n.updated_at), "kind": n.kind or "notebook", "lang": n.lang or "javascript"}
                      for n in rows],
            "attachable": sorted(attachable, key=lambda c: c["number"]), "assist_cap": user.assist_cap}


class NotebookIn(BaseModel):
    title: str | None = None
    template: str | None = None
    kind: str = Field(default="notebook", pattern="^(notebook|program|web)$")
    lang: str = "javascript"
    stack: str | None = None


@router.post("/notebooks")
def create_notebook(body: NotebookIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    if body.kind == "web":
        stack = body.stack or "static"
        if stack not in stacks.STACKS:
            raise HTTPException(400, "Stack tidak dikenal.")
        nb = Notebook(user_id=user.id, title=(body.title or f"Proyek {stacks.STACKS[stack]['name']}")[:160], cells=[], kind="web", lang=stack,
                      files={"stack": stack, "files": stacks.template(stack)})
    elif body.kind == "program":
        if body.lang not in PROGRAM_LANGS:
            raise HTTPException(400, "Bahasa tidak dikenal.")
        code, stdin = STARTERS[body.lang]
        label = runtime.LABELS.get(body.lang, body.lang.upper())
        nb = Notebook(user_id=user.id, title=(body.title or f"Program {label} baru")[:160], cells=[], kind="program", lang=body.lang,
                      files={"code": code, "stdin": stdin})
    else:
        tpl = TEMPLATES.get(body.template or "")
        cells = [{**c, "id": _new_id()} for c in (tpl["cells"] if tpl else [])]
        nb = Notebook(user_id=user.id, title=(body.title or (tpl["title"] if tpl else "Notebook tanpa judul"))[:160], cells=cells,
                      kind="notebook", lang="javascript", files={})
    db.add(nb)
    db.commit()
    return _nb_view(db, nb)


@router.get("/notebooks/{nb_id}")
def get_notebook(nb_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    return _nb_view(db, _get_nb(db, user, nb_id))


class NotebookUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=160)
    cells: list[dict[str, Any]] | None = None
    files: dict[str, Any] | None = None
    lang: str | None = None
    attached_chapter_id: int | None = None
    detach: bool = False


@router.put("/notebooks/{nb_id}")
def update_notebook(nb_id: int, body: NotebookUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    nb = _get_nb(db, user, nb_id)
    if body.title is not None:
        nb.title = body.title.strip() or "Notebook tanpa judul"
    if body.cells is not None:
        clean = []
        for c in body.cells[:100]:
            if c.get("type") not in ("code", "note"):
                continue
            clean.append({"id": str(c.get("id") or _new_id())[:16], "type": c["type"], "src": str(c.get("src", ""))[:20000]})
        nb.cells = clean
    if body.files is not None and nb.kind == "program":
        nb.files = {"code": str(body.files.get("code", ""))[:runner.MAX_CODE_CHARS], "stdin": str(body.files.get("stdin", ""))[:8000]}
    if body.lang and nb.kind == "program" and body.lang in PROGRAM_LANGS:
        nb.lang = body.lang
    if body.detach:
        nb.attached_chapter_id = None
    elif body.attached_chapter_id is not None:
        if body.attached_chapter_id not in learning.progress_map(db, user.id):
            raise HTTPException(409, "Bab ini belum kamu buka.")
        nb.attached_chapter_id = body.attached_chapter_id
    nb.updated_at = now()
    activity.record_activity(db, user, 0)
    db.commit()
    return _nb_view(db, nb)


@router.delete("/notebooks/{nb_id}")
def delete_notebook(nb_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, bool]:
    nb = _get_nb(db, user, nb_id)
    if nb.kind == "web" and runner.configured():
        try:  # stop the server and drop the project's files and database
            runner.call("DELETE", f"/projects/p{nb.id}")
        except runner.RunnerUnavailable:
            pass
    db.delete(nb)
    db.commit()
    return {"ok": True}


class DiagnoseIn(BaseModel):
    code: str
    error: dict[str, Any]
    scope_code: str = ""
    where: str = "playground"  # playground | perkuat | pahami
    lang: str = "javascript"


@router.post("/diagnose")
def diagnose(body: DiagnoseIn, user: User = Depends(current_user)) -> dict[str, Any]:
    cap = user.assist_cap if body.where in ("playground", "perkuat") else 6
    return diagnostics.diagnose(body.code, body.error, body.scope_code, cap, body.lang)


# ------------------------------------------------------------ run any language
@router.get("/langs")
def langs(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    conf = runtime.get(db)
    return {"runner": runner.configured(), "langs": [{"id": l, "enabled": l not in conf["disabled"]} for l in runner.LANG_IDS],
            "starters": {k: {"code": v[0], "stdin": v[1]} for k, v in STARTERS.items()}}


class RunIn(BaseModel):
    lang: str
    code: str = Field(max_length=runner.MAX_CODE_CHARS)
    stdin: str = Field(default="", max_length=8000)


def run_view(res: dict[str, Any]) -> dict[str, Any]:
    r = res.get("run") or {}
    comp = res.get("compile")
    return {"ok": res.get("ok", False), "stdout": runner.lines(r.get("stdout", "")), "stderr": (r.get("stderr") or "")[:8000],
            "exit": r.get("exit"), "ms": r.get("ms"), "mem_kb": r.get("mem_kb"), "timeout": bool(r.get("timeout")), "oom": bool(r.get("oom")),
            "truncated": bool(r.get("truncated")),
            "compile": {"ok": comp.get("ok"), "ms": comp.get("ms"), "stderr": (comp.get("stderr") or comp.get("stdout") or "")[:8000]} if comp else None,
            "error": res.get("error"), "diagnostics": res.get("diagnostics", []), "total_ms": res.get("ms")}


@router.post("/run")
def run_program(body: RunIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    if body.lang not in runner.LANG_IDS:
        raise HTTPException(400, "Bahasa ini tidak dijalankan di server.")
    enabled, timeout, memory = runtime.limits(db, body.lang)
    if not enabled:
        raise HTTPException(409, "Bahasa ini sedang dinonaktifkan oleh admin.")
    try:
        runner.check_rate(user.id)
        res = runner.execute(body.lang, body.code, body.stdin, timeout=timeout, memory=memory)
    except runner.RateLimited as e:
        raise HTTPException(429, str(e)) from e
    except runner.RunnerUnavailable as e:
        raise HTTPException(503, str(e)) from e
    badges.after_run(user, body.lang, bool(res.get("ok")))
    activity.record_activity(db, user, 0)
    new = badges.evaluate(db, user, night=badges.is_night())
    db.commit()
    return {**run_view(res), "lencana_baru": new}


# ------------------------------------------------------------------ projects
def _project(db: Session, pid: int) -> Project:
    p = db.get(Project, pid)
    if p is None:
        raise HTTPException(404, "Proyek tidak ditemukan.")
    return p


def _unlocked(db: Session, user: User, proj: Project) -> bool:
    ch = db.scalar(select(Chapter).where(Chapter.path_id == proj.path_id, Chapter.kind == "chapter", Chapter.number == proj.unlock_after))
    if ch is None:
        return True
    p = learning.get_progress(db, user, ch)
    return bool(p and p.completed_at)


def _pp(db: Session, user: User, proj: Project, create: bool = True) -> ProjectProgress | None:
    pp = db.scalar(select(ProjectProgress).where(ProjectProgress.user_id == user.id, ProjectProgress.project_id == proj.id))
    if pp is None and create:
        starter = proj.milestones[0].get("starter", "") if proj.milestones else ""
        pp = ProjectProgress(user_id=user.id, project_id=proj.id, milestone=0, code=starter, status="work")
        db.add(pp)
        db.flush()
    return pp


def _mentor(db: Session, user: User) -> User | None:
    klass = db.get(Klass, user.class_id) if user.class_id else None
    return db.get(User, klass.mentor_id) if klass and klass.mentor_id else None


@router.get("/projects")
def projects(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    out = []
    for proj in db.scalars(select(Project).order_by(Project.number)):
        pp = _pp(db, user, proj, create=False)
        out.append({"id": proj.id, "title": proj.title, "number": proj.number, "unlocked": _unlocked(db, user, proj),
                    "after": proj.unlock_after, "status": pp.status if pp else None, "milestone": pp.milestone if pp else 0,
                    "milestones": len(proj.milestones)})
    return out


@router.get("/projects/{pid}")
def project(pid: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    proj = _project(db, pid)
    if user.role == "learner" and not _unlocked(db, user, proj):
        raise HTTPException(409, {"code": "locked", "message": f"Proyek ini terbuka setelah Bab {proj.unlock_after}.", "redirect": "/peta"})
    pp = _pp(db, user, proj)
    # opening the thread marks mentor messages and a pending review as read
    for m in db.scalars(select(Message).where(Message.learner_id == user.id, Message.project_id == proj.id, Message.author_id != user.id, Message.read.is_(False))):
        m.read = True
    db.commit()
    return _project_view(db, user, proj, pp)


def _project_view(db: Session, user: User, proj: Project, pp: ProjectProgress) -> dict[str, Any]:
    ms = proj.milestones
    cur_idx = min(pp.milestone, len(ms) - 1)
    cur = ms[cur_idx] if ms else {}
    last = pp.last_run or {}
    res_by_id = {r["id"]: r for r in last.get("results", [])}
    tests = [{"id": t["id"], "name": t["name"], "state": ("pass" if res_by_id[t["id"]]["pass"] else "fail") if t["id"] in res_by_id else "idle",
              "ms": res_by_id.get(t["id"], {}).get("ms"), "detail": res_by_id.get(t["id"], {}).get("detail", "")} for t in cur.get("tests", [])]
    reqs = []
    for r in cur.get("reqs", []):
        test_ids = r.get("tests", [])
        done = bool(test_ids) and all(res_by_id.get(t, {}).get("pass") for t in test_ids)
        reqs.append({"text": r["text"], "done": done})
    thread = [{"id": m.id, "author": person(db.get(User, m.author_id)), "me": m.author_id == user.id, "body": m.body, "ago": ago(m.created_at)}
              for m in db.scalars(select(Message).where(Message.learner_id == user.id, Message.project_id == proj.id).order_by(Message.created_at))]
    comments, new_comments = [], 0
    sub = db.scalar(select(Submission).where(Submission.user_id == user.id, Submission.project_id == proj.id,
                                             Submission.milestone == cur_idx).order_by(Submission.created_at.desc()))
    if sub and pp.status == "feedback":
        for c in db.scalars(select(ReviewComment).where(ReviewComment.submission_id == sub.id).order_by(ReviewComment.line)):
            comments.append({"line": c.line, "body": c.body, "author": person(db.get(User, c.author_id))})
        new_comments = len(comments)
    mentor = _mentor(db, user)
    return {
        "id": proj.id, "title": proj.title, "number": proj.number, "after": proj.unlock_after, "description": proj.description,
        "status": pp.status, "milestone": pp.milestone,
        "milestones": [{"title": m["title"], "topic": m.get("topic", ""),
                        "state": "done" if i < pp.milestone or pp.status == "portfolio" else ("now" if i == pp.milestone else "next"),
                        "meta": ("direview" if i < pp.milestone or pp.status == "portfolio" else ("sekarang" if i == pp.milestone else m.get("topic", "")))}
                       for i, m in enumerate(ms)],
        "current": {"index": cur_idx, "title": cur.get("title", ""), "reqs": reqs, "tests": tests, "filename": cur.get("filename", "main.js")},
        "code": pp.code, "logs": last.get("logs", []), "error": last.get("error"),
        "thread": thread, "comments": comments, "new_comments": new_comments,
        "mentor": person(mentor), "learner": person(user),
        "portfolio": {"published": pp.status == "portfolio", "summary": proj.milestones[-1].get("portfolio", {}) if ms else {}},
    }


class CodeIn(BaseModel):
    code: str


@router.put("/projects/{pid}/code")
def project_code(pid: int, body: CodeIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    proj = _project(db, pid)
    pp = _pp(db, user, proj)
    if pp.status in ("waiting", "portfolio"):
        raise HTTPException(409, "Kode terkunci selama menunggu review.")
    pp.code = body.code[:runner.MAX_CODE_CHARS]
    pp.updated_at = now()
    activity.record_activity(db, user, 0)
    db.commit()
    return {"saved": True}


@router.post("/projects/{pid}/run")
def project_run(pid: int, body: CodeIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    proj = _project(db, pid)
    pp = _pp(db, user, proj)
    cur = proj.milestones[min(pp.milestone, len(proj.milestones) - 1)]
    res = runner.run(body.code, cur.get("tests", []))
    if pp.status not in ("waiting", "portfolio"):
        pp.code = body.code[:runner.MAX_CODE_CHARS]
    pp.last_run = {"results": res["results"], "logs": res["logs"], "error": res["error"]}
    pp.updated_at = now()
    db.commit()
    return _project_view(db, user, proj, pp)


class ReviewReq(BaseModel):
    message: str = ""


@router.post("/projects/{pid}/review")
def project_review(pid: int, body: ReviewReq, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    proj = _project(db, pid)
    pp = _pp(db, user, proj)
    if pp.status in ("waiting", "portfolio"):
        raise HTTPException(409, "Review sudah diminta.")
    cur = proj.milestones[pp.milestone]
    res = runner.run(pp.code, cur.get("tests", []))
    passed = sum(1 for r in res["results"] if r["pass"])
    prev = db.scalar(select(Submission).where(Submission.user_id == user.id, Submission.project_id == proj.id,
                                              Submission.milestone == pp.milestone).order_by(Submission.created_at.desc()))
    sub = Submission(user_id=user.id, kind="milestone", project_id=proj.id, milestone=pp.milestone,
                     title=f"Proyek · {proj.title} · milestone {pp.milestone + 1}", filename=cur.get("filename", "main.js"),
                     code=pp.code, tests_passed=passed, tests_total=len(res["results"]), attempt_no=(prev.attempt_no + 1) if prev else 1,
                     error_line=(res.get("error") or {}).get("line"))
    db.add(sub)
    pp.status = "waiting"
    pp.last_run = {"results": res["results"], "logs": res["logs"], "error": res["error"]}
    if body.message.strip():
        db.add(Message(learner_id=user.id, author_id=user.id, project_id=proj.id, body=body.message.strip()[:2000],
                       context=f"Proyek {proj.title}", read=True))
    mentor = _mentor(db, user)
    if mentor:
        learning.notify(db, mentor.id, "review", f"{user.name} minta review", sub.title, "/mentor/review")
    db.commit()
    return _project_view(db, user, proj, pp)


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


@router.post("/projects/{pid}/messages")
def project_message(pid: int, body: MessageIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    proj = _project(db, pid)
    pp = _pp(db, user, proj)
    db.add(Message(learner_id=user.id, author_id=user.id, project_id=proj.id, body=body.body.strip(), context=f"Proyek {proj.title}", read=True))
    mentor = _mentor(db, user)
    if mentor:
        learning.notify(db, mentor.id, "message", f"Pesan dari {user.name}", body.body.strip()[:120], f"/mentor/siswa/{user.id}")
    db.commit()
    return _project_view(db, user, proj, pp)


class TraceIn(BaseModel):
    code: str = Field(max_length=8000)
    stdin: str = Field(default="", max_length=4000)


@router.post("/trace")
def trace(body: TraceIn, user: User = Depends(current_user)) -> dict[str, Any]:
    """Line-by-line memory steps of a Python program (Playground "Lihat memori")."""
    from .studio import trace as run_trace
    try:
        return run_trace(body.code, body.stdin, user.id)
    except runner.RateLimited as e:
        raise HTTPException(429, str(e)) from e
