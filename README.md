# Orvella

Platform belajar ngoding dengan 4 fase per bab: **Pahami → Perkuat → Kuis → Uji**, untuk banyak bahasa:
Python, JavaScript, C, C++, Rust, Java, Kotlin, Go, PHP, SQL, HTML, dan CSS. Kode siswa benar-benar dijalankan di
sandbox Docker, proyek web fullstack bisa dijalankan dan dilihat hasilnya di dalam aplikasi, dan mentor menyusun
materinya sendiri lewat Studio Materi.

```
orvella/
  design/     paket desain (mockup HTML, BRAND/ORVI/MOTION). Referensi, tidak di-build.
  backend/    FastAPI · SQLAlchemy · PostgreSQL · Alembic
  frontend/   React 19 · Vite · TypeScript · React Query · CodeMirror 6 · GSAP
  runner/     layanan sandbox: menjalankan kode & server proyek web di container (satu-satunya pemegang docker socket)
  preview/    proxy pratinjau proyek web di origin terpisah (port 8301)
  sandbox/    Dockerfile image bahasa (py, node, php, c, rust, go, jvm)
  dev.ps1     jalankan backend + frontend sekaligus (tanpa runner: hanya JavaScript)
```

## Menjalankan (development)

Yang dibutuhkan: Python 3.12+, Node.js 20+ (dipakai Vite **dan** untuk menjalankan kode siswa di sandbox), PostgreSQL 15+.

1. Siapkan `backend/.env` (salin dari `backend/.env.example`):
   ```
   ORVELLA_DATABASE_URL=postgresql+psycopg://orvella:PASSWORD@localhost:5432/orvella
   ORVELLA_SECRET_KEY=string-acak-yang-panjang
   ORVELLA_PG_SUPERUSER_PASSWORD=password-user-postgres   # hanya untuk membuat role & database
   ```
2. Setup pertama kali (venv, paket, role + database PostgreSQL, data demo, paket npm):
   ```powershell
   .\dev.ps1 -Setup
   ```
3. Jalankan:
   ```powershell
   .\dev.ps1
   ```
   Buka http://localhost:5173. API ada di http://localhost:8000/api (dokumentasi: http://localhost:8000/docs).

Reset data demo: `.\dev.ps1 -Reseed`.

Kalau PowerShell menolak menjalankan skrip ("running scripts is disabled"), pakai:
`powershell -ExecutionPolicy Bypass -File .\dev.ps1`

### PostgreSQL di laptop ini

PostgreSQL 17 terpasang sebagai service Windows `postgresql-x64-17` (jalan otomatis saat Windows menyala, port 5432,
pgAdmin 4 ikut terpasang). Database `orvella` dipakai aplikasi dan `orvella_test` untuk tes. Password user `postgres` dan
`orvella` dibuat acak saat setup dan hanya tersimpan di `backend/.env` (file itu tidak untuk dibagikan / di-commit).

## Docker + URL publik sementara (Cloudflare Tunnel)

Satu perintah menjalankan PostgreSQL, aplikasi (API + tampilan), dan tunnel Cloudflare, lalu mencetak URL publik
`https://<acak>.trycloudflare.com` yang bisa dibuka dari HP atau dibagikan. Tidak perlu akun Cloudflare dan tidak perlu
Python/Node/PostgreSQL di komputer, cukup Docker.

