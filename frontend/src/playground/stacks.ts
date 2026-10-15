/* Stack proyek web yang bisa dijalankan di workspace. Ikon memakai LangIcon (bahasa + STACK_ICONS). */
export type Stack = { name: string; hint: string; icons: string[]; color: string; db: 'mysql' | 'sqlite' | null; run: string };

export const STACKS: Record<string, Stack> = {
  static: { name: 'HTML/CSS/JS statis', hint: 'kartu profil · 4 berkas', icons: ['html', 'css', 'javascript'], color: 'var(--lang-html)', db: null, run: 'python3 -m http.server 8080' },
  node: { name: 'Node.js + Express', hint: 'buku tamu · API + SQLite', icons: ['node', 'express'], color: '#5FA04E', db: 'sqlite', run: 'node --watch server.js' },
  php: { name: 'PHP + MySQL', hint: 'daftar tugas · CRUD', icons: ['php', 'mysql'], color: 'var(--lang-php)', db: 'mysql', run: 'php -S 0.0.0.0:8080 -t public' },
  flask: { name: 'Python Flask', hint: 'catatan · template Jinja', icons: ['python', 'flask'], color: 'var(--lang-python)', db: 'sqlite', run: 'flask --app app --debug run' },
  fastapi: { name: 'FastAPI + frontend', hint: 'kuis · API JSON + SQLite', icons: ['fastapi', 'javascript'], color: '#059487', db: 'sqlite', run: 'uvicorn main:app --reload' },
};

const EXT_LANG: Record<string, string> = {
  py: 'python', js: 'javascript', mjs: 'javascript', cjs: 'javascript', json: 'javascript', ts: 'javascript', html: 'html', htm: 'html',
  ejs: 'html', css: 'css', php: 'php', sql: 'sql', rs: 'rust', go: 'go', java: 'java', c: 'c', cpp: 'cpp', kt: 'kotlin',
};
export const langOfPath = (p: string) => EXT_LANG[(p.split('.').pop() || '').toLowerCase()] || 'text';
