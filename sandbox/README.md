# Image sandbox Orvella

Tiap folder berisi satu image yang dipakai layanan `runner` untuk menjalankan kode siswa.
Semua image dibangun dengan `./scripts/build-sandbox.sh` dan diberi nama `orvella-sbx-<nama>`.
Runner hanya mau menjalankan image yang ada di daftar ini.

| Image | Bahasa / stack |
|---|---|
| `py`   | Python, SQL (SQLite), Flask, FastAPI |
| `node` | JavaScript, Node + Express |
| `php`  | PHP (pdo_mysql, mysqli) |
| `c`    | C, C++ (GCC) |
| `rust` | Rust |
| `jvm`  | Java, Kotlin |
| `go`   | Go |

Setiap container sandbox berjalan sebagai uid 10001 tanpa jaringan, rootfs read-only,
semua capability dicabut, dengan batas memori, CPU, jumlah proses dan waktu.
