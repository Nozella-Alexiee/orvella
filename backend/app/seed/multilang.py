"""Starter content beyond JavaScript: Python (2 chapters), C++, Rust and Web (1 chapter each),
plus a mentor's own class path. Added on first start and on upgrades (ensure()), without touching
existing data. Every challenge and code item carries a reference solution; tests/test_seed_content.py
and runner checks keep them honest."""
from __future__ import annotations

import copy
import json
from pathlib import Path as FsPath
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Chapter, ChapterVersion, Concept, Klass, Path, User, now
from .bab2_variabel import ic, mono

TRACES = json.loads((FsPath(__file__).parent / "traces.json").read_text(encoding="utf-8"))


def io(tid: str, name: str, stdin: str, expect: str, hidden: bool = False, pts: int = 1) -> dict[str, Any]:
    return {"id": tid, "name": name, "kind": "io", "stdin": stdin, "expect": expect, "match": "trim", "hidden": hidden, "pts": pts}


def with_notes(trace: dict[str, Any], notes: dict[int, str]) -> dict[str, Any]:
    t = copy.deepcopy(trace)
    for i, n in notes.items():
        if i < len(t["steps"]):
            t["steps"][i]["note"] = n
    return t


def video(vid: str, title: str, checkpoints: list[dict[str, Any]], start: int = 0) -> dict[str, Any]:
    return {"type": "video", "id": vid, "title": title, "start": start, "checkpoints": checkpoints}


def summary(cards: list[tuple[str, str, str]], callout: str) -> dict[str, Any]:
    return {"type": "summary", "cards": [{"icon": i, "title": t, "body": b} for i, t, b in cards],
            "callout": {"icon": "arrow-right-circle", "html": callout}}


def content(lang: str, concepts: list[str], cheatsheet: str, scenes: list, items: list, bank: list, challenge: dict | None,
            exam: list | None = None, minutes: tuple[int, int, int, int] = (7, 8, 4, 10), round_size: int = 8) -> dict[str, Any]:
    return {
        "language": lang,
        "minutes": dict(zip(("pahami", "perkuat", "kuis", "uji"), minutes)),
        "concepts": concepts,
        "cheatsheet": cheatsheet,
        "pahami": {"scenes": scenes},
        "perkuat": {"items": items},
        "kuis": {"round_size": round_size, "seconds": 25, "pass_pct": 70, "combo_max": 3, "bank": bank},
        "ulangan": {"minutes": 20, "pass_mark": 70, "questions": exam or []},
        "challenge": challenge,
        "uji_mode": "challenge" if challenge and not exam else ("ulangan" if exam and not challenge else "any"),
    }


def q(qid: str, t: str, o: list[str], a: int, e: str, c: str | None = None, concepts: list[str] | None = None, trivia: bool = False) -> dict[str, Any]:
    out: dict[str, Any] = {"id": qid, "t": t, "o": o, "a": a, "e": e, "concepts": concepts or []}
    if c:
        out["c"] = c
    if trivia:
        out["trivia"] = True
    return out


# =================================================================== PYTHON 1
PY1 = content(
    "python", ["py-print", "py-input", "py-komentar"],
    'print("Halo")        # tampilkan teks\nprint(2 + 3)         # tampilkan 5\nnama = input()       # baca satu baris input\n# komentar: dilewati Python',
    scenes=[
        {"id": "s1", "kicker": "", "title": "Python: bahasa yang <em>enak dibaca</em>.",
         "lead": "Python dipakai untuk data, AI, otomasi, sampai game kecil. Kodenya pendek dan mirip bahasa Inggris sehari-hari.",
         "visual": {"type": "intro", "side": {"kind": "bubble", "text": "Halo, Python!"}, "objectives_label": "Setelah bab ini kamu bisa",
                    "objectives": [f"Menampilkan teks dan angka dengan {ic('print()')}", f"Membaca input dengan {ic('input()')}", f"Menulis komentar dengan {ic('#')}"]},
         "advance": "free", "concepts": ["py-print"]},
        {"id": "s2", "kicker": "Tonton dulu", "title": "Python dalam <em>100 detik</em>.",
         "say": "Video ini akan berhenti sebentar di dua titik. Jawab pertanyaannya untuk lanjut menonton.",
         "visual": video("x7X9w_GIm1s", "Python in 100 Seconds · Fireship", [
             {"t": 35, "q": "Program Python dijalankan oleh…", "o": ["interpreter, baris demi baris", "browser", "kompiler yang membuat file .exe dulu"], "a": 0,
              "e": "Python memakai <b>interpreter</b>: kode dibaca dan dijalankan langsung tanpa langkah kompilasi terpisah."},
             {"t": 80, "q": "Di Python, isi sebuah blok (misalnya isi <span class=\"ic\">if</span>) ditandai dengan…", "o": ["kurung kurawal { }", "indentasi (spasi di awal baris)", "kata end"], "a": 1,
              "e": "Python memakai <b>indentasi</b>. Baris yang menjorok ke dalam adalah isi bloknya."},
         ]),
         "advance": "all_tokens", "concepts": []},
        {"id": "s3", "kicker": "Coba sendiri", "title": f"{ic('print()')} menampilkan <em>apa pun</em>.",
         "say": "Tanpa tanda kutip, Python menghitung dulu. Dengan tanda kutip, teks ditampilkan apa adanya. Ubah angkanya lalu tekan Jalankan.",
         "visual": {"type": "run", "lang": "python", "code": 'print("Halo, dunia!")\nprint(2 + 3)\nprint("2 + 3")\nprint("Nilai:", 90)',
                    "note": f"Beberapa isi dipisah koma ditampilkan dengan spasi di antaranya: {mono('Nilai: 90')}."},
         "advance": "free", "concepts": ["py-print"]},
        {"id": "s4", "kicker": "Komentar", "title": f"Tulisan setelah {ic('#')} tidak dijalankan.",
         "say": "Komentar adalah catatan untuk manusia. Python melewatinya.",
         "visual": {"type": "cards", "cards": [
             {"label": "Dijalankan", "code": 'print("Hai")', "tone": "ok", "note": f"Menampilkan {mono('Hai')}."},
             {"label": "Dilewati", "code": '# print("Hai")', "tone": "muted", "note": f"Diawali {mono('#')}, jadi hanya catatan."},
             {"label": "Error", "code": "print(Hai)", "tone": "bad", "note": f"Tanpa kutip, {mono('Hai')} dianggap nama variabel yang belum ada: NameError."}]},
         "reveals": [{"q": "Berapa baris yang tampil dari <span class=\"ic\"># satu</span> lalu <span class=\"ic\">print(&quot;dua&quot;)</span>?", "a": "<b>Satu</b>, yaitu dua. Baris pertama komentar."}],
         "advance": "free", "concepts": ["py-komentar"]},
        {"id": "s5", "kicker": "Input", "title": f"{ic('input()')} <em>mendengarkan</em> pengguna.",
         "say": "input() membaca satu baris dari kotak input, lalu hasilnya bisa disimpan di variabel. Ganti nama di kotak input lalu jalankan.",
         "visual": {"type": "run", "lang": "python", "code": 'nama = input()\nkota = input()\nprint("Halo,", nama)\nprint("Salam dari", kota)', "stdin": "Sari\nBandung",
                    "note": "Setiap input() mengambil satu baris berikutnya dari kotak input. Satu baris untuk nama, baris berikutnya untuk kota."},
         "advance": "free", "concepts": ["py-input"]},
        {"id": "s6", "kicker": "Ringkasan", "title": "Yang perlu kamu ingat.",
         "visual": summary([("terminal", "print() menampilkan", "Isi di dalam kurung muncul di layar."), ("quote", "Teks pakai kutip", '"Halo" tampil apa adanya.'),
                            ("keyboard", "input() membaca", "Satu baris setiap kali dipanggil."), ("message-square", "# komentar", "Catatan, dilewati Python.")],
                           "<b>Berikutnya: Perkuat.</b> Latihan pendek, termasuk menulis program sungguhan."),
         "advance": "free", "concepts": []},
    ],
    items=[
        {"id": "p1", "type": "choice", "label": "print yang benar", "title": "Baris mana yang menampilkan tulisan <b>Halo</b>?",
         "choices": ['print("Halo")', 'print Halo', 'echo("Halo")', 'console.log("Halo")'], "answer": 0,
         "hints": {"l3": "Python memakai print, dan teks butuh tanda kutip."}, "l6": f"{mono('print(&quot;Halo&quot;)')}",
         "explain": "print + teks di dalam kutip, di dalam kurung.", "concepts": ["py-print"]},
        {"id": "p2", "type": "predict", "label": "tebak 3 * 4", "title": "Apa yang dicetak?", "code": "print(3 * 4)", "choices": ["3 * 4", "12", "34", '"12"'], "cols": 2, "answer": 1,
         "hints": {"l3": "Tanpa kutip, dihitung dulu."}, "explain": "3 × 4 = 12.", "concepts": ["py-print"]},
        {"id": "p3", "type": "fill", "label": "lengkapi print", "title": "Lengkapi supaya program menampilkan <b>Selamat pagi</b>.",
         "code": '{{slot}}("Selamat pagi")', "tray": [{"val": "print", "label": "print"}, {"val": "echo", "label": "echo"}, {"val": "console.log", "label": "console.log"}, {"val": "Print", "label": "Print"}],
         "answer": ["print"], "hints": {"l3": "Huruf kecil semua."}, "explain": "Python membedakan huruf besar dan kecil: Print ≠ print.", "concepts": ["py-print"]},
        {"id": "p4", "type": "parsons", "label": "susun sapaan", "title": "Susun supaya program membaca nama lalu menyapanya.",
         "lines": [{"id": "2", "code": 'print("Halo,", nama)'}, {"id": "1", "code": "nama = input()"}], "answer": ["1", "2"],
         "hints": {"l3": "Nama harus dibaca dulu sebelum dipakai."}, "explain": "Urutan penting: baca dulu, baru tampilkan.", "concepts": ["py-input"]},
        {"id": "p5", "type": "bug", "label": "temukan NameError", "title": "Program ini error. Ketuk baris penyebabnya.",
         "lines": ["# sapa pengunjung", 'print("Halo")', "print(Selamat datang)"], "error": "SyntaxError: invalid syntax. Perhaps you forgot a comma?", "answer": 3,
         "hints": {"l3": "Teks harus diapit tanda kutip."}, "explain": "Baris 3 lupa tanda kutip.", "concepts": ["py-print"]},
        {"id": "p6", "type": "code", "label": "tulis sapaan", "title": "Tulis program yang membaca sebuah nama, lalu mencetak <b>Halo, &lt;nama&gt;!</b>",
         "help": "Contoh: input <span class=\"t-mono\">Budi</span> → output <span class=\"t-mono\">Halo, Budi!</span>",
         "lang": "python", "starter": "nama = input()\n", "solution": 'nama = input()\nprint(f"Halo, {nama}!")\n',
         "tests": [io("t1", "Budi", "Budi", "Halo, Budi!"), io("t2", "Sari", "Sari", "Halo, Sari!"), io("t3", "nama lain", "Orvi", "Halo, Orvi!", hidden=True)],
         "hints": {"l3": f"Gabungkan teks dan nama. Cara termudah: f-string {mono('f&quot;Halo, {nama}!&quot;')}.", "l4": "Perhatikan tanda seru dan koma: harus persis sama."},
         "explain": "Kamu baru saja menulis program pertamamu yang membaca input!", "concepts": ["py-input", "py-print"]},
    ],
    bank=[
        q("k1", "Perintah untuk menampilkan sesuatu di Python?", ["print()", "echo", "console.log()", "show()"], 0, "Di Python: print().", concepts=["py-print"]),
        q("k2", "Apa yang dicetak?", ["2 + 5", "7", "25", "error"], 1, "Tanpa kutip, dihitung.", c="print(2 + 5)", concepts=["py-print"]),
        q("k3", "Apa yang dicetak?", ["7", "2 + 5", '"2 + 5"', "error"], 1, "Di dalam kutip, tampil apa adanya.", c='print("2 + 5")', concepts=["py-print"]),
        q("k4", "Tanda komentar di Python adalah…", ["//", "#", "--", "/*"], 1, "Satu tanda pagar.", concepts=["py-komentar"]),
        q("k5", "Berapa baris output?", ["1", "2", "3", "0"], 1, "Baris tengah hanya komentar.", c='print("a")\n# print("b")\nprint("c")', concepts=["py-komentar"]),
        q("k6", "input() menghasilkan nilai bertipe…", ["angka", "teks (str)", "boolean", "tergantung isi"], 1, "input() selalu mengembalikan teks.", concepts=["py-input"]),
        q("k7", "Kenapa kode ini error?", ["kurang titik koma", "Halo tanpa kutip", "print harus huruf besar", "kurung salah"], 1, "Tanpa kutip, Halo dianggap nama variabel.", c="print(Halo)", concepts=["py-print"]),
        q("k8", "Apa yang dicetak?", ["Nilai: 90", "Nilai:90", "'Nilai:', 90", "error"], 0, "Isi yang dipisah koma dicetak dengan spasi.", c='print("Nilai:", 90)', concepts=["py-print"]),
        q("k9", "Python dinamai dari…", ["ular piton", "grup komedi Monty Python", "nama kota", "singkatan bahasa lain"], 1, "Guido van Rossum menamainya dari acara komedi Monty Python.", trivia=True),
        q("k10", "Apa yang dicetak?", ["10", "4", "3 + 1 * 2", "8"], 3, "Kali dulu: 1 × 2 = 2, lalu 6 + 2 = 8.", c="print(6 + 1 * 2)", concepts=["py-print"]),
        q("k11", "Urutan output?", ["B lalu A", "A lalu B", "AB", "hanya A"], 0, "Dari atas ke bawah.", c='print("B")\nprint("A")', concepts=["py-print"]),
        q("k12", "Kalau kotak input berisi dua baris 'Ana' dan 'Budi', apa isi y?", ["Ana", "Budi", "Ana Budi", "kosong"], 1, "input() kedua membaca baris kedua.", c="x = input()\ny = input()", concepts=["py-input"]),
    ],
    challenge={
        "language": "python", "title": "Kartu nama digital", "minutes": 8, "difficulty": "mudah", "filename": "main.py",
        "art": {"kind": "board", "title": "KARTU NAMA", "name": "nama", "value": "Sari"},
        "story": "Kelasmu membuat kartu nama digital. Programmu membaca <b>nama</b> dan <b>kota</b> (dua baris input), lalu mencetak dua baris perkenalan.",
        "steps": ["Baca nama lalu kota dengan input().", f"Baris 1: {mono('Halo, aku &lt;nama&gt;')}", f"Baris 2: {mono('Aku tinggal di &lt;kota&gt;')}"],
        "starter": "# Baca nama dan kota, lalu cetak kartu nama\n",
        "solution": 'nama = input()\nkota = input()\nprint(f"Halo, aku {nama}")\nprint(f"Aku tinggal di {kota}")\n',
        "tests": [io("t1", "Sari dari Bandung", "Sari\nBandung", "Halo, aku Sari\nAku tinggal di Bandung"),
                  io("t2", "Budi dari Medan", "Budi\nMedan", "Halo, aku Budi\nAku tinggal di Medan"),
                  io("t3", "nama dua kata", "Dewi Lestari\nSurabaya", "Halo, aku Dewi Lestari\nAku tinggal di Surabaya", hidden=True)],
        "assist": "L1", "concepts": ["py-input", "py-print"],
    },
)

