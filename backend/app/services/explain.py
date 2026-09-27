"""Orvi's plain-language explanations for errors in every language (rule based,
never a chatbot). Input is the primary error from services/compilers.py:
{name, message, line, col, phase}. Output follows diagnostics.diagnose():
{available, level, text, fix?: {label, code}, line}. JavaScript keeps its own
rules in diagnostics.py.
"""
from __future__ import annotations

import html
import re
from typing import Any, Callable

from .diagnostics import nearest


def _m(s: str) -> str:
    return f'<span class="t-mono">{html.escape(str(s))}</span>'


def _ok(text: str, line: int | None = None, fix: dict[str, str] | None = None) -> dict[str, Any]:
    out: dict[str, Any] = {"available": True, "level": 2, "text": text, "line": line}
    if fix:
        out["fix"] = fix
    return out


def _swap(code: str, old: str, new: str, sigil: str = "") -> str:
    return re.sub(rf"(?<![\w$]){re.escape(sigil + old)}\b", sigil + new, code)


def _line(code: str, n: int | None) -> str:
    lines = code.split("\n")
    return lines[n - 1] if n and 1 <= n <= len(lines) else ""


def _set_line(code: str, n: int, text: str) -> str:
    lines = code.split("\n")
    lines[n - 1] = text
    return "\n".join(lines)


def _prev_code_line(code: str, n: int, comment: str = "//") -> int | None:
    lines = code.split("\n")
    for i in range(min(n, len(lines)) - 1, 0, -1):
        t = lines[i - 1].strip()
        if t and not t.startswith(comment):
            return i
    return None


def _semicolon_fix(code: str, line: int | None, col: int | None, comment: str = "//") -> tuple[int | None, dict[str, str] | None]:
    """Where the missing `;` belongs: the reported line if the error points past its code,
    otherwise the previous line that has code."""
    if not line:
        return None, None
    text = _line(code, line)
    target = line
    before = text[: (col or 1) - 1] if col else text
    if not before.strip() or (col and col - 1 <= len(text) - len(text.lstrip())):
        target = _prev_code_line(code, line, comment) or line
    t = _line(code, target)
    stripped = t.rstrip()
    if not stripped or stripped.endswith((";", "{", "}", ",")):
        return target, None
    return target, {"label": f"Tambahkan ; di baris {target}", "code": _set_line(code, target, stripped + ";")}


# -------------------------------------------------------- name collectors
PY_BUILTINS = ["print", "input", "int", "str", "float", "len", "range", "list", "dict", "set", "tuple", "sum", "min", "max",
               "abs", "round", "sorted", "enumerate", "zip", "open", "type", "isinstance", "bool", "True", "False", "None"]
C_FUNCS = ["printf", "scanf", "puts", "gets", "fgets", "putchar", "getchar", "strlen", "strcpy", "strcmp", "strcat", "malloc",
           "free", "sqrt", "pow", "abs", "rand", "srand", "main", "cout", "cin", "endl", "vector", "string"]
PHP_FUNCS = ["echo", "print", "strlen", "count", "str_repeat", "strtoupper", "strtolower", "implode", "explode", "array_push",
             "in_array", "round", "intval", "floatval", "printf", "sprintf", "var_dump", "print_r", "trim", "fgets", "intdiv", "sort"]
SQL_WORDS = ["SELECT", "FROM", "WHERE", "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "CREATE", "TABLE", "DROP",
             "ORDER", "GROUP", "BY", "HAVING", "JOIN", "LEFT", "INNER", "ON", "AS", "AND", "OR", "NOT", "NULL", "LIMIT",
             "PRIMARY", "KEY", "INTEGER", "TEXT", "REAL", "DISTINCT", "COUNT", "SUM", "AVG", "MIN", "MAX", "LIKE", "BETWEEN", "IN"]


