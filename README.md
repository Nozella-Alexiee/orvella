# Orvella

**Learn. Build. Collaborate.** Platform belajar ngoding dengan 4 fase per bab: **Pahami → Perkuat → Kuis → Uji**,
untuk Python, JavaScript, C, C++, Rust, Java, Kotlin, Go, PHP, SQL, HTML, dan CSS. Kode siswa benar-benar dijalankan di
sandbox Docker, proyek web fullstack (plus database-nya) bisa dijalankan dan diunduh, dan mentor menyusun materinya
sendiri lewat Studio Materi. Siswa belajar di **Orvella OS**, desktop di browser dengan widget, Sandbox, Galeri, Duel,
dan Orvi si maskot, dan bisa **ngoding bareng** teman sekelas secara realtime.

```
orvella/
  design/     paket desain (mockup HTML, BRAND/ORVI/MOTION). Referensi, tidak di-build.
  backend/    FastAPI · SQLAlchemy · PostgreSQL · Alembic
  frontend/   React 19 · Vite · TypeScript · React Query · CodeMirror 6 · GSAP
  runner/     layanan sandbox: menjalankan kode & server proyek web di container (satu-satunya pemegang docker socket)
  preview/    proxy pratinjau proyek web di origin terpisah (port 8301)
  sandbox/    Dockerfile image bahasa (py, node, php, c, rust, go, jvm)
  scripts/    db.sh (backup/restore), tunnel.sh/.ps1, build-sandbox.sh
  design/instagram/  aset IG @orvella.labs (grid, carousel kuis, Reels) + POSTING.md
  dev.sh      development di Linux: database, runner, dan pratinjau di Docker, API + Vite di host
  dev.ps1     development di Windows (tanpa runner: hanya JavaScript)
```

## Menjalankan (development)

### Linux (disarankan)