**Windows** (PowerShell, dari folder proyek; butuh [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/) yang sedang berjalan):
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\tunnel.ps1
```

**Linux / macOS / WSL** (butuh Docker Engine + plugin compose):
```bash
chmod +x scripts/tunnel.sh
./scripts/tunnel.sh
```

Perintah lain (sama untuk `.ps1` dan `.sh`): `url` (tampilkan URL aktif), `logs`, `stop` (matikan, data tetap ada),
`reset` (hapus semua data dan mulai dari data demo baru).

- `tunnel.sh` pertama kali membangun image sandbox bahasa (`./scripts/build-sandbox.sh`, sekali saja, ±3 GB disk) lalu
  mencetak **dua** URL: aplikasi, dan pratinjau proyek web (origin terpisah supaya kode siswa tidak bisa membaca sesi Orvella).
  Aplikasi membaca URL pratinjau sendiri dari tunnel kedua, jadi tidak perlu diatur.
- Layanan: `db` (PostgreSQL), `app`, `runner`, `preview` (port `PREVIEW_PORT`, bawaan 8301), `mysql` (MariaDB kecil untuk
  proyek PHP + MySQL), `tunnel`, `tunnel-preview`. Batas untuk mesin kecil ada di `.env`: `MAX_RUN_CONCURRENCY` (container kode
  yang jalan bersamaan, bawaan 2) dan `MAX_WS_SESSIONS` (proyek web yang menyala bersamaan, bawaan 3).
- Di balik HTTPS sendiri (bukan tunnel), isi `PREVIEW_PUBLIC_URL` dengan alamat HTTPS untuk port pratinjau.

- Pertama kali, skrip membuat `.env` di folder proyek berisi password acak (database, secret key, dan **password akun demo**).
  Password demo dicetak di terminal. Karena URL-nya publik, akun demo tidak memakai `orvella123`.
- URL berganti setiap kali tunnel dinyalakan ulang. Quick tunnel cocok untuk demo/uji coba, bukan untuk produksi
  (tidak ada jaminan uptime). Untuk alamat tetap, pakai named tunnel dengan akun Cloudflare dan domain sendiri.
- Kalau URL tidak kunjung muncul (jaringan memblokir UDP/QUIC), ubah `TUNNEL_PROTOCOL=http2` di `.env` lalu jalankan lagi.
- Tanpa tunnel, cukup `docker compose up -d --build` lalu buka http://localhost:8000.
- Data demo dibuat sekali saat database masih kosong. Ganti `DEMO_PASSWORD` setelah itu tidak mengubah akun yang sudah ada;
  pakai `reset` kalau ingin mengulang.

## Akun demo

Saat dijalankan lokal dengan `dev.ps1`, semua memakai kata sandi `orvella123` (lihat `backend/app/seed/users.json`).
Di Docker, kata sandinya diambil dari `DEMO_PASSWORD` di `.env` (dibuat acak oleh skrip tunnel).

| Peran | Email | Yang bisa dicoba |
|---|---|---|
| Siswa | nadia@smksig.sch.id | Bab 1 selesai, Bab 2 di Perkuat 3/8, streak 12 hari, 3 konsep perlu diulang |
| Siswa | salsa@smksig.sch.id | Bab 2 selesai, proyek Kalkulator Uang Saku menunggu review |
| Siswa | alex@ · rizky@ · maya@ · bayu@smksig.sch.id | memicu sinyal mentor (salah 4×, gagal gerbang, buru-buru petunjuk, macet) |
| Mentor | dimas@smksig.sch.id | kelas XII RPL (32 siswa), antrian review, detail siswa, **Studio** (jalur “Latihan Python · XII RPL”) |
| Admin | sekar@smksig.sch.id | ringkasan kurikulum, flag konten, Studio & builder, pengguna, **Runtime kode** |

Jalur yang tersedia: JavaScript Dasar, Python dari Nol, C++ untuk Pemula, Rust: Aman & Cepat, Web: HTML & CSS
(semua di katalog `/jalur`), plus jalur kelas milik mentor.

Atau daftar akun baru di `/daftar` untuk merasakan onboarding dari awal.

## Tes

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
```
Secara bawaan tes memakai SQLite sementara. Untuk menguji ke PostgreSQL:
`$env:ORVELLA_TEST_DATABASE_URL="postgresql+psycopg://orvella:PASSWORD@localhost:5432/orvella_test"` (database ini di-reset).

Frontend: `cd frontend; npm run typecheck`.

