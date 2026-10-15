/* Terminal Sandbox: bukan shell sungguhan, tapi perintah kecil yang sering dipakai
   (help, ls, cat, run, snapshot, clear) plus riwayat dengan ↑/↓ dan Tab untuk melengkapi nama berkas. */
import { useEffect, useRef, useState } from 'react';

export type TermLine = { k: 'in' | 'out' | 'err' | 'ok' | 'dim' | 'warn'; t: string };

export const HELP: TermLine[] = [
  { k: 'dim', t: 'Perintah:' },
  { k: 'out', t: '  run            jalankan proyek (sama dengan Ctrl+Enter)' },
  { k: 'out', t: '  ls             daftar berkas' },
  { k: 'out', t: '  cat <berkas>   tampilkan isi berkas' },
  { k: 'out', t: '  snapshot [nama] simpan versi (Ctrl+S)' },
  { k: 'out', t: '  clear          bersihkan layar' },
];

/* Perintah rahasia (tidak ada di help): orvi, orvi bilang <teks>, sudo …, matrix. */
const ORVI = ['      .-~~~-.', '     /  ^ ^  \\', '   ==|===‿===|==  o', '     \\       /', "      '-...-'"];

function bubble(text: string): string[] {
  const words = text.split(/\s+/), rows: string[] = [];
  let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > 34) { rows.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) rows.push(cur);
  const n = Math.max(...rows.map(r => r.length));
  const mid = rows.length === 1 ? [`< ${rows[0]} >`] : rows.map((r, i) => `${i === 0 ? '/' : i === rows.length - 1 ? '\\' : '|'} ${r.padEnd(n)} ${i === 0 ? '\\' : i === rows.length - 1 ? '/' : '|'}`);
  return [' ' + '_'.repeat(n + 2), ...mid, ' ' + '-'.repeat(n + 2), '    \\', '     \\'];
}

/** Kembalikan baris untuk perintah rahasia, atau null kalau bukan perintah rahasia. */
export function secretCommand(raw: string): TermLine[] | null {
  const t = raw.trim(), low = t.toLowerCase();
  if (low === 'orvi') return [...ORVI.map(x => ({ k: 'ok' as const, t: x })), { k: 'out', t: 'Hai! Aku Orvi. Coba "orvi bilang halo".' }];
  const say = /^orvi\s+bilang\s+(.+)$/i.exec(t);
  if (say) return [...bubble(say[1].slice(0, 200)).map(x => ({ k: 'out' as const, t: x })), ...ORVI.map(x => ({ k: 'ok' as const, t: x }))];
  if (low === 'sudo' || low.startsWith('sudo ')) return [{ k: 'warn', t: 'Kamu bukan root di sini, tapi kamu tetap keren. 😎' }];
  if (low === 'matrix') { dispatchEvent(new CustomEvent('os:egg', { detail: 'matrix' })); return [{ k: 'ok', t: 'Wake up, coder… 🟩' }]; }
  return null;
}

export function Terminal({ lines, files, onCommand, prompt }: { lines: TermLine[]; files: string[]; onCommand: (cmd: string) => void; prompt: string }) {
  const [v, setV] = useState('');
  const hist = useRef<string[]>([]), hi = useRef(-1);
  const box = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [lines]);
  return (
    <div ref={box} className="ide-term" onClick={() => { if (!getSelection()?.toString()) input.current?.focus(); }}>
      {lines.map((l, i) => <div key={i} className={`l ${l.k}`}>{l.k === 'in' ? <><span className="p">{prompt}</span> {l.t}</> : l.t}</div>)}
      <form className="in-row" onSubmit={e => { e.preventDefault(); const c = v.trim(); if (c) { hist.current.unshift(c); hi.current = -1; } onCommand(c); setV(''); }}>
        <span className="p">{prompt}</span>
        <input ref={input} value={v} onChange={e => setV(e.target.value)} spellCheck={false} autoComplete="off" aria-label="Perintah terminal"
          onKeyDown={e => {
            if (e.key === 'ArrowUp') { e.preventDefault(); hi.current = Math.min(hist.current.length - 1, hi.current + 1); setV(hist.current[hi.current] ?? v); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); hi.current = Math.max(-1, hi.current - 1); setV(hi.current < 0 ? '' : hist.current[hi.current]); }
            else if (e.key === 'Tab') {
              e.preventDefault();
              const m = /^(\S+\s+)(\S*)$/.exec(v);
              if (m) { const hit = files.filter(f => f.startsWith(m[2])); if (hit.length === 1) setV(m[1] + hit[0]); }
            }
          }} />
      </form>
    </div>
  );
}
