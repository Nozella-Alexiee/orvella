"""Starter web projects for the fullstack workspace. Each stack is a small, working app
the learner can run right away and then change (the runner starts it on port 8080)."""
from __future__ import annotations

STYLE = """:root { --bg: #FFF8EC; --ink: #2B2350; --sun: #FFB224; --card: #ffffff; }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: var(--bg); color: var(--ink); }
main { max-width: 640px; margin: 0 auto; padding: 32px 20px; }
h1 { margin: 0 0 4px; font-size: 2rem; }
.sub { margin: 0 0 24px; opacity: .7; }
.card { background: var(--card); border-radius: 18px; padding: 16px 18px; box-shadow: 0 6px 0 #2B235014; margin-bottom: 12px; }
form { display: flex; gap: 8px; margin-bottom: 20px; }
input, textarea { flex: 1; font: inherit; padding: 10px 14px; border-radius: 12px; border: 2px solid #2B235022; background: #fff; }
button { font: inherit; font-weight: 700; padding: 10px 18px; border: 0; border-radius: 12px; background: var(--ink); color: #fff; cursor: pointer; }
button.hapus { background: none; color: #C2410C; padding: 4px 8px; }
ul { list-style: none; padding: 0; margin: 0; }
li { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
small { opacity: .6; }
"""