# =================================================================== PYTHON 2
PY2 = content(
    "python", ["py-var", "py-tipe", "py-konversi", "py-fstring"],
    'umur = 16             # int\ntinggi = 1.65         # float\nnama = "Sari"         # str\nlulus = True          # bool\nangka = int(input())  # teks → angka\nprint(f"Umur {umur}")  # f-string',
    scenes=[
        {"id": "s1", "kicker": "", "title": "Variabel adalah <em>label</em> untuk sebuah nilai.",
         "lead": "Di Python, variabel seperti stiker nama yang ditempel ke nilai. Nilainya bisa angka, teks, atau benar/salah.",
         "visual": {"type": "intro", "side": {"kind": "box", "tag": "umur", "val": "16", "type": "int"}, "objectives_label": "Setelah bab ini kamu bisa",
                    "objectives": ["Membuat dan mengubah variabel", f"Mengenal tipe {ic('int')}, {ic('float')}, {ic('str')}, {ic('bool')}",
                                   f"Mengubah teks jadi angka dengan {ic('int()')}", "Menyusun teks dengan f-string"]},
         "advance": "free", "concepts": ["py-var"]},
        {"id": "s2", "kicker": "Di dalam memori", "title": "Lihat apa yang terjadi <em>baris demi baris</em>.",
         "say": "Tekan <b>Putar</b> atau panah kanan. Perhatikan: angka dan teks tinggal di kotak variabel, sedangkan list jadi objek sendiri yang ditunjuk panah.",
         "visual": {"type": "memory", "lang": "python", "template": "python", **with_notes(TRACES["py_var"], {
             0: "Program baru mulai. Belum ada variabel.",
             1: "<b>umur</b> sekarang berisi 16.",
             2: "<b>nama</b> berisi teks 'Sari'.",
             3: "umur + 1 dihitung dulu (17), lalu hasilnya disimpan lagi ke umur.",
             4: "List [80, 90] dibuat sebagai objek. <b>nilai</b> menunjuk ke sana.",
             5: "<b>salinan = nilai</b> tidak menyalin list! Keduanya menunjuk ke objek yang <i>sama</i>.",
             6: "append lewat salinan ikut mengubah nilai, karena objeknya satu.",
             7: "Output membuktikannya: nilai ikut berisi 100."})},
         "advance": "all_tokens", "concepts": ["py-var"]},
        {"id": "s3", "kicker": "Tipe data", "title": "Setiap nilai punya <em>tipe</em>.",
         "say": f"Fungsi {ic('type()')} memberi tahu tipe sebuah nilai. Jalankan, lalu coba ganti nilainya.",
         "visual": {"type": "run", "lang": "python", "code": 'print(type(16))\nprint(type(1.65))\nprint(type("Sari"))\nprint(type(True))',
                    "note": "int = bilangan bulat, float = pecahan, str = teks, bool = benar/salah."},
         "advance": "free", "concepts": ["py-tipe"]},
        {"id": "s4", "kicker": "Jebakan klasik", "title": f"{ic('input()')} selalu memberi <em>teks</em>.",
         "say": "Jalankan program ini. Error! Teks tidak bisa ditambah angka. Perbaiki dengan membungkus input dengan <b>int()</b>, lalu jalankan lagi.",
         "visual": {"type": "run", "lang": "python", "code": "umur = input()\nprint(umur + 1)", "stdin": "16",
                    "note": f"Perbaikannya: {mono('umur = int(input())')}. Orvi akan menjelaskan error-nya kalau kamu penasaran."},
         "advance": "free", "concepts": ["py-konversi"]},
        {"id": "s5", "kicker": "f-string", "title": "Menyusun kalimat dengan <em>f-string</em>.",
         "say": "Awali teks dengan huruf f, lalu tulis variabel di dalam kurung kurawal.",
         "visual": {"type": "run", "lang": "python", "code": 'nama = "Sari"\numur = 16\nprint(f"{nama} berumur {umur} tahun")\nprint(f"Tahun depan: {umur + 1}")',
                    "note": "Di dalam { } boleh hitungan juga."},
         "advance": "free", "concepts": ["py-fstring"]},
        {"id": "s6", "kicker": "Ringkasan", "title": "Yang perlu kamu ingat.",
         "visual": summary([("box", "Variabel = label", "nama = nilai, bisa diganti kapan saja."), ("shapes", "Empat tipe dasar", "int, float, str, bool."),
                            ("repeat", "int() dan str()", "Mengubah teks ↔ angka."), ("quote", "f-string", 'f"Halo {nama}" menyusun kalimat.')],
                           "<b>Berikutnya: Perkuat.</b> Ada soal menulis kode dan menerjemahkan dari JavaScript."),
         "advance": "free", "concepts": []},
    ],
    items=[
        {"id": "p1", "type": "predict", "label": "tipe 3.0", "title": "Apa tipe dari nilai ini?", "code": "print(type(3.0))",
         "choices": ["<class 'int'>", "<class 'float'>", "<class 'str'>", "<class 'number'>"], "cols": 2, "answer": 1,
         "hints": {"l3": "Ada titik desimalnya."}, "explain": "3.0 punya titik desimal, jadi float.", "concepts": ["py-tipe"]},
        {"id": "p2", "type": "choice", "label": "int + 1", "title": f"Apa hasil {ic('int(&quot;5&quot;) + 1')}?", "choices": ["51", "6", "error", '"6"'], "answer": 1,
         "hints": {"l3": "int() mengubah teks jadi angka dulu."}, "explain": 'int("5") menjadi 5, lalu 5 + 1 = 6.', "concepts": ["py-konversi"]},
        {"id": "p3", "type": "bug", "label": "str + int", "title": "Program ini error. Ketuk baris penyebabnya.",
         "lines": ['nama = "Sari"', "umur = 16", 'print("Umur " + umur)'], "error": 'TypeError: can only concatenate str (not "int") to str', "answer": 3,
         "hints": {"l3": "Teks hanya bisa digabung dengan teks."}, "explain": f"Pakai {mono('str(umur)')} atau f-string.", "concepts": ["py-konversi"]},
        {"id": "p4", "type": "fill", "label": "lengkapi int()", "title": "Lengkapi supaya umur bisa dihitung.",
         "code": "umur = {{slot}}(input())\nprint(umur + 1)", "tray": [{"val": "int", "label": "int"}, {"val": "str", "label": "str"}, {"val": "print", "label": "print"}, {"val": "input", "label": "input"}],
         "answer": ["int"], "hints": {"l3": "Kita butuh angka bulat."}, "explain": "int() mengubah teks input jadi bilangan bulat.", "concepts": ["py-konversi"]},
        {"id": "p5", "type": "code", "label": "jumlah dua angka", "title": "Baca dua bilangan bulat (satu per baris), lalu cetak jumlahnya.",
         "lang": "python", "starter": "a = input()\nb = input()\n", "solution": "a = int(input())\nb = int(input())\nprint(a + b)\n",
         "tests": [io("t1", "3 + 4", "3\n4", "7"), io("t2", "10 + 25", "10\n25", "35"), io("t3", "angka negatif", "-5\n2", "-3", hidden=True)],
         "hints": {"l3": "Ingat: input() memberi teks. Ubah dulu dengan int().", "l4": "Kalau hasilnya 34 untuk 3 dan 4, berarti yang digabung masih teks."},
         "explain": "Mantap. Mengubah input jadi angka adalah langkah yang akan sering kamu pakai.", "concepts": ["py-konversi"]},
        {"id": "p6", "type": "translate", "label": "terjemahkan dari JS", "title": "Program JavaScript ini mencetak dua kali sebuah angka. Tulis versi Python-nya.",
         "from_lang": "javascript", "from_code": 'const n = Number(require("fs").readFileSync(0, "utf8"));\nconsole.log(n * 2);',
         "lang": "python", "starter": "", "solution": "n = int(input())\nprint(n * 2)\n",
         "tests": [io("t1", "5 → 10", "5", "10"), io("t2", "21 → 42", "21", "42"), io("t3", "0", "0", "0", hidden=True)],
         "hints": {"l3": "Di Python: n = int(input()) lalu print(...)."}, "explain": "Logikanya sama, hanya cara menulisnya yang beda.", "concepts": ["py-konversi"]},
    ],
    bank=[
        q("k1", "Tipe data dari 16 adalah…", ["int", "float", "str", "bool"], 0, "Bilangan bulat.", concepts=["py-tipe"]),
        q("k2", "Tipe data dari \"16\" adalah…", ["int", "str", "float", "bool"], 1, "Ada tanda kutip, jadi teks.", concepts=["py-tipe"]),
        q("k3", "Apa yang dicetak?", ["17", "161", "error", "16 1"], 0, "int dijumlah: 17.", c="umur = 16\numur = umur + 1\nprint(umur)", concepts=["py-var"]),
        q("k4", "Apa yang dicetak?", ["Halo Sari", "Halo {nama}", "error", "f'Halo Sari'"], 0, "f-string mengganti {nama} dengan isinya.", c='nama = "Sari"\nprint(f"Halo {nama}")', concepts=["py-fstring"]),
        q("k5", "int(\"7\") + int(\"3\") hasilnya…", ["73", "10", "error", "\"10\""], 1, "Keduanya diubah jadi angka dulu.", concepts=["py-konversi"]),
        q("k6", "\"7\" + \"3\" hasilnya…", ["10", "73", "error", "7 3"], 1, "Teks + teks = digabung.", concepts=["py-tipe"]),
        q("k7", "Nilai True dan False bertipe…", ["str", "int", "bool", "float"], 2, "Boolean.", concepts=["py-tipe"]),
        q("k8", "Apa isi b setelah kode ini?", ["[1, 2]", "[1, 2, 3]", "[3]", "error"], 1, "a dan b menunjuk list yang sama.", c="a = [1, 2]\nb = a\na.append(3)", concepts=["py-var"]),
        q("k9", "Nama variabel mana yang TIDAK valid?", ["nilai_akhir", "_skor", "2nilai", "NilaiAkhir"], 2, "Nama tidak boleh diawali angka.", concepts=["py-var"]),
        q("k10", "Apa yang dicetak?", ["3.5", "3", "4", "error"], 0, "/ selalu menghasilkan float.", c="print(7 / 2)", concepts=["py-tipe"]),
        q("k11", "Apa yang dicetak?", ["3.5", "3", "4", "1"], 1, "// adalah pembagian bulat (dibulatkan ke bawah).", c="print(7 // 2)", concepts=["py-tipe"]),
        q("k12", "Siapa pencipta Python?", ["Guido van Rossum", "Linus Torvalds", "Bjarne Stroustrup", "James Gosling"], 0, "Guido van Rossum, 1991.", trivia=True),
    ],
    challenge={
        "language": "python", "title": "Kasir diskon", "minutes": 10, "difficulty": "sedang", "filename": "main.py",
        "art": {"kind": "board", "title": "KASIR", "name": "total", "value": "Rp"},
        "story": "Kantin sekolah memberi diskon. Programmu membaca <b>harga</b> dan <b>persen diskon</b> (bilangan bulat), lalu mencetak harga setelah diskon.",
        "steps": ["Baca harga dan diskon, ubah jadi int.", f"Hitung potongan: {mono('harga * diskon // 100')}.", f"Cetak: {mono('Bayar: &lt;harga akhir&gt;')}"],
        "starter": "harga = input()\ndiskon = input()\n",
        "solution": 'harga = int(input())\ndiskon = int(input())\npotongan = harga * diskon // 100\nprint(f"Bayar: {harga - potongan}")\n',
        "tests": [io("t1", "10000, diskon 10%", "10000\n10", "Bayar: 9000"), io("t2", "25000, diskon 20%", "25000\n20", "Bayar: 20000"),
                  io("t3", "tanpa diskon", "5000\n0", "Bayar: 5000"), io("t4", "pembulatan ke bawah", "999\n50", "Bayar: 500", hidden=True)],
        "assist": "L1", "concepts": ["py-konversi", "py-fstring"],
    },
)

