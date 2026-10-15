# Orvella: mockup desain

Orvella adalah nama baru GNOSIA setelah jadi project pribadi. Folder ini berisi **mockup desain saja**, tanpa kode produksi. Kode produksinya ada di root repo ini (`../`).

## Status fase

| Fase | Isi | Status |
|---|---|---|
| 1 | Identitas, maskot Orvi, komponen, landing page | **Siap dicek** |
| 2 | Layar siswa: onboarding, beranda, katalog & peta jalur, pemutar 4 fase multi-bahasa, playground, progres | Menunggu ACC fase 1 |
| 3 | Studio Materi untuk mentor, bank soal, kelas & tugas, review kode, admin & runtime bahasa | Belum |
| 4 | `ROADMAP-REBUILD.md`: urutan membangun ulang kode, termasuk runner multi-bahasa | Belum |

## Cara membuka

Buka `mockups/index.html` di browser. Tidak perlu build atau server, dan semua huruf serta pustaka sudah ada di folder `vendor/` dan `fonts/`.

Parameter URL yang berlaku di setiap halaman:

| Parameter | Nilai | Fungsi |
|---|---|---|
| `?theme=` | `light` / `dark` | Paksa tema Terang atau Malam |
| `?motion=` | `full` / `calm` / `off` | Intensitas gerak |
| `?state=` | lihat dok mockup | Lompat ke keadaan tertentu (mis. `coba-rust-error`) |
| `?clean=1` | | Sembunyikan dok mockup (untuk screenshot) |

Dok "Mockup" di kiri bawah juga bisa dipakai untuk pindah halaman, ganti tema, gerak, suara, dan state. **Dok itu khusus mockup** dan tidak ikut dibangun di produk.

## Isi folder

```
orvella-design/
├─ README.md   BRAND.md   ORVI.md   MOTION.md
├─ mockups/
│  ├─ index.html        galeri + keputusan + rencana fase
│  ├─ landing.html      landing page
│  ├─ brand.html        identitas + lembar maskot Orvi
│  ├─ styleguide.html   komponen hidup
│  ├─ css/  tokens.css (sumber token) · base.css · components.css · per halaman
│  ├─ js/   orvi.js (maskot) · fx.js (kit gerak) · sound.js · ui.js · mock.js · per halaman
│  ├─ vendor/  GSAP 3.15 + plugin, lucide, canvas-confetti
│  ├─ fonts/   Bricolage Grotesque, Plus Jakarta Sans, JetBrains Mono (OFL)
│  └─ thumbs/  cuplikan untuk galeri
├─ scripts/
│  ├─ shot.mjs      screenshot + laporan error JS, satu halaman per run
│  └─ contrast.py   cek kontras WCAG token Terang & Malam (harus tanpa FAIL)
└─ shots/           hasil screenshot (boleh dihapus)
```

## Skrip

```bash
python3 scripts/contrast.py
node scripts/shot.mjs landing dark 390                      # → shots/landing-dark-390.png
FULL=1 SCROLL=1 node scripts/shot.mjs brand light 1440       # seluruh halaman
Y=1000 CLICK="#cobaTabs [data-p=rust];#cbNext" node scripts/shot.mjs landing
```

`shot.mjs` memakai Playwright dari `sigchat/frontend/node_modules`. Set `PW_PATH` bila lokasinya berbeda.

## Catatan teknis untuk rebuild nanti

- **Token** hanya di `mockups/css/tokens.css`. Komponen tidak boleh memakai warna literal, kecuali teks nila `#1E1C45` di atas marigold.
- **Orvi** adalah SVG yang dibangun `js/orvi.js`. Untuk React, port jadi `<Orvi mood tint size/>` plus hook `useOrvi()` untuk `say/point/carry`. Detailnya di `ORVI.md`.
- **Gerak** memakai GSAP (gratis untuk komersial sejak 3.13). Semua efek membaca `FX.level()`; detailnya di `MOTION.md`.
- **Output program** di mockup disimulasikan. Hanya HTML/CSS yang benar-benar dirender di iframe.