Yang dibutuhkan: Docker Engine + plugin compose, Python 3.12+ (atau [uv](https://docs.astral.sh/uv/)), Node.js 20+.
PostgreSQL, runner kode, proxy pratinjau, dan MariaDB berjalan di Docker, jadi tidak perlu dipasang sendiri.

```bash
./dev.sh --setup     # sekali: .env acak, venv backend, paket npm, image sandbox bahasa (5-10 menit), migrasi + data demo
./dev.sh             # jalankan semuanya, buka http://localhost:5173 (Ctrl+C mematikan API + Vite)
./dev.sh --reseed    # isi ulang data demo
./dev.sh --stop      # matikan container development (data tetap ada)
```

`backend/.env` dibuat dari `.env` root (database `127.0.0.1:5432`, runner `127.0.0.1:8081`). Jangan dibagikan.

### Database & backup

```bash
./scripts/db.sh backup               # backups/orvella-YYYYmmdd-HHMM.dump (+ .mysql.sql untuk database proyek PHP)
./scripts/db.sh list
./scripts/db.sh restore <file.dump>  # menimpa database (minta konfirmasi; --yes untuk skrip)
```

Pindah laptop/VPS: salin file backup, jalankan `./dev.sh --setup` (atau `docker compose up -d`) di mesin baru, lalu `restore`.
Skema dikelola Alembic (`python -m app.migrate`); versi terbaru `0007`.

### Windows

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

```bash
cd backend && .venv/bin/python -m pytest -q          # Linux (Windows: .\.venv\Scripts\python.exe -m pytest -q)
cd frontend && npm run typecheck && npm run build
```
Secara bawaan tes memakai SQLite sementara. Untuk menguji ke PostgreSQL:
`$env:ORVELLA_TEST_DATABASE_URL="postgresql+psycopg://orvella:PASSWORD@localhost:5432/orvella_test"` (database ini di-reset).

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

## Login Google

Orvella memakai OAuth 2.0 Authorization Code + PKCE yang seluruhnya di server (`backend/app/routers/google.py`): id_token
diverifikasi lewat JWKS Google (aud, iss, exp, nonce). Akun Google baru menjadi siswa baru (lalu onboarding). Email yang sudah
terdaftar hanya ditautkan kalau Google menyatakan emailnya terverifikasi. Tanpa Client ID, tombol Google menampilkan "belum aktif".

1. Buka [console.cloud.google.com](https://console.cloud.google.com) → buat project **Orvella**.
2. **Google Auth Platform** → *Get started*: nama app `Orvella`, email dukungan, Audience **External**.
3. Selama status *Testing*, tambahkan akun yang boleh mencoba di **Audience → Test users**.
4. **Clients → Create client → Web application**:
   - Authorized JavaScript origins: `http://localhost:5173` dan `http://localhost:8000`
   - Authorized redirect URIs: `http://localhost:5173/api/auth/google/callback` dan `http://localhost:8000/api/auth/google/callback`
     (nanti tambahkan `https://<domain-kamu>/api/auth/google/callback`)
5. Salin **Client ID** dan **Client secret** (secret hanya ditampilkan sekali) ke:
   - `backend/.env`: `ORVELLA_GOOGLE_CLIENT_ID=...` dan `ORVELLA_GOOGLE_CLIENT_SECRET=...`
   - `.env` root (untuk Docker): `GOOGLE_CLIENT_ID=...`, `GOOGLE_CLIENT_SECRET=...`, dan `PUBLIC_URL=https://<domain>`
6. Jalankan ulang API, lalu coba di http://localhost:5173/masuk.

Catatan: tekan **Publish app** supaya semua orang bisa masuk (scope dasar `openid email profile` tidak butuh verifikasi, tapi
mengunggah logo memicu verifikasi brand). URL quick tunnel `trycloudflare` berganti-ganti, jadi tidak bisa didaftarkan sebagai
redirect URI; pakai domain tetap atau named tunnel.

## Superadmin, admin, dan keamanan akun

Peran: `learner` (siswa), `mentor`, `admin`, `superadmin`. Admin mengatur siswa dan mentor. Superadmin juga mengatur admin,
batas Orvi AI (bawaan 30 pertanyaan per 5 jam, bisa per orang), melihat **Log aktivitas** (`/admin/log`), dan dirinya sendiri
tanpa batas AI. Peran superadmin **tidak bisa** diberikan lewat aplikasi, hanya dari server:

```bash
cd backend && .venv/bin/python scripts/set_role.py <email> superadmin --name "Nama"
```

Kalau email belum terdaftar, akun khusus Google dibuat dan tertaut saat pertama kali Masuk dengan Google.

- **Kata sandi**: minimal 8 karakter untuk akun baru, ganti kata sandi (Pengaturan › Akun), dan reset. Ganti/reset kata
  sandi mengeluarkan semua sesi lama.
- **Batas percobaan masuk**: 5× salah per email atau 30× per IP dalam 15 menit → dikunci sementara. Di belakang proxy/tunnel
  yang kamu kendalikan, set `ORVELLA_TRUST_PROXY=true` supaya IP asli dibaca dari `CF-Connecting-IP` / `X-Forwarded-For`.
- **Lupa kata sandi** (`/lupa-sandi`): link berlaku 30 menit, sekali pakai. Isi SMTP di `backend/.env` supaya emailnya
  terkirim (contoh Brevo, gratis 300 email/hari):
  `ORVELLA_SMTP_HOST=smtp-relay.brevo.com`, `ORVELLA_SMTP_PORT=587`, `ORVELLA_SMTP_USER=...`, `ORVELLA_SMTP_PASSWORD=...`,
  `ORVELLA_SMTP_FROM="Orvella <no-reply@domainmu>"`. Tanpa SMTP (dev), isi email cuma ditulis ke log API.
  Sekarang terpasang: Gmail SMTP `alenstok301@gmail.com` (App Password yang sama dengan oneSIG/sigchat), di `backend/.env`
  dan `.env` root (`SMTP_*`, diteruskan ke Docker). Gmail kira-kira 500 email/hari; ganti ke Resend/Brevo begitu punya domain.
- **Kebijakan Privasi** (`/privasi`) dan **Syarat** (`/syarat`) masih **draf**: isi bagian [kurung siku] (pengelola, kontak,
  email, hosting, lisensi) sebelum dipublikasikan. URL-nya dipakai juga di layar persetujuan Google OAuth.

## Orvella OS

Semua role (siswa, mentor, admin, superadmin) mendarat di desktop (`/beranda`) setelah login. Dashboard Admin dan Ruang Mentor
dibuka dari menu Orvella di menu bar atau Spotlight, dan item **Desktop** di sidebar admin/mentor membawa balik.

Tampilan (`frontend/src/os/`): menu bar, dock dengan Orvi di tengah, jendela yang bisa diseret/dibagi dua/Mode Fokus, dan
Spotlight (Ctrl+K). `?ui=klasik` membuka tampilan lama.

- **Jendela ala macOS** (`os/Window.tsx`, `os/motion.ts`): tombol merah/kuning/hijau di kiri, buka membesar dari ikon dock,
  kecilkan dengan efek genie, maksimalkan/snap pakai FLIP, seret pakai transform (magnet ke tepi, bisa dilempar). Animasi latar
  berhenti sebentar selama jendela bergerak, dan jendela yang tertutup jendela maksimal tidak digambar.
- **Mode layang**: jendela kecil yang selalu di atas dan nempel ke pojok (menu Tampilan atau tombol di title bar).
- **Semua jendela** (Mission Control): Ctrl+↑, F3, atau tombol kisi di menu bar. Dock membesar saat kursor lewat.
- **Orvi AI** (`frontend/src/orvi/`, `backend/app/services/ai.py`): asisten di dock (Ctrl+J), topik bebas, jawaban mengalir
  (stream SSE, Markdown). Kalau Sandbox terbuka, Orvi terhubung ke proyek itu seperti asisten ngoding di editor: membaca berkas,
  mengusulkan perubahan sebagai kartu diff (Terapkan/Tolak/Urungkan, atau "izinkan semua di obrolan ini"), dan menjalankan proyek
  setelah diizinkan. Alatnya dijalankan di browser terhadap isi editor (`orvi/agent.ts`, penyedia di `sandbox/Ide.tsx`), jadi aman
  dengan ngoding bareng. Dari halaman bab, Orvi cuma memberi petunjuk tanpa alat tulis. Batas 30 pertanyaan per 5 jam bergulir
  (langkah alat dalam satu pertanyaan tidak dihitung), superadmin tanpa batas. Aktif kalau minimal satu kunci diisi di `backend/.env`: `ORVELLA_GROQ_API_KEY` (console.groq.com),
  `ORVELLA_CEREBRAS_API_KEY` (cloud.cerebras.ai), `ORVELLA_GEMINI_API_KEY` (aistudio.google.com). Untuk Docker: `GROQ_API_KEY`,
  `CEREBRAS_API_KEY`, `GEMINI_API_KEY` di `.env` root. Semuanya punya paket gratis. Model dicoba berurutan (`ORVELLA_AI_MODELS`,
  format `layanan:model`); yang kena batas didinginkan sebentar supaya permintaan berikutnya langsung ke layanan yang masih
  longgar. Gemini cuma dipakai untuk obrolan tanpa alat. Jatah gratis terbesar ada di Cerebras `qwen-3.8-27b` (sekitar 216 juta
  token per hari); Groq sekitar 200 ribu token per hari per model. Orvi bisa ke internet lewat alat `cari_web` dan `buka_halaman`: pencarian memakai SearXNG (container `searxng`, setelan
  di `searxng/settings.yml`, kunci `SEARXNG_SECRET` di `.env`), halaman dibuka server dengan pengaman alamat internal
  (`services/web.py`). Rem 40 pencarian/buka halaman per orang per 10 menit. Tanpa kunci, error umum
  tetap dijelaskan penjelas bawaan. Yang dikirim ke AI cuma obrolan, kode, dan error, tanpa nama atau email.
- **Widget** yang bisa dimainkan: Tebak output harian (+5 XP, satu soal per hari dari bab yang sudah dipahami, kunci dicek
  server), catatan tempel, timer fokus (Pomodoro; teman melihat "Timer fokus · 18 mnt lagi"), jam, quest, musik, dan lainnya.
- **Orvi**: klik untuk tip, tahan untuk mengelus, colek 6× dan dia pusing, seret ke jendela untuk minta bantuan, tidur sendiri
  kalau lama tidak dipakai (bisa ditidurkan dari menu). Pip terbang ke lonceng saat ada notifikasi baru.
- **Klik kanan** di desktop, widget, ikon proyek, title bar jendela, ikon dock, dan Orvi. Matahari/bulan di wallpaper bisa diklik.
- **Hadiah**: level (tiap level butuh 50 XP lebih banyak), 8 lencana stiker (`services/badges.py`), XP terbang ke menu bar,
  wallpaper yang terbuka di 1.500 dan 3.000 XP (Pengaturan → Wallpaper).
- **Easter egg**: kode Konami, logo diklik 7×, Spotlight `orvi dansa` / `matrix`, terminal Sandbox `orvi`, `orvi bilang …`, `sudo`.

## Fitur realtime

Semua berjalan di satu proses uvicorn (room di memori, tanpa Redis). WebSocket memeriksa cookie sesi dan header Origin.

- **Ngoding bareng** (`/ws/kolab/{id}`, Yjs + pycrdt): undang teman sekelas dari panel "Ngoding bareng" di Sandbox atau lewat
  tautan `/s/{kode}` (24 jam, bisa dicabut). Kursor dan nama teman terlihat, izin edit/lihat saja, mode Ikuti, chat tim, hasil
  Jalankan ikut tampil di semua peserta. Server yang menyimpan (2 detik setelah ketikan terakhir) beserta riwayat Yjs-nya,
  jadi yang tersambung ulang tidak kehilangan ketikan. Replay merekam siapa mengetik apa.
- **Siaran live**: pemilik proyek menyiarkan ke kelas; teman sekelas melihat lencana LIVE dan bisa menonton (hanya lihat).
- **Duel 1 lawan 1** (app Duel di dock): 5 soal Kuis yang sama, 5 menit, skor & waktu di server, progres lawan realtime,
  XP untuk pemenang (30) dan peserta (10), kabar hasil muncul di feed kelas.
- **Kuis langsung kelas**: mentor membuka `/mentor/kuis-langsung` (soal dari bank bab atau tempel sendiri), menayangkan
  `/kuis-langsung/{pin}/layar` di proyektor; siswa bergabung dari toast atau `/gabung`. Laporan per soal + unduh CSV.
- **Angkat tangan** di Sandbox, Perkuat, dan Uji: mentor langsung dapat pemberitahuan dan antrian "Kelas live" di dashboard,
  lalu membuka pekerjaan siswa. Notifikasi apa pun sampai ke lonceng tanpa perlu memuat ulang.

## Belum ada / catatan

- "Akun sekolah" (SSO sekolah) masih "segera hadir"; masuk memakai email + kata sandi atau Google.
- Bahasa antarmuka hanya Bahasa Indonesia (pilihan English ditandai "segera").
- JavaScript: konten lengkap untuk Bab 1 dan Bab 2; Bab 3–8 “segera hadir”. Jalur bahasa lain berisi 1–2 bab pembuka.
- Satu browser hanya bisa membuka satu pratinjau proyek web sekaligus (cookie per origin pratinjau).
- Pengingat belajar (pukul 19.00) tersimpan sebagai preferensi, belum ada pengiriman notifikasi terjadwal.