# ======================================================================= C++
def cpp_memory() -> dict[str, Any]:
    f = lambda vs: [{"name": "main()", "vars": vs}]  # noqa: E731
    lines = ["#include <iostream>", "", "int main() {", "    int umur = 16;", "    double tinggi = 1.65;", "    char kelas = 'A';", "    umur = umur + 1;",
             "    std::cout << umur;", "}"]
    u, t, k = "0x7ffe08", "0x7ffe10", "0x7ffe18"
    steps = [
        {"line": 3, "frames": f([]), "heap": [], "note": "main() dimulai. Stack untuk variabelnya masih kosong."},
        {"line": 4, "frames": f([{"name": "umur", "v": "16", "addr": u, "type": "int"}]), "heap": [], "note": "<b>int umur</b>: kotak 4 byte di alamat 0x7ffe08, isinya 16. Tipe harus ditulis dan tidak bisa berubah."},
        {"line": 5, "frames": f([{"name": "umur", "v": "16", "addr": u}, {"name": "tinggi", "v": "1.65", "addr": t, "type": "double"}]), "heap": [],
         "note": "<b>double</b> untuk bilangan pecahan (8 byte)."},
        {"line": 6, "frames": f([{"name": "umur", "v": "16", "addr": u}, {"name": "tinggi", "v": "1.65", "addr": t}, {"name": "kelas", "v": "'A'", "addr": k, "type": "char"}]), "heap": [],
         "note": "<b>char</b> menyimpan satu karakter, ditulis dengan kutip satu."},
        {"line": 7, "frames": f([{"name": "umur", "v": "17", "addr": u}, {"name": "tinggi", "v": "1.65", "addr": t}, {"name": "kelas", "v": "'A'", "addr": k}]), "heap": [],
         "note": "Isi kotak umur diganti jadi 17. Alamatnya tetap sama."},
        {"line": 8, "frames": f([{"name": "umur", "v": "17", "addr": u}, {"name": "tinggi", "v": "1.65", "addr": t}, {"name": "kelas", "v": "'A'", "addr": k}]), "heap": [], "out": "17",
         "note": "std::cout mengirim isi umur ke layar."},
    ]
    return {"type": "memory", "lang": "cpp", "template": "cpp", "lines": lines, "steps": steps}