def _names(lang: str, code: str) -> list[str]:
    pats = {
        "python": [r"^\s*([A-Za-z_]\w*)\s*(?:[+\-*/%]|//|\*\*)?=(?!=)", r"\bfor\s+([A-Za-z_]\w*)", r"\bdef\s+([A-Za-z_]\w*)",
                   r"\bclass\s+([A-Za-z_]\w*)", r"\bimport\s+([A-Za-z_]\w*)", r"\bas\s+([A-Za-z_]\w*)",
                   r"\bdef\s+\w+\(([^)]*)\)"],
        "c": [r"\b(?:int|long|short|char|float|double|bool|unsigned|size_t|auto|string|std::string)\s*\*?\s*([A-Za-z_]\w*)",
              r"\b([A-Za-z_]\w*)\s*\([^;{}]*\)\s*\{"],
        "rust": [r"\blet\s+(?:mut\s+)?([a-z_]\w*)", r"\bfn\s+([a-z_]\w*)", r"\bfor\s+([a-z_]\w*)\s+in", r"\b([a-z_]\w*)\s*:\s*&?(?:mut\s+)?[A-Za-z]"],
        "go": [r"\b([A-Za-z_]\w*)\s*(?:,\s*[A-Za-z_]\w*\s*)?:=", r"\bvar\s+([A-Za-z_]\w*)", r"\bfunc\s+([A-Za-z_]\w*)",
               r"\bfor\s+([A-Za-z_]\w*)\s*,"],
        "java": [r"\b(?:int|long|double|float|boolean|char|byte|short|String|var|[A-Z]\w*(?:<[^>]*>)?(?:\[\])*)\s+([a-z_]\w*)\s*(?:=|;|:|,|\))",
                 r"\bvoid\s+([a-z_]\w*)"],
        "kotlin": [r"\b(?:val|var)\s+([A-Za-z_]\w*)", r"\bfun\s+([A-Za-z_]\w*)", r"\bfor\s*\(\s*([A-Za-z_]\w*)\s+in"],
        "php": [r"\$([A-Za-z_]\w*)"],
    }.get("c" if lang == "cpp" else lang, [])
    seen: list[str] = []
    for p in pats:
        for m in re.finditer(p, code, re.M):
            for part in re.split(r"[,\s=:]+", m.group(1)):
                part = part.strip().lstrip("*&")
                if re.fullmatch(r"[A-Za-z_]\w*", part) and part not in seen:
                    seen.append(part)
    return seen


