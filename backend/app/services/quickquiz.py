"""Turns pasted text or a CSV file into multiple-choice questions for the Studio.

Paste format (one question per block, blank line between blocks):

    Apa keluaran print(2**3)?
    - 6
    * 8
    - 9
    > 2**3 artinya 2 pangkat 3.

`*` or `+` marks the right option, `-` a wrong one, `>` an explanation, and a
``` fenced block becomes the question's code. "A. teks" options with a line
"Jawaban: B" work too. Returns questions plus a warning per block that needs a
look, so the mentor sees what went wrong before adding anything.
"""
from __future__ import annotations

import csv
import html
import io
import re
from typing import Any

_OPT = re.compile(r"^\s*([-*+])\s+(.*)$")
_LETTER = re.compile(r"^\s*([A-Ea-e])[.)]\s+(.*)$")
_KEY = re.compile(r"^\s*(?:jawaban|kunci|answer)\s*[:=]\s*([A-Ea-e]|.+)$", re.I)


def _blocks(text: str) -> list[list[str]]:
    blocks: list[list[str]] = []
    cur: list[str] = []
    fence = False
    for line in text.replace("\r\n", "\n").split("\n"):
        if line.strip().startswith("```"):
            fence = not fence
            cur.append(line)
            continue
        if not fence and not line.strip():
            if cur:
                blocks.append(cur)
                cur = []
            continue
        cur.append(line)
    if cur:
        blocks.append(cur)
    return blocks


def _question(lines: list[str]) -> tuple[dict[str, Any] | None, str]:
    text: list[str] = []
    code: list[str] = []
    opts: list[str] = []
    right: list[int] = []
    explain: list[str] = []
    key = None
    fence = False
    for line in lines:
        if line.strip().startswith("```"):
            fence = not fence
            continue
        if fence:
            code.append(line)
            continue
        m = _OPT.match(line)
        if m and (text or code):
            if m.group(1) in "*+":
                right.append(len(opts))
            opts.append(m.group(2).strip())
            continue
        m = _LETTER.match(line)
        if m and (text or code):
            opts.append(m.group(2).strip())
            continue
        m = _KEY.match(line)
        if m:
            key = m.group(1).strip()
            continue
        if line.lstrip().startswith(">"):
            explain.append(line.lstrip()[1:].strip())
            continue
        if opts:  # text after options continues the last option
            opts[-1] += " " + line.strip()
        else:
            text.append(line.strip())
    title = " ".join(t for t in text if t).strip()
    if key and not right:
        if len(key) == 1 and key.upper() in "ABCDE" and "ABCDE".index(key.upper()) < len(opts):
            right = ["ABCDE".index(key.upper())]
        else:
            right = [i for i, o in enumerate(opts) if o.strip().lower() == key.lower()]
    if not title:
        return None, "pertanyaannya kosong"
    if len(opts) < 2:
        return None, f"“{title[:40]}”: butuh minimal 2 pilihan"
    if len(right) != 1:
        return None, f"“{title[:40]}”: tandai tepat satu jawaban benar dengan *"
    q: dict[str, Any] = {"t": html.escape(title), "o": opts[:6], "a": right[0], "e": html.escape(" ".join(explain))}
    if code:
        q["c"] = "\n".join(code).strip("\n")
    return q, ""


def parse_text(text: str) -> dict[str, Any]:
    questions, warnings = [], []
    for block in _blocks(text or ""):
        q, warn = _question(block)
        if q:
            questions.append(q)
        elif warn:
            warnings.append(warn)
    return {"questions": questions[:200], "warnings": warnings}


_HEAD = {
    "t": ("pertanyaan", "soal", "question", "tanya"),
    "c": ("kode", "code"),
    "a": ("jawaban", "kunci", "answer", "benar"),
    "e": ("penjelasan", "explain", "pembahasan", "explanation"),
}


def parse_csv(text: str) -> dict[str, Any]:
    """CSV with a header row: pertanyaan, a, b, c, d, jawaban (A–D or the option text), penjelasan, kode."""
    sample = (text or "")[:2000]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    rows = list(csv.reader(io.StringIO(text or ""), dialect))
    if not rows:
        return {"questions": [], "warnings": ["berkas kosong"]}
    head = [h.strip().lower() for h in rows[0]]
    col: dict[str, int] = {}
    for key, names in _HEAD.items():
        for i, h in enumerate(head):
            if h in names:
                col[key] = i
    opt_cols = [i for i, h in enumerate(head) if h in ("a", "b", "c", "d", "e", "pilihan a", "pilihan b", "pilihan c", "pilihan d", "opsi a", "opsi b", "opsi c", "opsi d")]
    if "t" not in col or len(opt_cols) < 2 or "a" not in col:
        return {"questions": [], "warnings": ["kolom wajib: pertanyaan, a, b (dst.), jawaban"]}
    questions, warnings = [], []
    for n, r in enumerate(rows[1:], 2):
        get = lambda i: r[i].strip() if i < len(r) else ""  # noqa: E731
        title = get(col["t"])
        if not title:
            continue
        opts = [get(i) for i in opt_cols if get(i)]
        key = get(col["a"])
        if len(key) == 1 and key.upper() in "ABCDE" and "ABCDE".index(key.upper()) < len(opts):
            a = "ABCDE".index(key.upper())
        else:
            a = next((i for i, o in enumerate(opts) if o.lower() == key.lower()), -1)
        if len(opts) < 2 or a < 0:
            warnings.append(f"baris {n}: pilihan atau jawaban belum benar")
            continue
        q: dict[str, Any] = {"t": html.escape(title), "o": opts, "a": a, "e": html.escape(get(col["e"])) if "e" in col else ""}
        if "c" in col and get(col["c"]):
            q["c"] = get(col["c"]).replace("\\n", "\n")
        questions.append(q)
    return {"questions": questions[:500], "warnings": warnings}