CPP1 = content(
    "cpp", ["cpp-struktur", "cpp-cout", "cpp-cin", "cpp-tipe"],
    '#include <iostream>\nusing namespace std;\n\nint main() {\n    int umur;          // bilangan bulat\n    cin >> umur;       // baca input\n    cout << umur << endl;  // tampilkan\n    return 0;\n}',
    scenes=[
        {"id": "s1", "kicker": "", "title": "C++: cepat, <em>dekat dengan mesin</em>.",
         "lead": "C++ dipakai untuk game engine, browser, sampai robot. Kodenya dikompilasi jadi program mesin sebelum dijalankan.",
         "visual": {"type": "intro", "side": {"kind": "box", "tag": "umur", "val": "16", "type": "int"}, "objectives_label": "Setelah bab ini kamu bisa",
                    "objectives": ["Membaca struktur program C++", f"Menampilkan output dengan {ic('cout')}", f"Membaca input dengan {ic('cin')}", "Memakai tipe int, double, char"]},
         "advance": "free", "concepts": ["cpp-struktur"]},
        {"id": "s2", "kicker": "Tonton dulu", "title": "C++ dalam <em>100 detik</em>.",
         "visual": video("MNeX4EGtR5Y", "C++ in 100 Seconds · Fireship", [
             {"t": 40, "q": "Sebelum dijalankan, kode C++…", "o": ["dikompilasi jadi program mesin", "dibaca browser", "diterjemahkan ke Python"], "a": 0,
              "e": "C++ adalah bahasa <b>kompilasi</b>: kompiler (misalnya g++) mengubah kode jadi program yang bisa langsung dijalankan CPU."}]),
         "advance": "all_tokens", "concepts": []},
        {"id": "s3", "kicker": "Struktur", "title": "Setiap program punya <em>kerangka</em> yang sama.",
         "visual": {"type": "cards", "cards": [
             {"label": "Pustaka", "code": "#include <iostream>", "tone": "ok", "note": "Mengambil alat input/output (cout, cin)."},
             {"label": "Pintu masuk", "code": "int main() { ... }", "tone": "ok", "note": "Program selalu mulai dari main()."},
             {"label": "Selesai", "code": "return 0;", "tone": "muted", "note": "0 artinya program selesai tanpa masalah."}]},
         "advance": "free", "concepts": ["cpp-struktur"]},
        {"id": "s4", "kicker": "Coba sendiri", "title": f"{ic('cout')} mengalirkan data <em>ke layar</em>.",
         "say": "Tanda << seperti panah: isi di kanan dialirkan ke cout. Klik Jalankan: kode dikompilasi dulu, lalu dijalankan.",
         "visual": {"type": "run", "lang": "cpp", "code": '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Halo, C++!" << endl;\n    cout << 7 / 2 << endl;\n    cout << 7.0 / 2 << endl;\n    return 0;\n}',
                    "note": "Perhatikan 7 / 2 = 3: pembagian dua int hasilnya int. Pakai 7.0 untuk hasil pecahan."},
         "advance": "free", "concepts": ["cpp-cout"]},
        {"id": "s5", "kicker": "Di dalam memori", "title": "Variabel = <em>kotak bertipe</em> di memori.",
         "say": "Putar animasinya. Setiap variabel punya tipe, alamat, dan isi.",
         "visual": cpp_memory(), "advance": "all_tokens", "concepts": ["cpp-tipe"]},
        {"id": "s6", "kicker": "Input", "title": f"{ic('cin')} menerima data <em>dari keyboard</em>.",
         "say": "Tanda >> mengalirkan input ke variabel. Ganti angka di kotak input lalu jalankan.",
         "visual": {"type": "run", "lang": "cpp", "code": '#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << "Jumlah: " << a + b << endl;\n    return 0;\n}',
                    "stdin": "3 4", "note": "cin membaca angka yang dipisah spasi atau Enter."},
         "advance": "free", "concepts": ["cpp-cin"]},
        {"id": "s7", "kicker": "Ringkasan", "title": "Yang perlu kamu ingat.",
         "visual": summary([("box", "main() = pintu masuk", "Program mulai dari sini."), ("terminal", "cout <<", "Menampilkan ke layar."),
                            ("keyboard", "cin >>", "Membaca input ke variabel."), ("shapes", "Tipe wajib", "int, double, char, string.")],
                           "<b>Berikutnya: Perkuat.</b> Jangan lupa titik koma di akhir perintah!"),
         "advance": "free", "concepts": []},
    ],
    items=[
        {"id": "p1", "type": "choice", "label": "cout", "title": "Baris mana yang menampilkan <b>Halo</b> di C++?",
         "choices": ['cout << "Halo";', 'print("Halo");', 'cout >> "Halo";', 'console.log("Halo");'], "answer": 0,
         "hints": {"l3": "Arah panah menuju cout."}, "explain": "cout dengan <<, dan diakhiri titik koma.", "concepts": ["cpp-cout"]},
        {"id": "p2", "type": "predict", "label": "7 / 2 int", "title": "Apa yang dicetak?", "code": "cout << 7 / 2;", "choices": ["3.5", "3", "4", "error"], "cols": 2, "answer": 1,
         "hints": {"l3": "Dua-duanya int."}, "explain": "int / int = int, sisanya dibuang.", "concepts": ["cpp-tipe"]},
        {"id": "p3", "type": "bug", "label": "titik koma hilang", "title": "Program ini gagal dikompilasi. Ketuk baris penyebabnya.",
         "lines": ["#include <iostream>", "int main() {", "    int x = 5", "    std::cout << x;", "}"], "error": "error: expected ',' or ';' before 'std'", "answer": 3,
         "hints": {"l3": "Setiap perintah diakhiri titik koma."}, "explain": "Baris 3 lupa ;. Kompiler baru sadar di baris 4, tapi penyebabnya baris 3.", "concepts": ["cpp-struktur"]},
        {"id": "p4", "type": "fill", "label": "lengkapi cin", "title": "Lengkapi supaya program membaca umur.",
         "code": "int umur;\n{{slot}} {{slot}} umur;", "tray": [{"val": "cin", "label": "cin"}, {"val": "cout", "label": "cout"}, {"val": ">>", "label": ">>"}, {"val": "<<", "label": "<<"}],
         "answer": ["cin", ">>"], "hints": {"l3": "Data mengalir DARI keyboard KE variabel."}, "explain": "cin >> variabel.", "concepts": ["cpp-cin"]},
        {"id": "p5", "type": "code", "label": "kali dua angka", "title": "Baca dua bilangan bulat, lalu cetak hasil kalinya.",
         "lang": "cpp", "starter": "#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    cin >> a >> b;\n    \n    return 0;\n}\n",
         "solution": "#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << a * b << endl;\n    return 0;\n}\n",
         "tests": [io("t1", "3 × 4", "3 4", "12"), io("t2", "7 × 8", "7 8", "56"), io("t3", "dengan nol", "0 99", "0", hidden=True)],
         "hints": {"l3": "Tambahkan satu baris cout sebelum return 0."}, "explain": "Program C++ pertamamu yang membaca input!", "concepts": ["cpp-cout", "cpp-cin"]},
    ],
    bank=[
        q("k1", "Program C++ selalu mulai dari fungsi…", ["start()", "main()", "run()", "begin()"], 1, "main() adalah pintu masuk.", concepts=["cpp-struktur"]),
        q("k2", "Perintah C++ diakhiri dengan…", [". (titik)", "; (titik koma)", ": (titik dua)", "baris baru saja"], 1, "Titik koma.", concepts=["cpp-struktur"]),
        q("k3", "Apa yang dicetak?", ["2.5", "2", "3", "error"], 1, "Pembagian int.", c="cout << 5 / 2;", concepts=["cpp-tipe"]),
        q("k4", "Apa yang dicetak?", ["2.5", "2", "3", "5/2"], 0, "Ada double, jadi hasil pecahan.", c="cout << 5.0 / 2;", concepts=["cpp-tipe"]),
        q("k5", "Tipe untuk satu huruf seperti 'A'?", ["char", "string", "int", "bool"], 0, "char dengan kutip satu.", concepts=["cpp-tipe"]),
        q("k6", "Tanda untuk membaca input dengan cin?", ["<<", ">>", "=", "->"], 1, "cin >> variabel.", concepts=["cpp-cin"]),
        q("k7", "#include <iostream> dibutuhkan untuk…", ["membuat variabel", "cout dan cin", "perulangan", "menghitung"], 1, "iostream = input/output stream.", concepts=["cpp-struktur"]),
        q("k8", "Apa yang dicetak?", ["Halo", "Halo Dunia", "HaloDunia", "error"], 2, "<< menyambung tanpa spasi otomatis.", c='cout << "Halo" << "Dunia";', concepts=["cpp-cout"]),
        q("k9", "C++ dibuat oleh…", ["Bjarne Stroustrup", "Dennis Ritchie", "Guido van Rossum", "James Gosling"], 0, "Bjarne Stroustrup, awal 1980-an.", trivia=True),
        q("k10", "return 0; di akhir main() artinya…", ["program error", "program selesai dengan baik", "ulangi program", "hapus variabel"], 1, "0 = sukses.", concepts=["cpp-struktur"]),
    ],
    challenge={
        "language": "cpp", "title": "Kebun persegi panjang", "minutes": 10, "difficulty": "mudah", "filename": "main.cpp",
        "art": {"kind": "board", "title": "KEBUN", "name": "luas", "value": "m²"},
        "story": "Klub berkebun mau menanam sayur. Programmu membaca <b>panjang</b> dan <b>lebar</b> kebun (bilangan bulat), lalu mencetak luas dan kelilingnya.",
        "steps": ["Baca panjang dan lebar dengan cin.", f"Baris 1: {mono('Luas: &lt;p × l&gt;')}", f"Baris 2: {mono('Keliling: &lt;2 × (p + l)&gt;')}"],
        "starter": "#include <iostream>\nusing namespace std;\n\nint main() {\n    int p, l;\n    cin >> p >> l;\n    // cetak luas dan keliling\n    return 0;\n}\n",
        "solution": '#include <iostream>\nusing namespace std;\n\nint main() {\n    int p, l;\n    cin >> p >> l;\n    cout << "Luas: " << p * l << endl;\n    cout << "Keliling: " << 2 * (p + l) << endl;\n    return 0;\n}\n',
        "tests": [io("t1", "5 × 3", "5 3", "Luas: 15\nKeliling: 16"), io("t2", "10 × 10", "10 10", "Luas: 100\nKeliling: 40"),
                  io("t3", "kebun panjang", "100 1", "Luas: 100\nKeliling: 202", hidden=True)],
        "assist": "L1", "concepts": ["cpp-cout", "cpp-cin"],
    },
)

