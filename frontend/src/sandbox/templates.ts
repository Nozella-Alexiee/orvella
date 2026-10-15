/* Katalog "Proyek baru": template yang dikirim ke POST /api/sandbox. Isi berkas web diambil dari
   backend (services/stacks.py); template di sini hanya memilih jenis, bahasa, dan kadang berkas awal. */
export type Template = {
  id: string; cat: 'web' | 'konsol' | 'data' | 'kosong'; title: string; hint: string; icons: string[]; color: string; files: string[];
  body: { kind: 'program' | 'web'; lang?: string; stack?: string; title?: string; files?: Record<string, string> };
};

const PY_SQLITE = `# Python + SQLite: tabel kecil di database berkas data.db
import sqlite3

db = sqlite3.connect("data.db")
db.execute("CREATE TABLE IF NOT EXISTS buku (id INTEGER PRIMARY KEY, judul TEXT, tahun INTEGER)")
db.executemany("INSERT INTO buku (judul, tahun) VALUES (?, ?)", [
    ("Laskar Pelangi", 2005),
    ("Bumi Manusia", 1980),
    ("Cantik Itu Luka", 2002),
])
db.commit()

for judul, tahun in db.execute("SELECT judul, tahun FROM buku WHERE tahun > 2000 ORDER BY tahun"):
    print(f"{tahun}  {judul}")
`;

export const CATS: { id: Template['cat'] | 'semua'; label: string; icon: string }[] = [
  { id: 'semua', label: 'Semua', icon: 'layout-grid' },
  { id: 'web', label: 'Web & server', icon: 'globe' },
  { id: 'konsol', label: 'Program konsol', icon: 'terminal' },
  { id: 'data', label: 'Data', icon: 'database' },
  { id: 'kosong', label: 'Kosong', icon: 'folder' },
];