def _sql_names(code: str) -> tuple[list[str], list[str]]:
    tables, cols = [], []
    for m in re.finditer(r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\((.*?)\)\s*;", code, re.I | re.S):
        tables.append(m.group(1))
        for part in m.group(2).split(","):
            w = part.strip().split()
            if w and w[0].upper() not in ("PRIMARY", "FOREIGN", "UNIQUE", "CHECK", "CONSTRAINT"):
                cols.append(w[0])
    return tables, cols


def _missing(lang: str, code: str, name: str, line: int | None, extra: list[str] | None = None, sigil: str = "",
             what: str = "Variabel") -> dict[str, Any]:
    guess = nearest(name, _names(lang, code) + (extra or []))
    if guess:
        return _ok(f"{what} {_m(sigil + name)} tidak dikenal di sini. Mungkin maksudmu {_m(sigil + guess)}?", line,
                   {"label": f"Perbaiki jadi {sigil}{guess}", "code": _swap(code, name, guess, sigil)})
    return _ok(f"{what} {_m(sigil + name)} belum pernah dibuat (atau ejaannya berbeda). Buat dulu sebelum dipakai, "
               "dan cek huruf besar kecilnya.", line)


# ------------------------------------------------------------ languages
def _python(code: str, e: dict[str, Any]) -> dict[str, Any] | None:
    name, msg, line = e["name"], e.get("message", ""), e.get("line")
    if name == "NameError":
        m = re.search(r"name '(\w+)' is not defined", msg)
        if m:
            n = m.group(1)
            special = {"true": "True", "false": "False", "null": "None", "none": "None", "nil": "None"}.get(n.lower())
            if special and special != n:
                return _ok(f"Di Python, nilai ini ditulis {_m(special)} dengan huruf besar di depan, bukan {_m(n)}.", line,
                           {"label": f"Perbaiki jadi {special}", "code": _swap(code, n, special)})
            return _missing("python", code, n, line, PY_BUILTINS)
    if name in ("IndentationError", "TabError"):
        if "expected an indented block" in msg:
            return _ok("Setelah baris yang diakhiri titik dua (:), baris berikutnya harus menjorok ke dalam (4 spasi). "
                       "Python memakai indentasi untuk menandai isi blok.", line)
        if "unexpected indent" in msg:
            return _ok("Baris ini menjorok ke dalam padahal bukan isi blok. Samakan posisinya dengan baris di atasnya.", line)
        return _ok("Jarak menjorok (indentasi) baris ini tidak cocok dengan baris lain di blok yang sama. "
                   "Pakai 4 spasi untuk setiap tingkat dan jangan campur spasi dengan tab.", line)
    if name == "SyntaxError":
        if "expected ':'" in msg:
            t = _line(code, line)
            fix = {"label": f"Tambahkan : di baris {line}", "code": _set_line(code, line, t.rstrip() + ":")} if t.strip() and not t.rstrip().endswith(":") else None
            return _ok(f"Baris yang diawali {_m('if')}, {_m('for')}, {_m('while')}, {_m('def')} atau {_m('else')} harus diakhiri titik dua {_m(':')}.", line, fix)
        if "unterminated string" in msg or "EOL while scanning" in msg:
            return _ok("Ada teks yang tanda kutipnya belum ditutup. Pastikan setiap teks diawali dan diakhiri kutip yang sama.", line)
        if "was never closed" in msg:
            m = re.search(r"'(.)' was never closed", msg)
            return _ok(f"Tanda {_m(m.group(1) if m else '(')} di baris ini belum ditutup.", line)
        if "unmatched" in msg:
            return _ok("Ada tanda kurung penutup yang tidak punya pasangan pembuka. Hitung lagi kurung buka dan tutupnya.", line)
        if "forgot a comma" in msg:
            return _ok("Sepertinya ada koma yang hilang di antara dua nilai.", line)
        if "'=' " in msg or "Maybe you meant '==' " in msg or "cannot assign" in msg:
            return _ok(f"Untuk membandingkan pakai {_m('==')}. Satu tanda {_m('=')} artinya mengisi variabel.", line)
        if "print" in msg and "parentheses" in msg:
            return _ok(f"Di Python 3, {_m('print')} adalah fungsi, jadi isinya harus di dalam kurung: {_m('print(\"halo\")')}.", line)
        return _ok("Python tidak bisa membaca susunan kode di baris ini. Cek tanda kurung, kutip, titik dua dan koma di sekitarnya.", line)
    if name == "TypeError":
        if "can only concatenate str" in msg or ("unsupported operand" in msg and "'str'" in msg):
            return _ok(f"Teks dan angka tidak bisa langsung digabung dengan {_m('+')}. Ubah angkanya jadi teks dengan {_m('str(x)')}, "
                       f"atau pakai f-string: {_m('f\"Skor: {skor}\"')}. Kalau nilainya dari {_m('input()')}, ubah dulu dengan {_m('int(...)')}.", line)
        if "not callable" in msg:
            return _ok("Kamu memanggil sesuatu yang bukan fungsi (dengan tanda kurung). Mungkin nama variabelnya sama dengan nama fungsi.", line)
        if "argument" in msg:
            return _ok(f"Jumlah atau jenis nilai yang kamu kirim ke fungsi tidak sesuai. Pesannya: {_m(msg)}.", line)
    if name == "ValueError" and "invalid literal for int()" in msg:
        return _ok(f"{_m('int()')} hanya bisa mengubah teks yang berisi angka. Cek isi input atau teks yang kamu ubah.", line)
    if name == "ZeroDivisionError":
        return _ok("Ada pembagian dengan nol. Cek dulu pembaginya dengan if sebelum membagi.", line)
    if name == "IndexError":
        return _ok("Kamu mengambil posisi yang tidak ada di list. Indeks dimulai dari 0, jadi indeks terakhir adalah "
                   f"{_m('len(daftar) - 1')}.", line)
    if name == "KeyError":
        return _ok(f"Kunci {_m(msg)} tidak ada di dictionary. Cek ejaannya, atau pakai {_m('.get(kunci)')} yang tidak error.", line)
    if name == "AttributeError":
        m = re.search(r"'(\w+)' object has no attribute '(\w+)'", msg)
        if m:
            hint = {"push": "append", "length": "len(...)", "size": "len(...)", "toUpperCase": "upper", "toLowerCase": "lower",
                    "add": "append"}.get(m.group(2))
            extra = f" Mungkin maksudmu {_m(hint)}?" if hint else ""
            return _ok(f"Nilai bertipe {_m(m.group(1))} tidak punya {_m(m.group(2))}.{extra}", line)
    if name == "EOFError":
        return _ok(f"Program memanggil {_m('input()')} tapi inputnya sudah habis. Isi kotak <b>Input</b> di bawah editor, satu baris untuk tiap input().", line)
    if name in ("ModuleNotFoundError", "ImportError"):
        return _ok("Modul itu tidak tersedia di sandbox Orvella. Pakai modul bawaan Python (math, random, datetime, dan lain-lain).", line)
    if name == "RecursionError":
        return _ok("Fungsi memanggil dirinya sendiri terus tanpa berhenti. Pastikan ada kondisi dasar (base case) yang menghentikannya.", line)
    return None


def _clike(lang: str, code: str, e: dict[str, Any]) -> dict[str, Any] | None:
    msg, line, col = e.get("message", ""), e.get("line"), e.get("col")
    if re.search(r"expected ['‘]?;['’]?|expected ',' or ';'", msg):
        target, fix = _semicolon_fix(code, line, col)
        return _ok(f"Ada titik koma {_m(';')} yang hilang di akhir baris {target or line}. Di {'C' if lang == 'c' else 'C++'} setiap perintah diakhiri {_m(';')}.", target or line, fix)
    m = re.search(r"['‘](\w+)['’] undeclared|['‘](\w+)['’] was not declared in this scope", msg)
    if m:
        n = m.group(1) or m.group(2)
        if n in ("cout", "cin", "endl", "string", "vector") and lang == "cpp":
            return _ok(f"{_m(n)} ada di dalam namespace {_m('std')}. Tulis {_m('std::' + n)}, atau tambahkan "
                       f"{_m('using namespace std;')} setelah {_m('#include')}.", line)
        if n in ("printf", "scanf", "puts") and "#include" not in code:
            return _ok(f"{_m(n)} ada di pustaka {_m('stdio.h')}. Tambahkan {_m('#include <stdio.h>')} di baris paling atas.", line)
        return _missing(lang, code, n, line, C_FUNCS)
    m = re.search(r"implicit declaration of function ['‘](\w+)['’]", msg)
    if m:
        n = m.group(1)
        guess = nearest(n, C_FUNCS + _names(lang, code))
        if guess:
            return _ok(f"Fungsi {_m(n)} tidak dikenal. Mungkin maksudmu {_m(guess)}?", line,
                       {"label": f"Perbaiki jadi {guess}", "code": _swap(code, n, guess)})
        return _ok(f"Fungsi {_m(n)} dipakai sebelum dibuat, atau lupa {_m('#include')} pustakanya.", line)
    if "undefined reference to" in msg:
        m = re.search(r"'(\w+)'", msg)
        return _ok(f"Fungsi {_m(m.group(1) if m else '?')} disebut tapi isinya tidak pernah ditulis. Cek ejaan dan pastikan fungsinya dibuat.", line)
    if "expected '}' at end of input" in msg or "expected declaration or statement at end of input" in msg:
        return _ok(f"Ada kurung kurawal {_m('{')} yang belum ditutup. Hitung lagi pasangan {_m('{')} dan {_m('}')}.", line)
    if "missing terminating" in msg:
        return _ok("Ada teks yang tanda kutipnya belum ditutup.", line)
    if "read-only variable" in msg or "assignment of read-only" in msg:
        return _ok(f"Variabel ini dibuat dengan {_m('const')}, jadi isinya tidak boleh diganti. Hapus {_m('const')} kalau nilainya memang perlu berubah.", line)
    if re.search(r"format '%\w+' expects argument of type", msg):
        return _ok(f"Kode format di {_m('printf')} tidak cocok dengan tipe nilainya. Pakai {_m('%d')} untuk int, {_m('%f')} untuk double, {_m('%s')} untuk teks, {_m('%c')} untuk karakter.", line)
    if "invalid operands" in msg or "no match for 'operator" in msg:
        return _ok("Operator ini tidak bisa dipakai untuk dua tipe data tersebut. Cek tipe kedua nilai yang dihitung.", line)
    if "cannot convert" in msg or "incompatible types" in msg:
        return _ok("Tipe nilainya tidak cocok dengan tipe variabel atau parameter yang diminta.", line)
    if "control reaches end of non-void function" in msg:
        return _ok(f"Fungsi ini harus mengembalikan nilai, tapi ada jalur yang selesai tanpa {_m('return')}.", line)
    name = e.get("name", "")
    if name == "Segmentation fault":
        return _ok("Program mengakses memori yang bukan miliknya, biasanya karena indeks array di luar batas atau pointer yang masih NULL. "
                   "Cek batas perulangan dan isi pointer.", line)
    if name == "Arithmetic exception":
        return _ok("Ada pembagian bilangan bulat dengan nol. Cek pembaginya sebelum membagi.", line)
    if name == "Aborted":
        return _ok(f"Program dihentikan paksa, biasanya karena {_m('assert')} gagal atau error yang tidak ditangani.", line)
    if "out_of_range" in name:
        return _ok(f"Indeks di luar batas ({_m('.at()')} menolak posisi yang tidak ada). Indeks terakhir adalah {_m('size() - 1')}.", line)
    return None


def _rust(code: str, e: dict[str, Any]) -> dict[str, Any] | None:
    name, msg, line = e.get("name", ""), e.get("message", ""), e.get("line")
    code_id = re.search(r"E\d{4}", name)
    cid = code_id.group(0) if code_id else ""
    if cid == "E0384" or "cannot assign twice to immutable variable" in msg:
        m = re.search(r"`(\w+)`", msg)
        n = m.group(1) if m else None
        fix = None
        if n and re.search(rf"\blet\s+{n}\b", code):
            fix = {"label": f"Ubah jadi let mut {n}", "code": re.sub(rf"\blet\s+{n}\b", f"let mut {n}", code, count=1)}
        return _ok(f"Di Rust, variabel tidak bisa diubah kecuali dibuat dengan {_m('mut')}. "
                   f"Tulis {_m(f'let mut {n or 'x'}')} kalau nilainya memang perlu berubah.", line, fix)
    if cid == "E0596":
        m = re.search(r"borrow `(\w+)` as mutable", msg)
        n = m.group(1) if m else None
        fix = {"label": f"Ubah jadi let mut {n}", "code": re.sub(rf"\blet\s+{n}\b", f"let mut {n}", code, count=1)} if n and re.search(rf"\blet\s+{n}\b", code) else None
        return _ok(f"Untuk mengubah isi {_m(n or 'variabel')} (misalnya {_m('push')}), variabelnya harus dibuat dengan {_m('let mut')}.", line, fix)
    if cid == "E0425":
        m = re.search(r"cannot find (?:value|function) `(\w+)`", msg)
        if m:
            return _missing("rust", code, m.group(1), line)
    if cid in ("E0382",) or "use of moved value" in msg or "borrow of moved value" in msg:
        m = re.search(r"`(\w+)`", msg)
        n = m.group(1) if m else "nilai"
        return _ok(f"{_m(n)} sudah <b>dipindahkan</b> (move) ke variabel atau fungsi lain, jadi pemilik lamanya tidak boleh memakainya lagi. "
                   f"Pinjam saja dengan {_m('&' + n)}, atau buat salinan dengan {_m(n + '.clone()')}.", line)
    if cid in ("E0502", "E0499", "E0506"):
        return _ok("Aturan peminjaman Rust: pada satu waktu boleh banyak peminjam baca (&) <b>atau</b> satu peminjam ubah (&mut), tidak keduanya. "
                   "Selesaikan dulu pemakaian pinjaman yang lama sebelum mengubah nilainya.", line)
    if cid == "E0308":
        m = re.search(r"expected `?([^`,]+)`?, found `?([^`]+)`?", msg)
        detail = f" Diminta {_m(m.group(1))}, tapi yang diberikan {_m(m.group(2))}." if m else ""
        return _ok(f"Tipe datanya tidak cocok.{detail} Untuk mengubah teks jadi angka pakai {_m('.trim().parse::<i32>()')}.", line)
    if cid == "E0599":
        return _ok(f"Metode itu tidak ada untuk tipe ini. Cek ejaannya. Pesan lengkapnya: {_m(msg)}.", line)
    if cid == "E0433":
        return _ok(f"Nama itu tidak ditemukan. Mungkin lupa baris {_m('use')} di atas, misalnya {_m('use std::io;')}.", line)
    if msg.startswith("expected `;`") or "expected one of" in msg and "`;`" in msg:
        target, fix = _semicolon_fix(code, line, e.get("col"))
        return _ok(f"Perintah di baris {target or line} harus diakhiri titik koma {_m(';')}.", target or line, fix)
    if name == "panic":
        if "overflow" in msg:
            return _ok("Hasil hitungan melewati batas tipe angkanya (overflow). Pakai tipe yang lebih besar, misalnya i64.", line)
        if "index out of bounds" in msg:
            return _ok("Kamu mengambil posisi yang tidak ada. Indeks dimulai dari 0, jadi indeks terakhir adalah " + _m("len() - 1") + ".", line)
        if "divide by zero" in msg:
            return _ok("Ada pembagian dengan nol. Cek pembaginya dulu.", line)
        if "unwrap()" in msg and "None" in msg:
            return _ok(f"{_m('unwrap()')} dipanggil pada {_m('None')} (nilainya tidak ada). Cek dulu dengan {_m('if let Some(x)')} atau {_m('match')}.", line)
        if "unwrap()" in msg and "Err" in msg:
            return _ok(f"{_m('unwrap()')} dipanggil pada hasil yang gagal ({_m('Err')}). Biasanya karena teks input bukan angka saat {_m('parse()')}. Jangan lupa {_m('.trim()')}.", line)
    return None


def _go(code: str, e: dict[str, Any]) -> dict[str, Any] | None:
    name, msg, line = e.get("name", ""), e.get("message", ""), e.get("line")
    m = re.match(r"declared and not used: (\w+)", msg)
    if m:
        return _ok(f"Go tidak mengizinkan variabel yang dibuat tapi tidak dipakai. Pakai {_m(m.group(1))}, hapus, atau ganti namanya dengan {_m('_')}.", line)
    m = re.match(r'"([\w/]+)" imported and not used', msg)
    if m:
        t = _line(code, line)
        fix = None
        if t.strip() in (f'"{m.group(1)}"', f'import "{m.group(1)}"'):
            lines = code.split("\n")
            del lines[line - 1]
            fix = {"label": f"Hapus import {m.group(1)}", "code": "\n".join(lines)}
        return _ok(f"Paket {_m(m.group(1))} di-import tapi tidak dipakai. Go menolak import yang tidak terpakai.", line, fix)
    m = re.match(r"undefined: (\w+)", msg)
    if m:
        return _missing("go", code, m.group(1), line, ["fmt", "Println", "Printf", "Scan", "Sprintf", "len", "append", "make"])
    if "no new variables on left side of :=" in msg:
        t = _line(code, line)
        return _ok(f"Variabel di kiri sudah pernah dibuat. Untuk mengganti isinya pakai {_m('=')}, bukan {_m(':=')}.", line,
                   {"label": "Ganti := jadi =", "code": _set_line(code, line, t.replace(":=", "=", 1))} if ":=" in t else None)
    if "missing return" in msg:
        return _ok(f"Fungsi ini menjanjikan nilai kembalian, tapi ada jalur yang selesai tanpa {_m('return')}.", line)
    if re.search(r"cannot use .* as .* value", msg):
        return _ok(f"Tipe datanya tidak cocok. Untuk teks ke angka pakai {_m('strconv.Atoi(s)')}, untuk angka ke teks {_m('strconv.Itoa(n)')}.", line)
    if "unexpected newline" in msg or ("syntax error" in msg and "{" in msg):
        return _ok(f"Di Go, kurung kurawal pembuka {_m('{')} harus di baris yang sama dengan {_m('if')}, {_m('for')} atau {_m('func')}.", line)
    if "non-declaration statement outside function body" in msg:
        return _ok(f"Perintah harus ditulis di dalam fungsi (misalnya {_m('func main()')}). Di luar fungsi hanya boleh deklarasi.", line)
    if name == "panic":
        if "index out of range" in msg:
            return _ok("Kamu mengambil posisi yang tidak ada di slice atau array. Indeks terakhir adalah " + _m("len(s) - 1") + ".", line)
        if "divide by zero" in msg:
            return _ok("Ada pembagian dengan nol. Cek pembaginya dulu.", line)
        if "nil map" in msg:
            return _ok(f"Map belum dibuat. Buat dulu dengan {_m('make(map[string]int)')} sebelum diisi.", line)
        if "nil pointer" in msg:
            return _ok("Pointer masih nil (belum menunjuk ke apa pun) tapi sudah dipakai.", line)
    return None


def _java(lang: str, code: str, e: dict[str, Any]) -> dict[str, Any] | None:
    name, msg, line = e.get("name", ""), e.get("message", ""), e.get("line")
    if msg.startswith("';' expected"):
        t = _line(code, line)
        fix = {"label": f"Tambahkan ; di baris {line}", "code": _set_line(code, line, t.rstrip() + ";")} if t.strip() and not t.rstrip().endswith((";", "{", "}")) else None
        return _ok(f"Perintah di baris {line} harus diakhiri titik koma {_m(';')}.", line, fix)
    m = re.search(r"cannot find symbol \((?:variable|method|class) (\w+)", msg)
    if m:
        return _missing("java", code, m.group(1), line, ["System", "String", "Scanner", "Math", "println", "print", "length"])
    if "incompatible types" in msg:
        hint = f" Untuk teks ke angka pakai {_m('Integer.parseInt(s)')}." if "String" in msg and "int" in msg else ""
        return _ok(f"Tipe datanya tidak cocok: {_m(msg.replace('incompatible types: ', ''))}.{hint}", line)
    if "might not have been initialized" in msg:
        return _ok("Variabel ini dipakai sebelum diberi nilai awal. Beri nilai saat membuatnya, misalnya " + _m("int total = 0;") + ".", line)
    if "cannot assign a value to final variable" in msg:
        return _ok(f"Variabel {_m('final')} tidak boleh diganti isinya. Hapus {_m('final')} kalau nilainya memang berubah.", line)
    if "missing return statement" in msg:
        return _ok(f"Method ini harus mengembalikan nilai, tapi ada jalur tanpa {_m('return')}.", line)
    if "unclosed string literal" in msg:
        return _ok("Ada teks yang tanda kutipnya belum ditutup.", line)
    if "reached end of file while parsing" in msg:
        return _ok(f"Ada kurung kurawal {_m('{')} yang belum ditutup di akhir berkas.", line)
    if lang == "kotlin":
        if "cannot be reassigned" in msg.lower():
            t = _line(code, line)
            vm = re.match(r"\s*(\w+)\s*(?:[+\-*/%]?=)", t)
            n = vm.group(1) if vm else None
            fix = {"label": f"Ubah jadi var {n}", "code": re.sub(rf"\bval\s+{n}\b", f"var {n}", code, count=1)} if n and re.search(rf"\bval\s+{n}\b", code) else None
            return _ok(f"{_m('val')} itu seperti kotak tersegel: isinya tidak bisa diganti. Pakai {_m('var')} kalau nilainya perlu berubah.", line, fix)
        m = re.search(r"[Uu]nresolved reference[: ]+'?(\w+)'?", msg)
        if m:
            return _missing("kotlin", code, m.group(1), line, ["println", "print", "readln", "readLine", "listOf", "mutableListOf", "toInt"])
        if "type mismatch" in msg.lower():
            return _ok(f"Tipe datanya tidak cocok. Untuk teks ke angka pakai {_m('.toInt()')}.", line)
        if "nullable receiver" in msg or "Only safe (?.)" in msg:
            return _ok(f"Nilai ini bisa {_m('null')} (tipe dengan {_m('?')}). Pakai {_m('readln()')} yang tidak pernah null, atau {_m('?.')} untuk memanggil dengan aman.", line)
    ex = {
        "ArithmeticException": "Ada pembagian bilangan bulat dengan nol. Cek pembaginya dulu.",
        "ArrayIndexOutOfBoundsException": "Kamu mengambil posisi yang tidak ada di array. Indeks terakhir adalah " + _m("length - 1") + ".",
        "IndexOutOfBoundsException": "Kamu mengambil posisi yang tidak ada di list. Indeks terakhir adalah " + _m("size - 1") + ".",
        "StringIndexOutOfBoundsException": "Posisi karakter itu tidak ada di teks. Indeks terakhir adalah " + _m("length - 1") + ".",
        "NullPointerException": "Ada nilai yang masih " + _m("null") + " tapi sudah dipakai (dipanggil method-nya).",
        "NumberFormatException": "Teks yang diubah ke angka bukan angka. Cek isi input.",
        "InputMismatchException": "Input tidak sesuai jenis yang diminta Scanner (misalnya minta angka, diberi teks).",
        "NoSuchElementException": "Program membaca input tapi inputnya sudah habis. Isi kotak <b>Input</b> di bawah editor.",
    }.get(name)
    if ex:
        return _ok(ex, line)
    if name == "RuntimeException" and "EOF" in msg:
        return _ok(f"{_m('readln()')} tidak menemukan input lagi. Isi kotak <b>Input</b> di bawah editor.", line)
    return None


def _php(code: str, e: dict[str, Any]) -> dict[str, Any] | None:
    name, msg, line = e.get("name", ""), e.get("message", ""), e.get("line")
    if name == "Parse error":
        if 'expecting "," or ";"' in msg or "expecting \";\"" in msg or re.search(r"unexpected (?:token|identifier|variable) \"?[\w$]", msg):
            target, fix = _semicolon_fix(code, line, 1, "//")
            return _ok(f"Sepertinya titik koma {_m(';')} hilang di akhir baris {target or line}.", target or line, fix)
        if "unexpected end of file" in msg:
            return _ok(f"Ada kurung kurawal {_m('{')} atau kutip yang belum ditutup.", line)
        return _ok("PHP tidak bisa membaca susunan kode di sekitar baris ini. Cek titik koma, kutip dan kurung.", line)
    m = re.match(r"Undefined variable \$(\w+)", msg)
    if m:
        return _missing("php", code, m.group(1), line, sigil="$")
    m = re.search(r"Call to undefined function (\w+)\(\)", msg)
    if m:
        guess = nearest(m.group(1), PHP_FUNCS)
        if guess:
            return _ok(f"Fungsi {_m(m.group(1))} tidak ada. Mungkin maksudmu {_m(guess)}?", line,
                       {"label": f"Perbaiki jadi {guess}", "code": _swap(code, m.group(1), guess)})
        return _ok(f"Fungsi {_m(m.group(1))} tidak ada. Cek ejaannya atau buat dulu fungsinya.", line)
    if name == "DivisionByZeroError":
        return _ok("Ada pembagian dengan nol. Cek pembaginya dulu.", line)
    if "Undefined array key" in msg:
        return _ok("Kunci atau posisi itu tidak ada di array. Indeks dimulai dari 0.", line)
    if name == "TypeError" and "Unsupported operand" in msg:
        return _ok("Operator hitung dipakai pada tipe yang tidak bisa dihitung (misalnya array).", line)
    return None


def _sql(code: str, e: dict[str, Any]) -> dict[str, Any] | None:
    msg, line = e.get("message", ""), e.get("line")
    tables, cols = _sql_names(code)
    m = re.match(r"no such table: (\w+)", msg)
    if m:
        guess = nearest(m.group(1), tables)
        if guess:
            return _ok(f"Tabel {_m(m.group(1))} tidak ada. Mungkin maksudmu {_m(guess)}?", line,
                       {"label": f"Perbaiki jadi {guess}", "code": _swap(code, m.group(1), guess)})
        return _ok(f"Tabel {_m(m.group(1))} belum dibuat. Buat dulu dengan {_m('CREATE TABLE')} sebelum dipakai.", line)
    m = re.match(r"no such column: (\w+)", msg)
    if m:
        guess = nearest(m.group(1), cols)
        if guess:
            return _ok(f"Kolom {_m(m.group(1))} tidak ada. Mungkin maksudmu {_m(guess)}?", line,
                       {"label": f"Perbaiki jadi {guess}", "code": _swap(code, m.group(1), guess)})
        return _ok(f"Kolom {_m(m.group(1))} tidak ada di tabel. Kalau maksudmu teks, tulis dengan kutip satu: {_m(repr(m.group(1)))}.", line)
    m = re.match(r'near "(\w+)": syntax error', msg)
    if m:
        guess = nearest(m.group(1).upper(), SQL_WORDS)
        if guess and guess != m.group(1).upper():
            return _ok(f"{_m(m.group(1))} bukan kata kunci SQL. Mungkin maksudmu {_m(guess)}?", line,
                       {"label": f"Perbaiki jadi {guess}", "code": re.sub(rf"\b{re.escape(m.group(1))}\b", guess, code, count=1)})
        return _ok(f"Susunan perintah di dekat {_m(m.group(1))} tidak dikenali. Cek urutan kata kunci dan koma di antara kolom.", line)
    if "UNIQUE constraint failed" in msg:
        return _ok("Nilai untuk kolom unik (misalnya id) sudah dipakai baris lain. Pakai nilai yang berbeda.", line)
    if "NOT NULL constraint failed" in msg:
        return _ok("Kolom ini wajib diisi (NOT NULL) tapi tidak diberi nilai.", line)
    if "already exists" in msg:
        return _ok(f"Tabel itu sudah dibuat sebelumnya. Pakai {_m('CREATE TABLE IF NOT EXISTS')} atau hapus perintah yang dobel.", line)
    if "incomplete input" in msg or "unrecognized token" in msg:
        return _ok("Ada kutip atau tanda kurung yang belum ditutup.", line)
    if "values for" in msg and "columns" in msg:
        return _ok("Jumlah nilai di VALUES tidak sama dengan jumlah kolom tabel.", line)
    return None


RULES: dict[str, Callable[[str, dict[str, Any]], dict[str, Any] | None]] = {
    "python": _python,
    "c": lambda c, e: _clike("c", c, e),
    "cpp": lambda c, e: _clike("cpp", c, e),
    "rust": _rust,
    "go": _go,
    "java": lambda c, e: _java("java", c, e),
    "kotlin": lambda c, e: _java("kotlin", c, e),
    "php": _php,
    "sql": _sql,
}


def explain(lang: str, code: str, error: dict[str, Any], assist_cap: int = 6) -> dict[str, Any]:
    if assist_cap < 2:
        return {"available": False, "reason": "capped"}
    name = error.get("name", "")
    if name in ("TimeoutError", "Timeout"):
        return _ok("Programmu tidak selesai tepat waktu. Biasanya karena perulangan yang syaratnya selalu benar. "
                   "Cek variabel yang seharusnya berubah di dalam loop.")
    if name == "MemoryError":
        return _ok("Program memakai memori terlalu banyak, misalnya list yang terus bertambah di dalam loop tanpa akhir.")
    fn = RULES.get(lang)
    out = fn(code, error) if fn else None
    return out or {"available": False, "reason": "unknown"}