# ====================================================================== RUST
def rust_memory() -> dict[str, Any]:
    f = lambda vs: [{"name": "main()", "vars": vs}]  # noqa: E731
    s1 = {"id": "o1", "type": "String", "label": '"halo"', "addr": "heap"}
    lines = ["fn main() {", '    let s = String::from("halo");', "    let t = s;", '    println!("{}", t);', '    // println!("{}", s); // error: s sudah dipindahkan', "}"]
    steps = [
        {"line": 2, "frames": f([{"name": "s", "ref": "o1", "type": "String"}]), "heap": [s1], "note": "Teks \"halo\" disimpan di heap. <b>s</b> adalah <i>pemilik</i>-nya."},
        {"line": 3, "frames": f([{"name": "s", "moved": True}, {"name": "t", "ref": "o1"}]), "heap": [s1],
         "note": "Kepemilikan <b>pindah</b> ke t. s tidak boleh dipakai lagi, jadi tidak ada dua pemilik untuk satu data."},
        {"line": 4, "frames": f([{"name": "s", "moved": True}, {"name": "t", "ref": "o1"}]), "heap": [s1], "out": "halo", "note": "t dipakai untuk mencetak."},
        {"line": 5, "frames": f([{"name": "s", "moved": True}, {"name": "t", "ref": "o1"}]), "heap": [s1], "out": "halo",
         "note": "Kalau baris ini diaktifkan, kompilasi gagal: <i>borrow of moved value: s</i>. Rust menangkap bug ini sebelum program jalan."},
        {"line": 6, "frames": f([]), "heap": [], "out": "halo", "note": "Akhir main(): t keluar dari scope, memorinya dibebaskan otomatis. Tanpa garbage collector."},
    ]
    return {"type": "memory", "lang": "rust", "template": "rust", "lines": lines, "steps": steps}


RS_READ = "use std::io;\n\nfn main() {\n    let mut baris = String::new();\n    io::stdin().read_line(&mut baris).unwrap();\n"