STACKS: dict[str, dict] = {
    "static": {
        "name": "HTML/CSS/JS statis",
        "entry": "/",
        "files": {
            "index.html": """<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Kartu Profil</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main>
    <div class="card profil">
      <div class="avatar">O</div>
      <h1 id="nama">Orvi</h1>
      <p class="sub">Pelajar web · suka kode rapi</p>
      <button id="suka">Suka ♥ <span id="jumlah">0</span></button>
    </div>
    <p><a href="tentang.html">Halaman tentang →</a></p>
  </main>
  <script src="script.js"></script>
</body>
</html>
""",
            "tentang.html": """<!doctype html>
<html lang="id">
<head><meta charset="utf-8"><title>Tentang</title><link rel="stylesheet" href="style.css"></head>
<body><main><div class="card"><h1>Tentang</h1><p>Halaman kedua. Tautan antarhalaman juga jalan di pratinjau.</p><a href="index.html">← Kembali</a></div></main></body>
</html>
""",
            "style.css": STYLE + """.profil { text-align: center; padding: 32px; }
.avatar { width: 84px; height: 84px; margin: 0 auto 12px; border-radius: 50%; display: grid; place-items: center;
  background: radial-gradient(circle at 35% 35%, #FFE39A, var(--sun)); font-size: 2rem; font-weight: 800; }
""",
            "script.js": """// Tombol suka: menghitung klik dan menyimpannya di localStorage
const tombol = document.getElementById("suka");
const jumlah = document.getElementById("jumlah");
let suka = Number(localStorage.getItem("suka") || 0);
jumlah.textContent = suka;

tombol.addEventListener("click", () => {
  suka = suka + 1;
  jumlah.textContent = suka;
  localStorage.setItem("suka", suka);
  console.log("Disukai", suka, "kali");
});
""",
        },
    },
    "node": {
        "name": "Node.js + Express",
        "entry": "/",
        "files": {
            "server.js": """// Buku tamu: Express + SQLite bawaan Node (node:sqlite)
const express = require("express");
const { DatabaseSync } = require("node:sqlite");

const app = express();
const db = new DatabaseSync("data.db");
db.exec("CREATE TABLE IF NOT EXISTS pesan (id INTEGER PRIMARY KEY, nama TEXT, isi TEXT, waktu TEXT DEFAULT CURRENT_TIMESTAMP)");

app.use(express.json());
app.use(express.static("public"));

app.get("/api/pesan", (req, res) => {
  res.json(db.prepare("SELECT * FROM pesan ORDER BY id DESC").all());
});

app.post("/api/pesan", (req, res) => {
  const { nama, isi } = req.body;
  if (!nama || !isi) return res.status(400).json({ error: "Nama dan pesan wajib diisi" });
  const info = db.prepare("INSERT INTO pesan (nama, isi) VALUES (?, ?)").run(nama, isi);
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

app.listen(process.env.PORT || 8080, "0.0.0.0", () => {
  console.log("Server jalan di port", process.env.PORT || 8080);
});
""",
            "public/index.html": """<!doctype html>
<html lang="id">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Buku Tamu</title>
<link rel="stylesheet" href="/style.css"></head>
<body>
  <main>
    <h1>Buku Tamu</h1>
    <p class="sub">Express + SQLite. Pesan disimpan di data.db.</p>
    <form id="form">
      <input name="nama" placeholder="Nama" required>
      <input name="isi" placeholder="Tulis pesan" required>
      <button>Kirim</button>
    </form>
    <ul id="daftar"></ul>
  </main>
  <script src="/app.js"></script>
</body>
</html>
""",
            "public/app.js": """const daftar = document.getElementById("daftar");
const form = document.getElementById("form");

async function muat() {
  const res = await fetch("/api/pesan");
  const data = await res.json();
  daftar.innerHTML = "";
  for (const p of data) {
    const li = document.createElement("li");
    li.className = "card";
    li.innerHTML = `<span><b></b>: <span></span></span><small>${p.waktu}</small>`;
    li.querySelector("b").textContent = p.nama;
    li.querySelector("span span").textContent = p.isi;
    daftar.appendChild(li);
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  await fetch("/api/pesan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  form.reset();
  muat();
});

muat();
""",
            "public/style.css": STYLE,
            "package.json": """{
  "name": "buku-tamu",
  "private": true,
  "main": "server.js",
  "scripts": { "start": "node server.js" },
  "dependencies": { "express": "^5" }
}
""",
        },
    },
    "php": {
        "name": "PHP + MySQL",
        "entry": "/",
        "files": {
            "db.php": """<?php
// Koneksi ke MySQL. Nilai DB_* diisi otomatis oleh Orvella untuk proyek ini.
$pdo = new PDO(
    "mysql:host=" . getenv("DB_HOST") . ";dbname=" . getenv("DB_NAME") . ";charset=utf8mb4",
    getenv("DB_USER"),
    getenv("DB_PASS"),
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

$pdo->exec("CREATE TABLE IF NOT EXISTS tugas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    judul VARCHAR(200) NOT NULL,
    selesai TINYINT(1) DEFAULT 0,
    dibuat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)");
""",
            "public/index.php": """<?php
require __DIR__ . "/../db.php";

// Tambah, tandai selesai, atau hapus tugas (CRUD)
if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $aksi = $_POST["aksi"] ?? "";
    if ($aksi === "tambah" && trim($_POST["judul"] ?? "") !== "") {
        $pdo->prepare("INSERT INTO tugas (judul) VALUES (?)")->execute([trim($_POST["judul"])]);
    } elseif ($aksi === "selesai") {
        $pdo->prepare("UPDATE tugas SET selesai = 1 - selesai WHERE id = ?")->execute([$_POST["id"]]);
    } elseif ($aksi === "hapus") {
        $pdo->prepare("DELETE FROM tugas WHERE id = ?")->execute([$_POST["id"]]);
    }
    header("Location: /");
    exit;
}

$tugas = $pdo->query("SELECT * FROM tugas ORDER BY selesai, id DESC")->fetchAll();
?>
<!doctype html>
<html lang="id">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Daftar Tugas</title>
<link rel="stylesheet" href="/style.css"></head>
<body>
<main>
  <h1>Daftar Tugas</h1>
  <p class="sub">PHP + MySQL · <?= count($tugas) ?> tugas</p>
  <form method="post">
    <input type="hidden" name="aksi" value="tambah">
    <input name="judul" placeholder="Tugas baru…" required>
    <button>Tambah</button>
  </form>
  <ul>
    <?php foreach ($tugas as $t): ?>
      <li class="card">
        <form method="post" style="margin:0">
          <input type="hidden" name="aksi" value="selesai"><input type="hidden" name="id" value="<?= $t["id"] ?>">
          <button class="hapus" title="Tandai"><?= $t["selesai"] ? "✅" : "⬜" ?></button>
        </form>
        <span style="flex:1<?= $t["selesai"] ? ';text-decoration:line-through;opacity:.6' : '' ?>"><?= htmlspecialchars($t["judul"]) ?></span>
        <form method="post" style="margin:0">
          <input type="hidden" name="aksi" value="hapus"><input type="hidden" name="id" value="<?= $t["id"] ?>">
          <button class="hapus">Hapus</button>
        </form>
      </li>
    <?php endforeach; ?>
  </ul>
</main>
</body>
</html>
""",
            "public/style.css": STYLE,
        },
    },
    "flask": {
        "name": "Python Flask",
        "entry": "/",
        "files": {
            "app.py": """# Catatan harian: Flask + SQLite
import sqlite3
from flask import Flask, redirect, render_template, request

app = Flask(__name__)
DB = "data.db"


def db():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    con.execute("CREATE TABLE IF NOT EXISTS catatan (id INTEGER PRIMARY KEY, isi TEXT, waktu TEXT DEFAULT CURRENT_TIMESTAMP)")
    return con


@app.get("/")
def index():
    with db() as con:
        rows = con.execute("SELECT * FROM catatan ORDER BY id DESC").fetchall()
    return render_template("index.html", catatan=rows)


@app.post("/tambah")
def tambah():
    isi = request.form.get("isi", "").strip()
    if isi:
        with db() as con:
            con.execute("INSERT INTO catatan (isi) VALUES (?)", (isi,))
    return redirect("/")


@app.get("/api/catatan")
def api_catatan():
    with db() as con:
        return [dict(r) for r in con.execute("SELECT * FROM catatan ORDER BY id DESC")]
""",
            "templates/index.html": """<!doctype html>
<html lang="id">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Catatan</title>
<link rel="stylesheet" href="{{ url_for('static', filename='style.css') }}"></head>
<body>
<main>
  <h1>Catatan Harian</h1>
  <p class="sub">Flask + SQLite · coba juga <a href="/api/catatan">/api/catatan</a></p>
  <form method="post" action="/tambah">
    <input name="isi" placeholder="Hari ini aku belajar…" required>
    <button>Simpan</button>
  </form>
  <ul>
    {% for c in catatan %}
      <li class="card"><span>{{ c.isi }}</span><small>{{ c.waktu }}</small></li>
    {% else %}
      <li class="card">Belum ada catatan.</li>
    {% endfor %}
  </ul>
</main>
</body>
</html>
""",
            "static/style.css": STYLE,
        },
    },
    "fastapi": {
        "name": "FastAPI + frontend",
        "entry": "/",
        "files": {
            "main.py": """# API kuis kecil: FastAPI melayani JSON di /api dan halaman di /static
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="Kuis Orvella")

SOAL = [
    {"id": 1, "tanya": "Keluaran print(2 ** 3)?", "pilihan": ["6", "8", "9"], "jawab": 1},
    {"id": 2, "tanya": "Tipe data dari 3.14?", "pilihan": ["int", "str", "float"], "jawab": 2},
    {"id": 3, "tanya": "Kata kunci untuk membuat fungsi di Python?", "pilihan": ["func", "def", "function"], "jawab": 1},
]


class Jawaban(BaseModel):
    id: int
    pilih: int


@app.get("/api/soal")
def daftar_soal():
    return [{k: v for k, v in s.items() if k != "jawab"} for s in SOAL]


@app.post("/api/jawab")
def jawab(j: Jawaban):
    soal = next(s for s in SOAL if s["id"] == j.id)
    return {"benar": soal["jawab"] == j.pilih}


app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def beranda():
    return FileResponse("static/index.html")
""",
            "static/index.html": """<!doctype html>
<html lang="id">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Kuis</title>
<link rel="stylesheet" href="/static/style.css"></head>
<body>
<main>
  <h1>Kuis Kilat</h1>
  <p class="sub">FastAPI + JavaScript · dokumentasi API otomatis di <a href="/docs">/docs</a></p>
  <div id="kuis"></div>
  <p id="skor"></p>
</main>
<script src="/static/app.js"></script>
</body>
</html>
""",
            "static/app.js": """let skor = 0;

async function mulai() {
  const soal = await (await fetch("/api/soal")).json();
  const wadah = document.getElementById("kuis");
  for (const s of soal) {
    const kartu = document.createElement("div");
    kartu.className = "card";
    kartu.innerHTML = `<b>${s.tanya}</b><div style="display:flex;gap:8px;margin-top:10px"></div>`;
    s.pilihan.forEach((p, i) => {
      const b = document.createElement("button");
      b.textContent = p;
      b.onclick = async () => {
        const r = await (await fetch("/api/jawab", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: s.id, pilih: i }),
        })).json();
        b.style.background = r.benar ? "#16A34A" : "#DC2626";
        if (r.benar) skor++;
        document.getElementById("skor").textContent = `Skor: ${skor}`;
      };
      kartu.lastElementChild.appendChild(b);
    });
    wadah.appendChild(kartu);
  }
}

mulai();
""",
            "static/style.css": STYLE,
        },
    },
}


def template(stack: str) -> dict[str, str]:
    return dict(STACKS[stack]["files"])
