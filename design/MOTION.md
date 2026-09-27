# Orvella: gerak dan suara

Kit gerak ada di `mockups/js/fx.js` dan dibangun di atas **GSAP 3.15**. Plugin yang dipakai: ScrollTrigger, Flip, Draggable, Inertia, MotionPath, SplitText, DrawSVG, MorphSVG, dan CustomEase. Semuanya gratis untuk komersial.

## Prinsip

1. **Pegas, bukan linear.** Benda sedikit melewati tujuan lalu kembali. Easing utama: `back.out`, `elastic.out(1, .35–.6)`, dan `expo.out`.
2. **Sebab lalu akibat.** Perubahan selalu berangkat dari tempat aksi terjadi:
   - XP terbang dari jawaban ke penghitung.
   - Pip membawa nilai dari kode ke kotak memori.
   - Panah memori berayun ke target barunya.
3. **Satu sorotan per momen.** Hanya satu hal besar yang bergerak dalam satu waktu. Sisanya diam.
4. **Hemat tenaga.**
   - Yang dianimasikan hanya transform, opasitas, dan clip-path.
   - Semua loop (Orvi, medan titik, orbit hero) berhenti saat di luar layar atau saat tab tersembunyi.
5. **Bisa diatur.** Pengguna memilih salah satu dari tiga intensitas di bawah.

## Tiga intensitas (`FX.level()`)

| Level | Isi | Kapan |
|---|---|---|
| `full` Penuh | Semua efek: pegas, magnet, tilt, partikel, konfeti, medan titik, orbit berputar, Orvi melompat, reveal saat scroll. | Bawaan |
| `calm` Kalem | Hanya perubahan warna/opasitas dan gerak di bawah 8 px. Tanpa partikel, konfeti, orbit, tilt, atau scrub. | Bawaan bila `prefers-reduced-motion: reduce` |
| `off` Mati | Tidak ada gerak. Keadaan tetap jelas lewat warna, ikon, dan teks. Semua `animation`/`transition` CSS dinolkan. | Pilihan pengguna |

**Cara kerja:**
- Level disimpan di `html[data-motion]` dan `localStorage` (`orv-motion`).
- Setiap perubahan level memicu event `orv:motion`.

## Token

| Token | Nilai | Pakai |
|---|---|---|
| `--dur-1` | 120 ms | tekan tombol, sentuh |
| `--dur-2` | 220 ms | hover, warna |
| `--dur-3` | 380 ms | panel kecil, tab |
| `--dur-4` | 640 ms | masuk halaman, dialog |
| `--ease-out` | `cubic-bezier(.22,1,.36,1)` | kebanyakan transisi |
| `--ease-spring` | `cubic-bezier(.34,1.56,.64,1)` | sakelar, chip, kartu |
| `--ease-inout` | `cubic-bezier(.65,0,.35,1)` | perpindahan posisi |

## Efek siap pakai (`window.FX`)

| Fungsi | Efek |
|---|---|
| `magnetic(el, .3)` / `[data-magnetic]` | Tombol tertarik ke kursor. Memakai properti `translate`, jadi tidak bentrok dengan `transform` tombol. |
| `tilt(el, 7)` / `[data-tilt]` | Kartu miring 3D mengikuti kursor, dengan kilau `--sheen` |
| `ripple` (otomatis di `.btn`) | Riak dari titik klik |
| `pop(el)`, `shake(el)`, `ring(x,y)` | Umpan balik kecil |
| `burst(x,y)` / `burstAt(el)` | Partikel di satu kanvas overlay |
| `confettiAt(el, warna)` | Konfeti dari posisi elemen |
| `xpFly(from, to, '+10 XP', cb)` | Chip XP terbang melengkung |
| `ticker(el, to)` | Angka berputar naik (format id-ID) |
| `split(el)` / `[data-split]` | Judul muncul per kata saat halaman dimuat |
| `reveal(sel)` | Elemen naik sedikit saat masuk layar. **Tidak memakai opasitas 0**, jadi halaman tetap lengkap tanpa scroll. |
| `field(canvas)` | Medan titik latar yang terdorong kursor dan bergelombang pelan |
| `curtain(color)` | Tirai lingkaran untuk transisi layar (dipakai di Fase 2) |

## Koreografi benar/salah (sama di Perkuat, Kuis, Uji)

1. **Pilih:** kartu jawaban tertekan dan diberi garis lilac.
2. **Periksa, jawaban benar:**
   - kartu mint dengan tanda "✓ Benar"
   - partikel
   - XP terbang ke penghitung
   - Orvi `cheer`
   - bunyi `ok`
   - bilah umpan balik mint naik dari bawah
3. **Periksa, jawaban salah:**
   - kartu koral dengan tanda "× Belum", lalu bergoyang
   - Orvi `oops`
   - bunyi `nope`
   - Pip menunjuk baris kode yang relevan
   - toast "Soal serupa ditambahkan"
   - tanpa pengurangan nyawa

## Momen khas di landing

- **Hero:**
  - 12 chip bahasa mengorbit Orvi dalam dua elips miring yang berlawanan arah.
  - Chip di belakang mengecil dan memudar.
  - Hover menghentikan orbit dan menampilkan cuplikan kode.
  - Klik mengganti kartu kode, mewarnai cincin Orvi, lalu Pip menunjuk tombol Jalankan.
- **Coba sekarang:**
  - Mesin render memori berbasis keadaan: tiap langkah menghasilkan daftar objek dan panah.
  - Objek baru muncul memantul dan objek yang hilang mengecil.
  - Panah berayun ke target baru, sehingga label Python pindah dan kepemilikan Rust berpindah.
  - Penggeser "Mesin Waktu Kode" bisa maju-mundur.
- **4 fase:**
  - Scroll menggambar 4 busur cincin, dan Orvi berjalan di cincin.
  - Demo di tengah cincin berganti sesuai fase.
  - Di layar kecil, demo tampil statis per fase.

## Suara (`window.SFX`)

- Disintesis lewat WebAudio, tanpa file audio.
- **Default mati.** Dinyalakan dari tombol, karena browser butuh interaksi dulu.

| Nama | Dipakai saat |
|---|---|
| `tap` | klik tombol |
| `pop` | Pip mengambil nilai, blok ditambahkan |
| `ok` | benar, program selesai |
| `nope` | salah, error compiler |
| `whoosh` | Orvi diseret |
| `tick` | detik terakhir kuis |
| `level` | selebrasi |
