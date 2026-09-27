# Orvella: identitas merek

Lihat versi interaktifnya di `mockups/brand.html`.

## Nama dan ide

**Orvella** berasal dari kata *orbit*. Belajar seperti mengorbit satu konsep: dikitari dari beberapa sisi sampai paham, lalu pindah ke orbit berikutnya.

- **Logo:** cincin berisi satu bulan kecil, Pip.
- **Cincin fase:** cincin yang sama dibagi jadi 4 busur, Pahami, Perkuat, Kuis, dan Uji.
- **Tagline:** "Belajar ngoding dari paham."

## Logo

- **Tanda:** bola marigold bergradien (tanpa wajah), cincin miring −18° dengan garis tinta, dan Pip. Pip berputar pelan, dan lebih cepat saat kursor di atas logo.
- **Kata:** "Orvella" dalam Bricolage Grotesque 800, lebar 84, jarak huruf −0,045em.
- **Varian:**
  - di atas susu
  - di atas malam (cincin krem)
  - di atas marigold
  - satu warna, untuk cetak
  - ikon aplikasi: latar nila, tanda 56%
- **Ruang kosong:** minimal satu diameter Pip di setiap sisi.
- **Ukuran minimal:** tanda 20 px, logo lengkap 88 px.
- **Jangan:**
  - meregangkan atau memiringkan
  - mengganti warna bola
  - menambah efek neon atau bayangan
  - memakai huruf lain

## Warna

Semua nilai ada di `mockups/css/tokens.css`. Tema Malam mendefinisikan ulang token yang sama.

| Peran | Token | Terang | Malam |
|---|---|---|---|
| Latar | `--bg` | `#FDF4E3` susu | `#14132C` |
| Kartu | `--surface` | `#FFFBF4` | `#1D1B3D` |
| Teks utama | `--ink` | `#1E1C45` nila | `#F8F1E4` |
| Aksen utama | `--marigold` | `#FFB224` | `#FFBC3B` |
| Aksen kedua | `--lilac` | `#7466EC` | `#9A8FFF` |
| Tombol utama | `--btn-bg` | nila | marigold |
| Kartu kode | `--code-bg` | `#1F1C47` | `#0E0D24` |

**Fase.** Hanya dipakai di pemutar pelajaran, cincin fase, dan tag fase. Masing-masing punya `-fill`, `-soft`, `-ink`, dan `-line`.

| Fase | Warna | fill |
|---|---|---|
| Pahami | biru langit | `#3E9BF0` |
| Perkuat | mint | `#1FB488` |
| Kuis | ungu anggur | `#8D5CF6` |
| Uji | koral | `#FF6A55` |

**Semantik:** benar = mint (Perkuat), salah = koral (Uji), peringatan = marigold.

**Bahasa:** Python, JavaScript, HTML, CSS, C, C++, Rust, Java, Go, SQL, Kotlin, PHP.
- Tiap bahasa punya `--lang-<id>`. Python punya warna kedua `--lang-python-2`.
- Badge bahasa memakai **monogram teks buatan sendiri** (Py, JS, `</>`, `{ }`, C, C++, Rs, Jv, Go, SQL, Kt, php), **bukan logo resmi**.
- Warna bahasa hanya untuk chip, sampul jalur, serta cincin dan jejak Pip.

**Kontras:** `python3 scripts/contrast.py` memeriksa 21 pasangan di kedua tema. Semua lulus AA (≥ 4,5:1).

## Tipografi

| Peran | Huruf | Catatan |
|---|---|---|
| Judul, angka besar | **Bricolage Grotesque** | Variabel: tebal 200–800, lebar 75–100. Judul besar memakai lebar 78–84 dan jarak huruf rapat. |
| Antarmuka & isi | **Plus Jakarta Sans** | Karya Tokotype, foundry Indonesia. Isi 16 px, tinggi baris 1,6. |
| Kode | **JetBrains Mono** | Ligatur aktif (`!=`, `=>`). |

**Skala:**

| Nama | Ukuran |
|---|---|
| hero | 46–102 px |
| h1 | 37–64 px |
| h2 | 28–43 px |
| h3 | 21–26 px |
| lead | 19 px |
| isi | 16 px |
| kecil | 14 px |
| mini | 12 px |

Semua huruf di-self-host di `mockups/fonts/` (latin + latin-ext, lisensi OFL).

## Bentuk

- **Sudut:** 8 / 12 / 18 / 26 / 36 px, dan pil.
  - kartu besar 26
  - tombol 14
  - chip pil
- **Bayangan "clay":** sorot tipis di atas dan bayangan hangat panjang di bawah. Hanya untuk objek yang memang terpisah: kartu utama, stepper, lab.
- **Tombol:** punya "bibir" 4 px di bawah yang tertekan saat diklik.

## Suara dan gaya bahasa

Seperti kakak kelas yang sabar.
- **Bahasa:** Indonesia santai tapi rapi, dengan sapaan "kamu". Istilah kode tetap dalam bahasa aslinya.
- **Sikap:**
  - **Jelas:** sebut barisnya dan namanya. Jangan "terjadi kesalahan".
  - **Hangat:** tidak ada kata "gagal" atau "bodoh".
  - **Jujur:** tidak memuji berlebihan dan tidak menyembunyikan error.
  - **Singkat:** satu kalimat pokok, lalu satu langkah berikutnya.

| Situasi | Ya | Jangan |
|---|---|---|
| Salah jawab | Belum tepat. Lihat baris 3: `skor` dipakai sebelum dibuat. | Salah! Coba lagi. |
| Error compiler | Compiler menolak baris 5 karena `total` belum dideklarasikan. | Terjadi kesalahan saat menjalankan kode. |
| Bab selesai | Bab 2 beres. Variabel sudah kamu kuasai. | LUAR BIASA!!! Kamu jenius!!! |
| Terkunci | Uji terbuka setelah Kuis mencapai 70%. | Akses ditolak. |

## Yang sengaja dihindari

- Tampilan klon IDE atau VS Code.
- Gradien ungu-biru.
- Emoji sebagai penanda.
- Statistik atau testimoni palsu.
- Logo bahasa resmi.