RUST1 = content(
    "rust", ["rs-println", "rs-let", "rs-mut", "rs-ownership"],
    'fn main() {\n    let x = 5;            // tidak bisa diubah\n    let mut skor = 0;     // bisa diubah\n    skor += 10;\n    println!("{} {}", x, skor);\n}',
    scenes=[
        {"id": "s1", "kicker": "", "title": "Rust: cepat seperti C++, <em>aman</em> sejak awal.",
         "lead": "Rust memeriksa kodemu dengan teliti saat kompilasi, sehingga banyak bug memori tidak pernah sampai ke pengguna.",
         "visual": {"type": "intro", "side": {"kind": "bubble", "text": "Halo, Rustacean!"}, "objectives_label": "Setelah bab ini kamu bisa",
                    "objectives": [f"Mencetak dengan {ic('println!')}", f"Membuat variabel dengan {ic('let')} dan {ic('let mut')}", "Memahami ide kepemilikan (ownership)"]},
         "advance": "free", "concepts": ["rs-println"]},
        {"id": "s2", "kicker": "Tonton dulu", "title": "Rust dalam <em>100 detik</em>.",
         "visual": video("5C_HPTJg5ek", "Rust in 100 Seconds · Fireship", [
             {"t": 30, "q": "Rust mengelola memori tanpa…", "o": ["variabel", "garbage collector", "kompiler"], "a": 1,
              "e": "Rust tidak memakai <b>garbage collector</b>. Aturan kepemilikan menentukan kapan memori dibebaskan."},
             {"t": 60, "q": "Variabel di Rust secara bawaan…", "o": ["tidak bisa diubah (immutable)", "selalu global", "bertipe teks"], "a": 0,
              "e": "Bawaannya <b>immutable</b>. Tambahkan <span class=\"ic\">mut</span> kalau nilainya perlu berubah."}]),
         "advance": "all_tokens", "concepts": []},
        {"id": "s3", "kicker": "Coba sendiri", "title": f"{ic('println!')} dan tanda <em>{{}}</em>.",
         "say": "Tanda {} diganti nilai setelah koma, berurutan. Tanda seru artinya println! adalah makro. Jalankan lalu ubah.",
         "visual": {"type": "run", "lang": "rust", "code": 'fn main() {\n    let nama = "Orvi";\n    let umur = 3;\n    println!("Halo, {}!", nama);\n    println!("{} berumur {} tahun", nama, umur);\n}',
                    "note": "Kodenya dikompilasi dulu oleh rustc, baru dijalankan."},
         "advance": "free", "concepts": ["rs-println"]},
        {"id": "s4", "kicker": "let vs let mut", "title": "Mau mengubah nilai? <em>Minta izin</em> dulu.",
         "visual": {"type": "cards", "cards": [
             {"label": "Tetap", "code": "let x = 5;", "tone": "muted", "note": "Tidak bisa diganti. Aman dari perubahan tidak sengaja."},
             {"label": "Bisa berubah", "code": "let mut skor = 0;\nskor += 10;", "tone": "ok", "note": "mut = mutable, boleh diubah."},
             {"label": "Error kompilasi", "code": "let x = 5;\nx = 6;", "tone": "bad", "note": "error[E0384]: cannot assign twice to immutable variable."}]},
         "reveals": [{"q": "Kenapa bawaannya tidak bisa diubah?", "a": "Supaya jelas nilai mana yang berubah. Kode lebih mudah dibaca dan lebih sedikit bug."}],
         "advance": "free", "concepts": ["rs-let", "rs-mut"]},
        {"id": "s5", "kicker": "Di dalam memori", "title": "Kepemilikan: satu data, <em>satu pemilik</em>.",
         "say": "Putar animasinya. Perhatikan apa yang terjadi pada s setelah let t = s.",
         "visual": rust_memory(), "advance": "all_tokens", "concepts": ["rs-ownership"]},
        {"id": "s6", "kicker": "Ringkasan", "title": "Yang perlu kamu ingat.",
         "visual": summary([("terminal", "println!", "{} diganti nilai, berurutan."), ("lock", "let", "Bawaannya tidak bisa diubah."),
                            ("pencil", "let mut", "Untuk nilai yang berubah."), ("git-branch", "Ownership", "Satu pemilik; = memindahkan String.")],
                           "<b>Berikutnya: Perkuat.</b> Kompiler Rust itu cerewet, tapi Orvi akan menerjemahkan pesannya."),
         "advance": "free", "concepts": []},
    ],
    items=[
        {"id": "p1", "type": "choice", "label": "mut", "title": "Variabel mana yang boleh diubah nilainya?",
         "choices": ["let skor = 0;", "let mut skor = 0;", "const skor = 0;", "var skor = 0;"], "answer": 1,
         "hints": {"l3": "Cari kata kunci yang artinya mutable."}, "explain": "let mut.", "concepts": ["rs-mut"]},
        {"id": "p2", "type": "bug", "label": "immutable", "title": "Program ini gagal dikompilasi. Ketuk baris penyebabnya.",
         "lines": ["fn main() {", "    let skor = 0;", "    skor = skor + 3;", '    println!("{}", skor);', "}"],
         "error": "error[E0384]: cannot assign twice to immutable variable `skor`", "answer": 3,
         "hints": {"l3": "Error muncul di baris yang mengubah nilai."}, "explain": "Baris 3 mengubah skor, padahal skor dibuat tanpa mut.", "concepts": ["rs-mut"]},
        {"id": "p3", "type": "predict", "label": "println urutan", "title": "Apa yang dicetak?", "code": 'println!("{} + {} = {}", 2, 3, 2 + 3);',
         "choices": ["2 + 3 = 5", "{} + {} = {}", "5 = 2 + 3", "error"], "cols": 2, "answer": 0,
         "hints": {"l3": "Setiap {} diganti nilai berikutnya."}, "explain": "Diganti berurutan: 2, 3, 5.", "concepts": ["rs-println"]},
        {"id": "p4", "type": "fill", "label": "lengkapi mut", "title": "Lengkapi supaya total bisa ditambah.",
         "code": "let {{slot}} total = 0;\ntotal += 5;", "tray": [{"val": "mut", "label": "mut"}, {"val": "const", "label": "const"}, {"val": "var", "label": "var"}, {"val": "&", "label": "&"}],
         "answer": ["mut"], "hints": {"l3": "Kata kunci untuk mutable."}, "explain": "let mut total.", "concepts": ["rs-mut"]},
        {"id": "p5", "type": "code", "label": "kali dua", "title": "Baca satu bilangan bulat, lalu cetak nilainya dikali dua.",
         "help": "Bagian membaca input sudah disiapkan. Ubah teks jadi angka dengan <span class=\"t-mono\">baris.trim().parse::&lt;i64&gt;().unwrap()</span>.",
         "lang": "rust", "starter": RS_READ + "    // n = baris sebagai angka, lalu cetak n * 2\n}\n",
         "solution": RS_READ + '    let n: i64 = baris.trim().parse().unwrap();\n    println!("{}", n * 2);\n}\n',
         "tests": [io("t1", "5 → 10", "5", "10"), io("t2", "21 → 42", "21", "42"), io("t3", "negatif", "-7", "-14", hidden=True)],
         "hints": {"l3": "Jangan lupa .trim() untuk membuang Enter di akhir input."}, "explain": "Kamu sudah membaca input di Rust. Itu bagian yang paling ribet!", "concepts": ["rs-let"]},
    ],
    bank=[
        q("k1", "Makro untuk mencetak satu baris di Rust?", ["print()", "println!", "echo", "cout"], 1, "println! dengan tanda seru.", concepts=["rs-println"]),
        q("k2", "Apa yang dicetak?", ["Halo Orvi", "Halo {}", "error", "Halo, Orvi"], 0, "{} diganti nilai.", c='let n = "Orvi";\nprintln!("Halo {}", n);', concepts=["rs-println"]),
        q("k3", "Variabel Rust bawaannya…", ["bisa diubah", "tidak bisa diubah", "global", "tanpa tipe"], 1, "Immutable.", concepts=["rs-let"]),
        q("k4", "Setelah let t = s; (s sebuah String), s…", ["masih bisa dipakai", "tidak bisa dipakai lagi", "berisi salinan", "jadi kosong \"\""], 1, "Kepemilikan pindah ke t.", concepts=["rs-ownership"]),
        q("k5", "Cara menyalin String supaya dua-duanya bisa dipakai?", ["let t = s;", "let t = s.clone();", "let t = copy s;", "let t = *s;"], 1, ".clone() membuat salinan.", concepts=["rs-ownership"]),
        q("k6", "Kode ini…", ["mencetak 6", "gagal dikompilasi", "mencetak 5", "error saat berjalan"], 1, "x tidak mut.", c="let x = 5;\nx = 6;", concepts=["rs-mut"]),
        q("k7", "Rust membebaskan memori…", ["lewat garbage collector", "saat pemilik keluar dari scope", "tidak pernah", "harus manual dengan free()"], 1, "Otomatis saat pemiliknya selesai.", concepts=["rs-ownership"]),
        q("k8", "Maskot tidak resmi Rust adalah kepiting bernama…", ["Ferris", "Tux", "Gopher", "Duke"], 0, "Ferris si kepiting.", trivia=True),
        q("k9", "Apa yang dicetak?", ["7", "34", "error", "3 4"], 0, "3 + 4 = 7.", c='println!("{}", 3 + 4);', concepts=["rs-println"]),
        q("k10", "Kata kunci untuk membuat fungsi di Rust?", ["function", "def", "fn", "func"], 2, "fn.", concepts=["rs-let"]),
    ],
    challenge={
        "language": "rust", "title": "Ulang tahun berikutnya", "minutes": 10, "difficulty": "sedang", "filename": "main.rs",
        "art": {"kind": "board", "title": "ULTAH", "name": "umur", "value": "+1"},
        "story": "Buat program yang membaca <b>nama</b> (baris 1) dan <b>umur</b> (baris 2), lalu mengucapkan selamat dan menghitung umur tahun depan.",
        "steps": ["Baca dua baris input (sudah disiapkan satu, tiru untuk yang kedua).", "Ubah umur jadi angka dengan parse.",
                  f"Cetak: {mono('Halo, &lt;nama&gt;! Tahun depan umurmu &lt;umur+1&gt;.')}"],
        "starter": "use std::io;\n\nfn main() {\n    let mut nama = String::new();\n    io::stdin().read_line(&mut nama).unwrap();\n    // baca umur, lalu cetak ucapannya\n}\n",
        "solution": 'use std::io;\n\nfn main() {\n    let mut nama = String::new();\n    io::stdin().read_line(&mut nama).unwrap();\n    let mut umur = String::new();\n    io::stdin().read_line(&mut umur).unwrap();\n    let umur: u32 = umur.trim().parse().unwrap();\n    println!("Halo, {}! Tahun depan umurmu {}.", nama.trim(), umur + 1);\n}\n',
        "tests": [io("t1", "Sari, 16", "Sari\n16", "Halo, Sari! Tahun depan umurmu 17."), io("t2", "Budi, 9", "Budi\n9", "Halo, Budi! Tahun depan umurmu 10."),
                  io("t3", "nama dua kata", "Dewi Lestari\n30", "Halo, Dewi Lestari! Tahun depan umurmu 31.", hidden=True)],
        "assist": "L1", "concepts": ["rs-let", "rs-println"],
    },
)

