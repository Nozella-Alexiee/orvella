# Orvi dan Pip: spesifikasi maskot

Versi interaktifnya ada di `mockups/brand.html#orvi`. Implementasinya di `mockups/js/orvi.js` (satu file, tanpa dependensi selain GSAP).

## Siapa Orvi

**Orvi:**
- Bola cahaya kecil berwarna marigold yang menemani belajar.
- Sifatnya penasaran, sabar, dan jujur.
- Tidak pernah marah, mengejek, atau menangis.

**Pip:**
- Bulan mungil yang terus mengitari Orvi.
- Menjadi satu-satunya "tangan" Orvi: menunjuk, membawa nilai, lalu kembali ke orbit.

Maskot ini desain orisinal dan tidak diturunkan dari Nosi atau maskot lain.

## Konstruksi (viewBox −110…110)

| Bagian | Ukuran |
|---|---|
| Badan | lingkaran r 58, gradien radial `#FFF3C9 → #FFC53D → #F28C00` (tepi bawah bercampur sedikit warna cincin) |
| Cincin | elips rx 88 · ry 22, miring −16°. Separuh belakang digambar di belakang badan (opasitas .4), separuh depan di atasnya. |
| Pip | r 10, warna bulan `--pip`, dua kawah, dua mata titik. Skala 0,82–1,18 menurut kedalaman. |
| Jejak Pip | 4 titik berwarna cincin yang memudar |
| Mata | elips 7,6 × 10,2 di (±19, −3), dua kilau putih. Mengikuti kursor sampai 4,4 unit. |
| Pipi | elips 8,5 × 5 di (±33, 15), `--orvi-cheek` |
| Pantulan | elips di kiri atas, selalu di posisi sama |
| Cahaya | lingkaran r 106 bergradien, opasitas .42 (Terang) atau .62 (Malam) |
| Bayangan | elips di bawah, mengecil saat Orvi melompat |

**Ilusi 3D:** saat Pip berada di separuh belakang orbit (sin t < 0), elemennya dipindah ke lapisan belakang badan.

## Mood

| mood | Mata | Mulut | Pip (1 putaran) | Dipakai saat |
|---|---|---|---|---|
| `idle` | terbuka, ikut kursor | senyum | 5,2 d | keadaan dasar |
| `happy` | melengkung ^ ^ | senyum lebar | 3,6 d | benar, langkah selesai |
| `think` | lirik kanan atas, alis naik | miring | 10 d, gelembung pikiran | memeriksa, menyiapkan petunjuk |
| `focus` | menyipit, alis turun | datar | 8 d | selama Kuis & Uji (ukuran kecil) |
| `oops` | membesar, alis naik | "o" | 2,6 d, orbit bergoyang | salah jawab, error |
| `sleep` | terpejam, "zZ" | kecil | berhenti di atas kepala | 30 d tanpa aktivitas |
| `cheer` | melengkung | terbuka lebar | 1,1 d, kilau | bab selesai, level naik |

**Mood dasar dan momen:**
- `mood(x)` mengubah mood dasar.
- `react(x, ms)` memainkan momen lalu kembali ke mood dasar.
- `celebrate()` dan `oops()` adalah momen dengan gerak badan.

## API

```js
const o = Orvi.mount(el, { size: 160, mood: 'idle', tint: 'python', follow: true, idle: false, idleMs: 30000, poke: true, side: 'right' });
o.mood('think');            o.react('happy', 900);
o.celebrate();              o.oops();
o.sleep();                  o.wake();
o.say('Lihat baris 3.', { ms: 2600, side: 'top' });   // → Promise, juga dibacakan (aria-live)
o.point(el, { at: 'tr' | 'left' | 'top' | 'center' }); // → Promise
o.carry(fromEl, toEl, { label: '10', onDrop });        // → Promise
o.tint('rust' | '#hex' | null);   o.size(96);   o.flyTo(anchorEl);   o.destroy();
Orvi.svg({ mood, tint, size, pipT })  // SVG statis untuk stiker, kartu, ikon
```

## Perilaku otomatis

- **Kedip** tiap 2,4–6,2 detik, dengan kedip ganda 18% dari waktu.
- **Mengambang** naik-turun 3,6 unit dengan periode 3,2 detik. Saat Kalem, geraknya 1,4 unit.
- **Kursor diam lebih dari 4 detik:** Orvi melirik ke sekitar secara acak.
- **Dicolek:** memantul, tersenyum, dan mengeluarkan kilau. Enam colekan dalam 2 detik membuatnya pusing ("Aduh, pusing. Pelan-pelan ya.").
- **Tidur otomatis** (opsional, `idle: true`). Bangun saat ada aktivitas.
- **Kinerja:**
  - Satu loop `requestAnimationFrame` untuk semua instance.
  - Instance di luar layar dilewati.
  - Loop berhenti saat tab tersembunyi.

## Pip keluar orbit

- **`point`:** Pip "melepas diri" menjadi elemen melayang (`.pip-flyer`), terbang melengkung ke target, mengetuk dua kali, diam 0,7 detik, lalu kembali ke posisinya yang terkini. Target dilacak tiap frame, jadi tetap tepat walau halaman sedang digulir.
- **`carry`:** sama, dengan tambahan muatan (`.pip-cargo`) yang diambil dari elemen asal lalu dijatuhkan ke kotak tujuan. `onDrop` dipanggil saat muatan jatuh.
- **Gerak Mati:**
  - `point` hanya memberi garis putus-putus pada target.
  - `carry` langsung memanggil `onDrop`.

## Ukuran

| Ukuran | px | Tempat |
|---|---|---|
| xs | 28 | navigasi & tab (tanpa pipi, jejak, kawah) |
| sm | 56 | balon petunjuk, toast besar |
| md | 96 | kartu, umpan balik |
| lg | 160 | halaman kosong |
| xl | 240+ | hero, selebrasi |

## Aturan pakai

**Boleh:**
- Satu Orvi besar per layar.
- Pip hanya menunjuk hal yang sedang dibahas.
- Mood Fokus selama Kuis/Uji.
- Warna cincin mengikuti bahasa.
- Semua ucapan juga masuk `aria-live`.

**Jangan:**
- Mengubah warna badan.
- Membuat Orvi marah atau mengejek.
- Menutupi tombol utama atau teks soal.
- Menambah Pip kedua atau memberi Orvi tangan.
- Menggerakkan Orvi saat gerak Mati.

## Stiker pencapaian (contoh)

| Stiker | Syarat |
|---|---|
| Paham! | fase Pahami pertama |
| Kuis sempurna | 10 dari 10 benar |
| 7 hari beruntun | belajar seminggu penuh |
| Pembasmi bug | memperbaiki 10 error |
| Kompilasi pertama | program C++ pertama |
| Pemilik sejati | lulus bab ownership Rust |
| Halaman pertama | HTML pertama tampil |
| Si begadang | belajar lewat jam 10 malam |

Semua stiker dibuat dari `Orvi.svg()` dengan mood dan warna cincin yang berbeda.

## Port ke React (fase rebuild)

- `<Orvi>` merender SVG yang sama.
- State (`t`, `sx/sy`, `look`) disimpan di `useRef` dan diperbarui oleh satu ticker global.
- `useOrvi()` mengembalikan `say`, `point`, dan `carry`.
- `.pip-flyer` dirender lewat portal ke `document.body`.