export const TEMPLATES: Template[] = [
  { id: 'static', cat: 'web', title: 'Web statis', hint: 'HTML, CSS, dan JS. Pratinjau langsung saat mengetik.', icons: ['html', 'css', 'javascript'],
    color: 'var(--lang-html)', files: ['index.html', 'style.css', 'script.js'], body: { kind: 'web', stack: 'static' } },
  { id: 'node', cat: 'web', title: 'Node + Express', hint: 'API + halaman, database SQLite bawaan Node.', icons: ['node', 'express'],
    color: '#5FA04E', files: ['server.js', 'public/'], body: { kind: 'web', stack: 'node' } },
  { id: 'flask', cat: 'web', title: 'Python Flask', hint: 'Web Python dengan template Jinja dan SQLite.', icons: ['python', 'flask'],
    color: 'var(--lang-python)', files: ['app.py', 'templates/'], body: { kind: 'web', stack: 'flask' } },
  { id: 'php', cat: 'web', title: 'PHP + MySQL', hint: 'CRUD dengan database MySQL milik proyekmu sendiri.', icons: ['php', 'mysql'],
    color: 'var(--lang-php)', files: ['public/index.php', 'db.php'], body: { kind: 'web', stack: 'php' } },
  { id: 'fastapi', cat: 'web', title: 'FastAPI + frontend', hint: 'API JSON + halaman, skor disimpan di SQLite.', icons: ['fastapi', 'javascript'],
    color: '#059487', files: ['main.py', 'static/'], body: { kind: 'web', stack: 'fastapi' } },
  { id: 'python', cat: 'konsol', title: 'Python', hint: 'Program terminal dengan input dan output.', icons: ['python'], color: 'var(--lang-python)',
    files: ['main.py'], body: { kind: 'program', lang: 'python' } },
  { id: 'javascript', cat: 'konsol', title: 'JavaScript (Node)', hint: 'Program terminal dengan Node.js.', icons: ['javascript'], color: 'var(--lang-javascript)',
    files: ['main.js'], body: { kind: 'program', lang: 'javascript' } },
  { id: 'cpp', cat: 'konsol', title: 'C++', hint: 'Dikompilasi g++ lalu dijalankan.', icons: ['cpp'], color: 'var(--lang-cpp)', files: ['main.cpp'], body: { kind: 'program', lang: 'cpp' } },
  { id: 'c', cat: 'konsol', title: 'C', hint: 'Dikompilasi gcc lalu dijalankan.', icons: ['c'], color: 'var(--lang-c)', files: ['main.c'], body: { kind: 'program', lang: 'c' } },
  { id: 'rust', cat: 'konsol', title: 'Rust', hint: 'Kompiler rustc yang ramah pesan error.', icons: ['rust'], color: 'var(--lang-rust)', files: ['main.rs'], body: { kind: 'program', lang: 'rust' } },
  { id: 'go', cat: 'konsol', title: 'Go', hint: 'Program Go, cepat dikompilasi.', icons: ['go'], color: 'var(--lang-go)', files: ['main.go'], body: { kind: 'program', lang: 'go' } },
  { id: 'java', cat: 'konsol', title: 'Java', hint: 'Kelas Main dengan OpenJDK.', icons: ['java'], color: 'var(--lang-java)', files: ['Main.java'], body: { kind: 'program', lang: 'java' } },
  { id: 'kotlin', cat: 'konsol', title: 'Kotlin', hint: 'Kotlin di JVM.', icons: ['kotlin'], color: 'var(--lang-kotlin)', files: ['main.kt'], body: { kind: 'program', lang: 'kotlin' } },
  { id: 'phpcli', cat: 'konsol', title: 'PHP', hint: 'Skrip PHP di terminal.', icons: ['php'], color: 'var(--lang-php)', files: ['main.php'], body: { kind: 'program', lang: 'php' } },
  { id: 'sql', cat: 'data', title: 'SQL (SQLite)', hint: 'Tulis CREATE, INSERT, lalu SELECT. Hasilnya tampil sebagai tabel.', icons: ['sql', 'sqlite'],
    color: 'var(--lang-sql)', files: ['main.sql'], body: { kind: 'program', lang: 'sql' } },
  { id: 'pysqlite', cat: 'data', title: 'Python + SQLite', hint: 'Olah data dengan modul sqlite3 bawaan Python.', icons: ['python', 'sqlite'],
    color: 'var(--lang-python)', files: ['main.py'], body: { kind: 'program', lang: 'python', title: 'Data buku', files: { 'main.py': PY_SQLITE } } },
  { id: 'node-db', cat: 'data', title: 'API + SQLite (Node)', hint: 'Express dengan tabel SQLite. Lihat isinya di panel Database.', icons: ['node', 'sqlite'],
    color: '#5FA04E', files: ['server.js'], body: { kind: 'web', stack: 'node', title: 'API buku tamu' } },
  { id: 'php-db', cat: 'data', title: 'PHP + MySQL', hint: 'Database MySQL sendiri. Unduh atau impor isinya sebagai .sql.', icons: ['php', 'mysql'],
    color: 'var(--lang-php)', files: ['public/index.php'], body: { kind: 'web', stack: 'php', title: 'Daftar tugas' } },
  { id: 'blank-web', cat: 'kosong', title: 'Halaman kosong', hint: 'Satu index.html kosong. Mulai dari nol.', icons: ['html'], color: 'var(--lang-html)',
    files: ['index.html'], body: { kind: 'web', stack: 'static', title: 'Proyek kosong', files: { 'index.html': '<!doctype html>\n<html lang="id">\n<head>\n  <meta charset="utf-8">\n  <title>Proyek baru</title>\n</head>\n<body>\n  \n</body>\n</html>\n' } } },
  { id: 'blank-py', cat: 'kosong', title: 'Python kosong', hint: 'Satu main.py kosong.', icons: ['python'], color: 'var(--lang-python)',
    files: ['main.py'], body: { kind: 'program', lang: 'python', title: 'Program kosong', files: { 'main.py': '' } } },
];