# ======================================================================= WEB
WEB1 = content(
    "html", ["html-tag", "html-struktur", "css-selector", "css-box"],
    '<h1>Judul</h1>              <!-- heading -->\n<p>Paragraf</p>\n<a href="https://…">Tautan</a>\n\n.kartu { padding: 16px; border: 2px solid; margin: 8px; }',
    scenes=[
        {"id": "s1", "kicker": "", "title": "Web dibangun dari <em>kotak-kotak</em>.",
         "lead": "HTML menentukan isi dan strukturnya, CSS menentukan tampilannya. Semua yang kamu lihat di website adalah kotak yang disusun.",
         "visual": {"type": "intro", "side": {"kind": "bubble", "text": "<h1>Halo!</h1>"}, "objectives_label": "Setelah bab ini kamu bisa",
                    "objectives": ["Menulis tag HTML dasar", "Menyusun kerangka halaman", "Memberi gaya dengan selector CSS", "Memahami box model"]},
         "advance": "free", "concepts": ["html-tag"]},
        {"id": "s2", "kicker": "Tonton dulu", "title": "HTML dalam <em>100 detik</em>.",
         "visual": video("ok-plXXHlWw", "HTML in 100 Seconds · Fireship", [
             {"t": 20, "q": "HTML adalah singkatan dari…", "o": ["HyperText Markup Language", "High Tech Modern Language", "Home Tool Markup Language"], "a": 0,
              "e": "<b>HyperText Markup Language</b>: bahasa penanda (markup), bukan bahasa pemrograman."}]),
         "advance": "all_tokens", "concepts": []},
        {"id": "s3", "kicker": "Coba sendiri", "title": "Tag membungkus <em>isi</em>.",
         "say": "Hampir setiap tag punya pembuka dan penutup: &lt;p&gt; ... &lt;/p&gt;. Ubah teksnya, hasilnya langsung tampil.",
         "visual": {"type": "run", "lang": "html", "code": '<h1>Profil Orvi</h1>\n<p>Aku bola cahaya yang suka <b>kode rapi</b>.</p>\n<ul>\n  <li>Python</li>\n  <li>Rust</li>\n</ul>\n<a href="https://example.com">Kunjungi</a>',
                    "note": "h1 = judul, p = paragraf, ul/li = daftar, a = tautan, b = tebal."},
         "advance": "free", "concepts": ["html-tag"]},
        {"id": "s4", "kicker": "Gaya", "title": "CSS memilih kotak, lalu <em>menghiasnya</em>.",
         "say": "Selector di depan kurung kurawal menentukan elemen mana yang diberi gaya. Ubah warnanya.",
         "visual": {"type": "run", "lang": "css", "code": ".halo {\n  color: #E8930C;\n  font-size: 2.4rem;\n}\n\n.kartu {\n  padding: 16px;\n  border-radius: 16px;\n  background: #FFF3D6;\n}",
                    "note": ".halo artinya elemen dengan class=\"halo\"."},
         "advance": "free", "concepts": ["css-selector"]},
        {"id": "s5", "kicker": "Box model", "title": "Setiap elemen punya <em>empat lapis</em>.",
         "say": "Geser penggeser. content → padding (bantalan dalam) → border (garis) → margin (jarak luar). Lalu coba box-sizing: border-box.",
         "visual": {"type": "boxmodel", "width": 160, "padding": 16, "border": 4, "margin": 20, "sizing": "content-box"},
         "reveals": [{"q": "Lebar total kotak dengan width 100px, padding 10px, border 2px (content-box, tanpa margin)?", "a": "<b>124px</b> = 100 + 2×10 + 2×2."}],
         "advance": "free", "concepts": ["css-box"]},
        {"id": "s6", "kicker": "Ringkasan", "title": "Yang perlu kamu ingat.",
         "visual": summary([("code-xml", "Tag berpasangan", "<p> … </p>"), ("layers", "Kerangka", "html > head + body"),
                            ("wand-sparkles", "Selector", ".class, #id, tag"), ("box", "Box model", "content, padding, border, margin")],
                           "<b>Berikutnya: Perkuat.</b> Lalu coba Proyek web di Playground: buat halaman sungguhan!"),
         "advance": "free", "concepts": []},
    ],
    items=[
        {"id": "p1", "type": "choice", "label": "heading", "title": "Tag untuk judul paling besar?", "choices": ["<h1>", "<p>", "<head>", "<title>"], "answer": 0,
         "hints": {"l3": "h = heading, angka kecil = paling besar."}, "explain": "h1 sampai h6; h1 paling besar.", "concepts": ["html-tag"]},
        {"id": "p2", "type": "match", "label": "pasangkan tag", "title": "Pasangkan tag dengan fungsinya.",
         "left": [{"key": "a", "text": "<a>"}, {"key": "b", "text": "<img>"}, {"key": "c", "text": "<li>"}, {"key": "d", "text": "<p>"}],
         "right": [{"key": "c", "text": "butir daftar"}, {"key": "a", "text": "tautan"}, {"key": "d", "text": "paragraf"}, {"key": "b", "text": "gambar"}],
         "left_code": True, "hints": {"l3": "a = anchor (jangkar)."}, "explain": "Semua pasangan tepat.", "concepts": ["html-tag"]},
        {"id": "p3", "type": "bug", "label": "tag tidak ditutup", "title": "Teks setelah baris ini ikut tebal semua. Ketuk baris penyebabnya.",
         "lines": ["<h1>Menu Kantin</h1>", "<p>Hari ini: <b>nasi goreng</p>", "<p>Harga: 12.000</p>"], "answer": 2,
         "hints": {"l3": "Cari tag pembuka yang tidak punya penutup."}, "explain": "&lt;b&gt; di baris 2 tidak ditutup dengan &lt;/b&gt;.", "concepts": ["html-tag"]},
        {"id": "p4", "type": "predict", "label": "box model", "title": "Berapa lebar total kotak ini (content-box)?", "code": ".kotak {\n  width: 100px;\n  padding: 10px;\n  border: 2px solid;\n}",
         "choices": ["100px", "112px", "124px", "120px"], "cols": 2, "answer": 2,
         "hints": {"l3": "Padding dan border dihitung di kiri DAN kanan."}, "explain": "100 + 2×10 + 2×2 = 124px.", "concepts": ["css-box"]},
        {"id": "p5", "type": "fill", "label": "selector class", "title": "Lengkapi selector supaya elemen dengan class=\"judul\" jadi oranye.",
         "code": "{{slot}}judul {\n  color: orange;\n}", "tray": [{"val": ".", "label": "."}, {"val": "#", "label": "#"}, {"val": "<", "label": "<"}, {"val": "$", "label": "$"}],
         "answer": ["."], "hints": {"l3": "Titik untuk class, pagar untuk id."}, "explain": ".judul memilih semua elemen dengan class judul.", "concepts": ["css-selector"]},
    ],
    bank=[
        q("k1", "Bagian halaman yang TAMPIL di layar ada di dalam tag…", ["<head>", "<body>", "<meta>", "<title>"], 1, "Isi yang terlihat ada di body.", concepts=["html-struktur"]),
        q("k2", "Tag untuk tautan?", ["<link>", "<a>", "<href>", "<url>"], 1, "<a href=\"…\">.", concepts=["html-tag"]),
        q("k3", "Selector #menu memilih elemen dengan…", ["class=\"menu\"", "id=\"menu\"", "tag <menu>", "nama menu"], 1, "# untuk id.", concepts=["css-selector"]),
        q("k4", "Jarak DI LUAR border disebut…", ["padding", "margin", "gap", "spacing"], 1, "Margin di luar, padding di dalam.", concepts=["css-box"]),
        q("k5", "Jarak di antara isi dan border disebut…", ["margin", "padding", "outline", "inset"], 1, "Padding.", concepts=["css-box"]),
        q("k6", "Mana yang tag tanpa penutup?", ["<p>", "<img>", "<div>", "<h1>"], 1, "<img> tidak membungkus isi.", concepts=["html-tag"]),
        q("k7", "CSS singkatan dari…", ["Cascading Style Sheets", "Creative Style System", "Computer Style Sheets", "Colorful Style Sheets"], 0, "Cascading Style Sheets.", concepts=["css-selector"]),
        q("k8", "Dengan box-sizing: border-box, width sudah termasuk…", ["hanya content", "content + padding + border", "margin juga", "tidak ada"], 1, "Padding dan border masuk ke width.", concepts=["css-box"]),
        q("k9", "Penemu World Wide Web adalah…", ["Tim Berners-Lee", "Bill Gates", "Brendan Eich", "Steve Jobs"], 0, "Tim Berners-Lee, 1989 di CERN.", trivia=True),
        q("k10", "Tag <ul> dipakai untuk…", ["garis bawah", "daftar tanpa nomor", "tabel", "judul"], 1, "unordered list.", concepts=["html-tag"]),
    ],
    challenge=None,
    exam=[
        {"id": "u1", "label": "Tag paragraf", "t": "Tag untuk paragraf?", "type": "choice", "o": ["<p>", "<para>", "<pg>", "<text>"], "pts": 15, "answer": 0, "concepts": ["html-tag"]},
        {"id": "u2", "label": "Selector class", "t": "Tulis selector CSS untuk elemen dengan class <b>kartu</b>.", "type": "short", "accept": [".kartu"], "pts": 20, "concepts": ["css-selector"]},
        {"id": "u3", "label": "Box model", "t": "Lebar total (content-box): width 200px, padding 20px, border 5px, margin 0?", "type": "choice", "o": ["200px", "225px", "250px", "245px"], "pts": 20, "answer": 2, "concepts": ["css-box"]},
        {"id": "u4", "label": "Kerangka", "t": "Judul yang tampil di tab browser ditulis di tag…", "type": "choice", "o": ["<h1>", "<title>", "<header>", "<head>"], "pts": 15, "answer": 1, "concepts": ["html-struktur"]},
        {"id": "u5", "label": "Margin vs padding", "t": "Supaya dua kartu tidak berdempetan, yang diubah adalah…", "type": "choice", "o": ["padding", "margin", "border", "width"], "pts": 15, "answer": 1, "concepts": ["css-box"]},
        {"id": "u6", "label": "Tag gambar", "t": "Tulis nama tag untuk menampilkan gambar (tanpa kurung sudut).", "type": "short", "accept": ["img"], "pts": 15, "concepts": ["html-tag"]},
    ],
)

