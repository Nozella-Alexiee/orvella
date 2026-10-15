# Posting IG @orvella.labs (Stiker pop)

Semua file ada di `design/instagram/out/`. Render ulang: `node design/instagram/render.mjs` (butuh `FFMPEG=` untuk Reels).

## Profil

- **Foto profil:** `pp-marigold.png` (paling kelihatan di daftar story). Cadangan: `pp-krem.png`.
- **Nama:** `Orvella · ngoding interaktif`. Kolom nama ikut dicari, jadi kata "ngoding" membantu orang menemukan akun.
- **Bio** (pilih salah satu, maksimal 150 karakter):
  ```
  Learn. Build. Collaborate.
  Jalanin kodenya, lihat memorinya gerak.
  Python · JS · C++ · Rust + 8 bahasa lain
  Coming soon 2026 🔔
  ```
  ```
  Stop hafalan. Mulai ngerti. 🪐
  Tempat ngoding interaktif, 12 bahasa jalan beneran.
  Coming soon 2026
  ```

## Grid puzzle: urutan unggah

Post terbaru selalu muncul di **kiri atas**, jadi unggah dari **kanan bawah** mundur ke kiri atas. Susunan baru utuh setelah
kesembilannya naik. Unggah semuanya dalam satu sesi, atau satu baris (3 post) per hari mulai dari baris bawah.

| Urutan | Kotak | Jenis | File |
|---|---|---|---|
| 1 | baris 3 kanan | foto | `grid-r3c3.png` |
| 2 | baris 3 tengah | foto | `grid-r3c2.png` |
| 3 | baris 3 kiri | foto | `grid-r3c1.png` |
| 4 | baris 2 kanan | foto | `grid-r2c3.png` |
| 5 | baris 2 tengah | **Reels** | `reel.mp4`, sampul `grid-r2c2.png` |
| 6 | baris 2 kiri | **carousel** 5 slide | `grid-r2c1.png`, lalu `kuis-py-2.png` … `kuis-py-5.png` |
| 7 | baris 1 kanan | foto | `grid-r1c3.png` |
| 8 | baris 1 tengah | foto | `grid-r1c2.png` |
| 9 | baris 1 kiri | foto | `grid-r1c1.png` |

Cek hasilnya dengan `grid-profil.png`. Profil kamu harus terlihat seperti gambar itu.

**Wajib diperhatikan:**
- **Jangan pin post apa pun.** Post yang di-pin pindah ke depan dan merusak susunan puzzle.
- **Crop:** semua file berukuran 1080×1440 (3:4). Waktu unggah, ketuk ikon crop dan pilih ukuran asli/3:4, supaya IG tidak
  memotongnya jadi persegi atau 4:5.
- **Reels:**
  - Aktifkan "Bagikan ke feed".
  - Di **Edit sampul → Tambah dari galeri**, pilih `grid-r2c2.png`. Geser pratinjau grid profilnya supaya pas penuh.
  - Musik bebas dipilih di IG, karena videonya tanpa suara. Yang ceria dan bertempo cepat paling cocok.
- **Post berikutnya menggeser puzzle** satu kotak. Supaya baris tetap rapi, unggah konten baru per 3 post sekaligus. Contohnya
  `kuis-js` + `kuis-cpp` + satu post lain.
- **Hashtag:** cukup 3–5 per post. IG sekarang lebih suka hashtag sedikit yang relevan.

## Caption, alt text, hashtag

Alt text ada di **Pengaturan lanjutan → Aksesibilitas → Tulis alt text**.

### 1 · `grid-r3c3.png` (lonceng + @orvella.labs)
**Caption:**
> Nyalain notifikasi dulu 🔔
> Orvella lagi dirakit, dan kamu bisa jadi yang duluan nyobain. Follow @orvella.labs biar gak ketinggalan.

**Alt:** Stiker lonceng merah di kertas krem, tulisan besar @orvella.labs, dan tombol ungu "Follow & nyalakan notifikasi".

**Hashtag:** `#orvella #comingsoon #belajarngoding`

### 2 · `grid-r3c2.png` (SEGERA HADIR)
**Caption:**
> Segera hadir. 2026.
> Tempat ngoding bareng: kodenya kamu jalanin sendiri, isi memorinya kelihatan gerak baris per baris.
> Tunggu tanggal mainnya.

**Alt:** Stiker kuning besar bertuliskan "SEGERA HADIR." dengan label "coming soon · 2026" dan cincin orbit ungu yang melintas.

**Hashtag:** `#orvella #comingsoon #ngoding #programming`