Sandbox dan sesi proyek web (butuh Docker dan image sandbox): `docker compose exec runner python -m pytest -q tests`
(hello world + stdin semua bahasa, batas waktu, memori, jaringan diblokir, fork bomb, isolasi proyek web).

## Produksi

```powershell
cd frontend; npm run build          # hasil di frontend/dist
cd ..\backend; .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```
FastAPI menyajikan `frontend/dist` sekaligus API-nya, jadi cukup satu server. Set `ORVELLA_COOKIE_SECURE=true` di balik HTTPS,
dan ganti `ORVELLA_SECRET_KEY`.

## Cara kerjanya (singkat)

- **Konten** tiap bab disimpan sebagai dokumen JSON berversi (`chapters.draft` untuk Builder, `chapter_versions` untuk yang terbit).
  Siswa selalu membaca versi terbit; versi baru sampai ke siswa setelah fase yang sedang ia kerjakan selesai.
- **Kunci jawaban tidak pernah dikirim ke browser.** Perkuat, Kuis, dan Ulangan diperiksa di server.
- **Aturan belajar** (`backend/app/services/`): `unlock.py` (fase terbuka berurutan, gerbang Kuis 70%), `scoring.py` (skor kuis
  `100 × combo + sisa detik × 5`, XP), `learning.py` (mastery 5 tingkat, "Perlu diulang"), `activity.py` (target harian, streak),
  `signals.py` (sinyal mentor), `diagnostics.py` (penjelasan error L2 berbasis aturan).
- **Kode siswa** berjalan di layanan `runner` (`runner/orv_runner/`): setiap program dikompilasi di satu container lalu setiap tes
  dijalankan di container baru, tanpa jaringan, rootfs read-only, uid 10001, semua capability dicabut, dengan batas waktu,
  memori, pids, dan ukuran file. Runner sendiri yang membandingkan output, jadi hasil tes tidak bisa dipalsukan. Error compiler
  dan runtime semua bahasa dibaca `services/compilers.py`, lalu Orvi menjelaskannya (`services/explain.py`, berbasis aturan,
  termasuk perbaikan sekali klik). Tes JavaScript lama (`expr`, `stdout_last`, …) tetap jalan lewat harness `sandbox.mjs`.
- **Proyek web** (statis, Node + Express, PHP + MySQL, Flask, FastAPI) jalan sebagai server dev di container `orv-ws-<id>` pada
  jaringan Docker privatnya sendiri. Proxy `preview` masuk ke jaringan itu dan meneruskan request dari origin terpisah
  (token HMAC berbatas waktu → cookie `Partitioned`). Proyek PHP mendapat database dan user MariaDB sendiri. Server mati
  sendiri setelah 15 menit tidak dipakai.
- **Studio Materi** (`/studio`): mentor membuat jalur dalam bahasa apa pun dan menerbitkannya ke kelasnya; admin memasukkan jalur
  ke katalog umum. Editor bab punya blok teks (markdown), video YouTube dengan titik jeda berisi pertanyaan, kode interaktif,
  animasi memori (Python otomatis dari jejak eksekusi, template C++ pointer dan Rust ownership), box model CSS, soal
  “tulis kode”/“terjemahkan kode”, tempel soal cepat atau CSV, dan challenge dengan tes input/output + uji solusi referensi.

## Belum ada / catatan

- Tombol masuk dengan Google dan "Akun sekolah" baru menampilkan pesan "segera hadir"; login memakai email + kata sandi.
- Bahasa antarmuka hanya Bahasa Indonesia (pilihan English ditandai "segera").
- JavaScript: konten lengkap untuk Bab 1 dan Bab 2; Bab 3–8 “segera hadir”. Jalur bahasa lain berisi 1–2 bab pembuka.
- Satu browser hanya bisa membuka satu pratinjau proyek web sekaligus (cookie per origin pratinjau).
- Pengingat belajar (pukul 19.00) tersimpan sebagai preferensi, belum ada pengiriman notifikasi terjadwal.
