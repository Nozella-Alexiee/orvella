/* Daftar bahasa & stack yang didukung Orvella. `icon` merujuk ke berkas di assets/lang/ (Devicon, MIT). */
export type LangKind = 'run' | 'compile' | 'web' | 'query';
export type Lang = { id: string; name: string; rt: string; ext: string; kind: LangKind; icon: string; mono?: boolean; hello: string; out: string };

export const LANGS: Lang[] = [
  { id: 'python', name: 'Python', rt: 'Python 3.13', ext: 'py', kind: 'run', icon: 'python-original',
    hello: 'nama = "Orvella"\nprint(f"Halo, {nama}!")', out: 'Halo, Orvella!' },
  { id: 'javascript', name: 'JavaScript', rt: 'Node 22', ext: 'js', kind: 'run', icon: 'javascript-original',
    hello: 'const nama = "Orvella";\nconsole.log(`Halo, ${nama}!`);', out: 'Halo, Orvella!' },
  { id: 'html', name: 'HTML', rt: 'HTML5', ext: 'html', kind: 'web', icon: 'html5-original',
    hello: '<h1 class="halo">Halo, Orvella!</h1>\n<p>Halaman pertamaku.</p>', out: 'Halo, Orvella!' },
  { id: 'css', name: 'CSS', rt: 'CSS3', ext: 'css', kind: 'web', icon: 'css3-original',
    hello: '.halo {\n  color: #FFB224;\n  font-size: 2rem;\n}', out: 'Halo, Orvella!' },
  { id: 'c', name: 'C', rt: 'GCC 14 · C17', ext: 'c', kind: 'compile', icon: 'c-original',
    hello: '#include <stdio.h>\n\nint main(void) {\n    printf("Halo, Orvella!\\n");\n    return 0;\n}', out: 'Halo, Orvella!' },
  { id: 'cpp', name: 'C++', rt: 'GCC 14 · C++20', ext: 'cpp', kind: 'compile', icon: 'cplusplus-original',
    hello: '#include <iostream>\n\nint main() {\n    std::cout << "Halo, Orvella!\\n";\n}', out: 'Halo, Orvella!' },
  { id: 'rust', name: 'Rust', rt: 'Rust 1.86', ext: 'rs', kind: 'compile', icon: 'rust-original', mono: true,
    hello: 'fn main() {\n    let nama = "Orvella";\n    println!("Halo, {}!", nama);\n}', out: 'Halo, Orvella!' },
  { id: 'java', name: 'Java', rt: 'OpenJDK 21', ext: 'java', kind: 'compile', icon: 'java-original',
    hello: 'class Main {\n    public static void main(String[] a) {\n        System.out.println("Halo, Orvella!");\n    }\n}', out: 'Halo, Orvella!' },
  { id: 'go', name: 'Go', rt: 'Go 1.24', ext: 'go', kind: 'compile', icon: 'go-original',
    hello: 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Halo, Orvella!")\n}', out: 'Halo, Orvella!' },
  { id: 'sql', name: 'SQL', rt: 'SQLite 3', ext: 'sql', kind: 'query', icon: 'sqlite-original',
    hello: "SELECT 'Halo, Orvella!' AS sapaan;", out: ' sapaan\n----------------\n Halo, Orvella!\n(1 baris)' },
  { id: 'kotlin', name: 'Kotlin', rt: 'Kotlin 2.1', ext: 'kt', kind: 'compile', icon: 'kotlin-original',
    hello: 'fun main() {\n    println("Halo, Orvella!")\n}', out: 'Halo, Orvella!' },
  { id: 'php', name: 'PHP', rt: 'PHP 8.4', ext: 'php', kind: 'run', icon: 'php-original',
    hello: '<?php\n$nama = "Orvella";\necho "Halo, $nama!";', out: 'Halo, Orvella!' },
];
export const LANG_BY_ID: Record<string, Lang> = Object.fromEntries(LANGS.map(l => [l.id, l]));
export const KIND_LABEL: Record<LangKind, string> = { run: 'langsung jalan', compile: 'dikompilasi', web: 'pratinjau langsung', query: 'kueri ke tabel' };

/** Ikon tambahan untuk stack fullstack. */
export const STACK_ICONS: Record<string, { icon: string; mono?: boolean; name: string }> = {
  node: { icon: 'nodejs-original', name: 'Node.js' }, express: { icon: 'express-original', mono: true, name: 'Express' },
  flask: { icon: 'flask-original', mono: true, name: 'Flask' }, fastapi: { icon: 'fastapi-original', name: 'FastAPI' },
  mysql: { icon: 'mysql-original', name: 'MySQL' }, sqlite: { icon: 'sqlite-original', name: 'SQLite' },
};