### 3 · `grid-r3c1.png` (4 fase)
**Caption:**
> Tiap bab di Orvella punya 4 fase:
> 1. Pahami: ngerti konsepnya lewat animasi yang bisa kamu sentuh
> 2. Perkuat: latihan sampai lancar
> 3. Kuis: biar nempel
> 4. Uji: tantangan pakai kode beneran
>
> Urut, gak loncat.

**Alt:** Tulisan "4 FASE" dengan empat stiker pil berwarna: Pahami (biru), Perkuat (hijau), Kuis (ungu), Uji (merah).

**Hashtag:** `#orvella #belajarngoding #ngoding #programmerindonesia`

### 4 · `grid-r2c3.png` (12 bahasa)
**Caption:**
> 12 bahasa, semuanya jalan beneran.
> Python, JavaScript, HTML, CSS, C, C++, Rust, Java, Go, SQL, Kotlin, PHP. Kodemu dijalanin di server, bukan simulasi.
>
> Kamu mau mulai dari yang mana? Tulis di komentar 👇

**Alt:** Tulisan "12 BAHASA JALAN" dengan 12 stiker monogram warna-warni: Py, JS, HTML, CSS, C, C++, Rs, Jv, Go, SQL, Kt, php.

**Hashtag:** `#orvella #python #javascript #cpp #rustlang`

### 5 · `reel.mp4` (Reels, sampul `grid-r2c2.png`)
**Caption:**
> Kenalan sama Orvi 🪐
> 20 detik rasanya ngoding di Orvella: tebak output-nya, jalanin, terus lihat memorinya gerak.
> Tadi kamu jawab apa?

**Alt:** Animasi stiker: Orvi muncul, kode Python `x = 4`, `x = x * 2`, `print(x)` diketik, hitung mundur 3-2-1, lalu jawaban B (8)
menyala hijau dan kotak memori x berubah dari 4 ke 8. Ditutup tulisan "Learn. Build. Collaborate. Segera hadir."

**Hashtag:** `#orvella #python #ngoding #comingsoon`

### 6 · carousel `grid-r2c1.png` + `kuis-py-2.png` … `kuis-py-5.png`
**Caption:**
> Tebak output #1 · Python 🐍
> Geser, jawab di komentar dulu, baru intip jawabannya di slide 4. Jangan nyontek ya 😄
> Hint: x = x * 2 itu bukan persamaan matematika, tapi perintah.

**Alt per slide:**
1. Tulisan "TEBAK OUTPUT-NYA?" dan kartu kode Python tiga baris dengan pilihan A 4, B 8, C x * 2.
2. Kartu kode `x = 4`, `x = x * 2`, `print(x)` dan pilihan A, B, C.
3. "Jawab di komentar dulu! A, B, atau C?"
4. Jawabannya B, 8. Kotak memori x berubah dari 4 jadi 8. Orvi menjelaskan komputer menghitung kanan dulu.
5. "Gak perlu nebak lagi." @orvella.labs dan ajakan follow.

**Hashtag:** `#orvella #python #tebakoutput #belajarngoding`

### 7 · `grid-r1c3.png` (Mulai ngerti.)
**Caption:**
> Mulai ngerti.
> Jalanin kodenya, lihat isi memorinya gerak. Begitu kelihatan, konsepnya langsung nyambung.

**Alt:** Tulisan besar "MULAI NGERTI." di stiker hijau, dengan stiker kode `</>`.

**Hashtag:** `#orvella #ngoding #programming`

### 8 · `grid-r1c2.png` (Hai! + logo)
**Caption:**
> Hai! Ini Orvi 🪐 si bola cahaya yang bakal nemenin kamu ngoding di Orvella. Pip, bulan kecilnya, ikut juga.
> Sapa balik di komentar!

**Alt:** Stiker logo orvella dan balon kata kuning "Hai!" di atas kepala Orvi, maskot bola cahaya kuning.

**Hashtag:** `#orvella #maskot #comingsoon`

### 9 · `grid-r1c1.png` (Stop hafalan.)
**Caption:**
> Stop hafalan.
> Ngoding itu soal ngerti alurnya, bukan ngapalin sintaks. Orvella segera hadir, 2026.
> Follow @orvella.labs 🔔

**Alt:** Tulisan besar "STOP HAFALAN." di stiker kuning, dengan label merah "anti copas".

**Hashtag:** `#orvella #belajarngoding #ngoding #programmerindonesia`

## Seri "Tebak output" berikutnya

`kuis-js-1…5.png` (JavaScript `"2" + 2`) dan `kuis-cpp-1…5.png` (C++ `7 / 2`) sudah siap. Caption singkatnya ada di field `caption`
di `quizzes.js`. Untuk menambah kuis, tulis entri baru di `quizzes.js`, lalu jalankan `node design/instagram/render.mjs quiz`.
Seri terakhir otomatis menutup dengan "Mau bahasa apa berikutnya?".