# ============================================================== MENTOR PATH
MENTOR1 = content(
    "python", ["py-mod", "py-if"],
    'sisa = angka % 2       # sisa bagi\nif sisa == 0:\n    print("genap")\nelse:\n    print("ganjil")',
    scenes=[
        {"id": "s1", "kicker": "Pemanasan dari Pak Dimas", "title": "Operator <em>sisa bagi</em> dan <em>if</em>.",
         "visual": {"type": "markdown", "md": "Minggu ini kita pemanasan sebelum proyek kantin.\n\n- `%` menghasilkan **sisa bagi**: `7 % 2` hasilnya `1`\n- `if` / `else` memilih jalan berdasarkan syarat\n\n> Tips: angka genap selalu punya sisa 0 kalau dibagi 2.\n\n```python\nif 7 % 2 == 0:\n    print(\"genap\")\nelse:\n    print(\"ganjil\")\n```"},
         "advance": "free", "concepts": ["py-mod"]},
        {"id": "s2", "kicker": "Video pilihan", "title": "Tonton <em>pembukaannya</em> dulu.",
         "say": "Videonya panjang, cukup tonton menit pertama. Di menit ke-1 ada satu pertanyaan tentang if/else yang kita bahas di atas.",
         "visual": video("kqtD5dpn9C8", "Python for Beginners · Programming with Mosh", [
             {"t": 60, "q": "Kapan isi <span class=\"ic\">else</span> dijalankan?", "o": ["Selalu", "Kalau syarat if bernilai False", "Kalau syarat if bernilai True"], "a": 1,
              "e": "else adalah jalan cadangan: dijalankan saat syarat if <b>tidak</b> terpenuhi."}]),
         "advance": "all_tokens", "concepts": ["py-if"]},
        {"id": "s3", "kicker": "Di dalam memori", "title": "Ikuti jalannya program <em>genap-ganjil</em>.",
         "visual": {"type": "memory", "lang": "python", "template": "python", **with_notes(TRACES["py_mentor"], {
             1: "angka berisi 7.", 2: "7 % 2 = 1, disimpan di sisa.", 3: "Syarat sisa == 0 salah, jadi program lompat ke else.",
             4: "jenis diisi 'ganjil'.", 5: "Cetak hasilnya."})},
         "advance": "all_tokens", "concepts": ["py-mod", "py-if"]},
        {"id": "s4", "kicker": "Coba", "title": "Ganti angkanya, <em>jalankan</em>.",
         "visual": {"type": "run", "lang": "python", "code": 'angka = int(input())\nif angka % 2 == 0:\n    print(angka, "genap")\nelse:\n    print(angka, "ganjil")', "stdin": "12"},
         "advance": "free", "concepts": ["py-if"]},
    ],
    items=[
        {"id": "p1", "type": "predict", "label": "sisa bagi", "title": "Apa yang dicetak?", "code": "print(17 % 5)", "choices": ["3", "2", "3.4", "12"], "cols": 2, "answer": 1,
         "hints": {"l3": "17 = 5 × 3 + ?"}, "explain": "17 = 15 + 2, sisanya 2.", "concepts": ["py-mod"]},
        {"id": "p2", "type": "code", "label": "genap ganjil", "title": "Baca satu bilangan bulat. Cetak <b>genap</b> atau <b>ganjil</b>.",
         "lang": "python", "starter": "n = int(input())\n", "solution": 'n = int(input())\nif n % 2 == 0:\n    print("genap")\nelse:\n    print("ganjil")\n',
         "tests": [io("t1", "4", "4", "genap"), io("t2", "7", "7", "ganjil"), io("t3", "nol", "0", "genap", hidden=True)],
         "hints": {"l3": "Pakai n % 2 == 0 sebagai syarat."}, "explain": "Mantap!", "concepts": ["py-if"]},
    ],
    bank=[
        q("k1", "7 % 3 hasilnya…", ["1", "2", "3", "0"], 0, "7 = 6 + 1.", concepts=["py-mod"]),
        q("k2", "10 % 2 hasilnya…", ["5", "0", "2", "1"], 1, "Habis dibagi.", concepts=["py-mod"]),
        q("k3", "Tanda untuk membandingkan sama dengan?", ["=", "==", "===", ":="], 1, "== membandingkan, = mengisi.", concepts=["py-if"]),
        q("k4", "Setelah baris if, isi bloknya harus…", ["diberi kurung", "menjorok (indentasi)", "diakhiri titik koma", "huruf besar"], 1, "Indentasi.", concepts=["py-if"]),
        q("k5", "Apa yang dicetak?", ["genap", "ganjil", "error", "tidak ada"], 1, "9 % 2 = 1.", c='if 9 % 2 == 0:\n    print("genap")\nelse:\n    print("ganjil")', concepts=["py-if"]),
        q("k6", "Baris if diakhiri dengan…", [";", ":", "{", "."], 1, "Titik dua.", concepts=["py-if"]),
    ],
    challenge={
        "language": "python", "title": "Harga tiket", "minutes": 8, "difficulty": "mudah", "filename": "main.py",
        "art": {"kind": "board", "title": "TIKET", "name": "harga", "value": "Rp"},
        "story": "Tiket museum: umur di bawah 12 tahun bayar 5000, selain itu 10000. Baca umur, cetak harganya.",
        "steps": ["Baca umur sebagai int.", "Pakai if / else.", f"Cetak {mono('5000')} atau {mono('10000')}."],
        "starter": "umur = int(input())\n", "solution": "umur = int(input())\nif umur < 12:\n    print(5000)\nelse:\n    print(10000)\n",
        "tests": [io("t1", "anak 8 tahun", "8", "5000"), io("t2", "remaja 15 tahun", "15", "10000"), io("t3", "tepat 12", "12", "10000", hidden=True)],
        "assist": "L1", "concepts": ["py-if"],
    },
    round_size=6,
)

PATHS = [
    # slug, title, description, language, level, chapters [(slug, title, subtitle, icon, content)], concepts [(key, name, skill)]
    ("python-dasar", "Python dari Nol", "Dari print sampai tipe data, dengan video, animasi memori, dan program sungguhan.", "python", "Pemula",
     [("halo-python", "Halo, Python", "print, input, komentar", "hand", PY1), ("variabel-tipe", "Variabel & Tipe Data", "int, str, f-string", "box", PY2)],
     [("py-print", "print()", "Menampilkan output"), ("py-input", "input()", "Membaca input"), ("py-komentar", "komentar #", "Menulis komentar"),
      ("py-var", "variabel", "Membuat variabel"), ("py-tipe", "tipe data", "Mengenal tipe data"), ("py-konversi", "int()", "Mengubah teks jadi angka"),
      ("py-fstring", "f-string", "Menyusun teks dengan f-string")]),
    ("cpp-dasar", "C++ untuk Pemula", "Program yang dikompilasi: struktur, cout, cin, dan tipe data di memori.", "cpp", "Pemula",
     [("halo-cpp", "Halo, C++", "main, cout, cin", "cpu", CPP1)],
     [("cpp-struktur", "struktur", "Membaca struktur program"), ("cpp-cout", "cout", "Menampilkan output"), ("cpp-cin", "cin", "Membaca input"), ("cpp-tipe", "tipe", "Memakai int, double, char")]),
    ("rust-dasar", "Rust: Aman & Cepat", "println!, let mut, dan kepemilikan (ownership) yang membuat Rust aman.", "rust", "Menengah",
     [("halo-rust", "Halo, Rust", "println!, mut, ownership", "shield-check", RUST1)],
     [("rs-println", "println!", "Mencetak dengan println!"), ("rs-let", "let", "Membuat variabel"), ("rs-mut", "mut", "Variabel yang bisa berubah"), ("rs-ownership", "ownership", "Memahami kepemilikan")]),
    ("web-dasar", "Web: HTML & CSS", "Halaman pertamamu: tag HTML, selector CSS, dan box model. Lanjutkan di Proyek web.", "html", "Pemula",
     [("halaman-pertama", "Halaman Pertama", "tag, selector, box model", "globe", WEB1)],
     [("html-tag", "tag HTML", "Menulis tag HTML"), ("html-struktur", "kerangka", "Menyusun kerangka halaman"), ("css-selector", "selector", "Memakai selector CSS"), ("css-box", "box model", "Memahami box model")]),
]


def _add_path(db: Session, slug: str, title: str, desc: str, lang: str, level: str, chapters: list, concepts: list, admin: User | None,
              owner: User | None = None, visibility: str = "public", class_ids: list[int] | None = None) -> Path:
    p = Path(slug=slug, title=title, description=desc, language=lang, level=level, owner_id=owner.id if owner else None,
             visibility=visibility, class_ids=class_ids or [], created_at=now())
    db.add(p)
    db.flush()
    by_chapter: dict[str, int] = {}
    for i, (cslug, ctitle, sub, icon, body) in enumerate(chapters, 1):
        ch = Chapter(path_id=p.id, position=i, number=i, kind="chapter", slug=cslug, title=ctitle, subtitle=sub, icon=icon,
                     module_label="Modul 1 · Fondasi" if i == 1 else "", map_x=36 if i % 2 else 64, status="published", version=1,
                     draft=copy.deepcopy(body), updated_by=(owner or admin).id if (owner or admin) else None)
        db.add(ch)
        db.flush()
        db.add(ChapterVersion(chapter_id=ch.id, version=1, content=copy.deepcopy(body), published_by=(owner or admin).id if (owner or admin) else None))
        for key in body.get("concepts", []):
            by_chapter[key] = ch.id
    for n, (key, name, skill) in enumerate(concepts):
        db.add(Concept(path_id=p.id, key=key, name=name, skill=skill, chapter_id=by_chapter.get(key), x=120 + (n % 5) * 180, y=110 + (n // 5) * 170 + (n % 2) * 60))
    return p


def ensure(db: Session) -> list[str]:
    """Adds the multi-language paths that are missing. Safe to run on every start."""
    added = []
    admin = db.scalar(select(User).where(User.role == "admin").order_by(User.id))
    js = db.scalar(select(Path).where(Path.slug == "js-dasar"))
    if js and js.language != "javascript":
        js.language = "javascript"
    for slug, title, desc, lang, level, chapters, concepts in PATHS:
        if not db.scalar(select(Path).where(Path.slug == slug)):
            _add_path(db, slug, title, desc, lang, level, chapters, concepts, admin)
            added.append(slug)
    mentor = db.scalar(select(User).where(User.role == "mentor").order_by(User.id))
    klass = db.scalar(select(Klass).where(Klass.mentor_id == mentor.id).order_by(Klass.id)) if mentor else None
    if mentor and klass and not db.scalar(select(Path).where(Path.slug == "latihan-python-xii-rpl")):
        _add_path(db, "latihan-python-xii-rpl", f"Latihan Python · {klass.name}", "Pemanasan sebelum proyek kantin: sisa bagi dan if/else.", "python", "Pemula",
                  [("pemanasan-if", "Pemanasan: sisa bagi & if", "%, if, else", "git-branch", MENTOR1)],
                  [("py-mod", "sisa bagi %", "Memakai sisa bagi"), ("py-if", "if / else", "Memilih jalan dengan if")],
                  admin, owner=mentor, visibility="class", class_ids=[klass.id])
        added.append("latihan-python-xii-rpl")
    return added


ALL_CONTENT = {"python-dasar/halo-python": PY1, "python-dasar/variabel-tipe": PY2, "cpp-dasar/halo-cpp": CPP1, "rust-dasar/halo-rust": RUST1,
               "web-dasar/halaman-pertama": WEB1, "latihan-python-xii-rpl/pemanasan-if": MENTOR1}
