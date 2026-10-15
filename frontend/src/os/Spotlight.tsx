/* Spotlight (Ctrl/⌘ K): cari app, aksi, proyek, bab, konsep, dan teman. Ketik =12*(3+4)
   untuk menghitung. Dimatikan saat Kuis dan Uji supaya penilaian tetap jujur. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { gsap } from 'gsap';
import { useApi, useMe } from '../api/hooks';
import { isAdmin } from '../app/common';
import { Icon } from '../design/Icon';
import { toast } from '../design/toast';
import { calc } from '../lib/calc';
import { askOrvi } from './orviActions';
import { motion, sound } from '../fx';
import { usePrefs } from '../state/prefs';
import { APPS } from './registry';
import { useWM } from './wm';
import { useOs } from './OsLayout';
import { usePresence } from './presence';

type Entry = { g: string; icon: string; title: string; hint?: string; run: () => void; kbd?: string; color?: string };
type PalItem = { icon: string; title: string; hint?: string; href?: string };
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function score(e: Entry, q: string) {
  if (!q) return e.g === 'Pintasan' ? -1 : 1;
  const t = norm(`${e.title} ${e.hint || ''} ${e.g}`);
  let pos = 0, s = 0;
  for (const ch of q) { const i = t.indexOf(ch, pos); if (i < 0) return -1; s += i === pos ? 3 : 1; pos = i + 1; }
  return s + (norm(e.title).startsWith(q) ? 20 : 0);
}
const blocked = () => { const a = useWM.getState().wins.find(w => w.id === useWM.getState().active); return !!a && a.app === 'fokus' && /\/(kuis|uji)/.test(a.path); };

export function Spotlight() {
  const [open, setOpen] = useState<false | string>(false);
  const nav = useNavigate();
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); if (!blocked()) setOpen(o => (o === false ? '' : false)); }
      if (mod && e.key.toLowerCase() === 'n' && !e.shiftKey && !blocked()) { e.preventDefault(); nav('/sandbox?baru=1'); }
    };
    const o = (e: Event) => { if (!blocked()) setOpen(((e as CustomEvent<string>).detail) || ''); };
    addEventListener('keydown', k); addEventListener('os:spot', o);
    return () => { removeEventListener('keydown', k); removeEventListener('os:spot', o); };
  }, [nav]);
  return open === false ? null : createPortal(<Spot initial={open} close={() => setOpen(false)} />, document.body);
}

function Spot({ initial, close }: { initial: string; close: () => void }) {
  const nav = useNavigate();
  const os = useOs();
  const toggleTheme = usePrefs(s => s.toggleTheme);
  const { data: me } = useMe();
  const pal = useApi<{ continue: PalItem[]; chapters: PalItem[]; concepts: PalItem[] }>('/api/palette');
  const projs = useApi<{ items: { id: number; title: string; kind: string; lang: string; updated: string }[] }>('/api/sandbox');
  const friends = usePresence(s => s.people);
  const [q, setQ] = useState(initial === '?' ? '' : initial);
  const [sel, setSel] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (box.current && motion() !== 'off') gsap.from(box.current, { y: -18, scale: .97, opacity: 0, duration: .28, ease: 'back.out(1.6)' }); }, []);
  const go = (path: string) => () => nav(path);
  const desk = (d: string, id: string) => window.setTimeout(() => dispatchEvent(new CustomEvent('os:desk', { detail: { do: d, id } })), 120);
  const entries = useMemo<Entry[]>(() => [
    ...APPS.filter(a => a.dock || a.id === 'playground').map(a => ({ g: 'Aplikasi', icon: a.icon, title: a.title, hint: 'Buka app', run: () => os?.openApp(a.id), color: a.color })),
    ...(isAdmin(me?.role) ? [{ g: 'Aplikasi', icon: 'layout-dashboard', title: 'Dashboard Admin', hint: 'Pengguna, materi, setelan', run: go('/admin') }] : []),
    ...(me?.role === 'mentor' || isAdmin(me?.role) ? [{ g: 'Aplikasi', icon: 'chart-no-axes-column', title: 'Ruang Mentor', hint: 'Kelas, siswa, review', run: go('/mentor') }] : []),
    { g: 'Aksi', icon: 'file-plus', title: 'Proyek baru', hint: 'Web, Python, C++, Rust, Node…', run: go('/sandbox?baru=1'), kbd: 'Ctrl N' },
    { g: 'Aksi', icon: 'layout-dashboard', title: 'Tampilkan desktop', hint: 'Kecilkan semua jendela', run: () => os?.showDesktop() },
    { g: 'Aksi', icon: 'sun-moon', title: 'Ganti Siang / Malam', hint: 'Tema desktop', run: toggleTheme },
    { g: 'Aksi', icon: 'sparkles', title: 'Tur bersama Orvi', hint: 'Kenalan dengan desktop ini', run: () => dispatchEvent(new CustomEvent('os:tour')) },
    { g: 'Aksi', icon: 'radio', title: 'Putar musik', hint: 'Spotify · Apple Music', run: () => os?.openApp('musik') },
    { g: 'Aksi', icon: 'zap', title: 'Kuis harian', hint: '5 soal acak', run: go('/kuis-harian') },
    { g: 'Aksi', icon: 'braces', title: 'Tebak output hari ini', hint: 'Widget desktop · +5 XP', run: () => { os?.showDesktop(); desk('add', 'teka'); } },
    { g: 'Aksi', icon: 'timer', title: 'Timer fokus', hint: 'Pomodoro 25/5 di desktop', run: () => { os?.showDesktop(); desk('add', 'fokus'); } },
    { g: 'Aksi', icon: 'notebook-pen', title: 'Catatan tempel', hint: 'Tulis sesuatu di desktop', run: () => { os?.showDesktop(); desk('add', 'catatan'); } },
    { g: 'Aksi', icon: 'presentation', title: 'Gabung kuis langsung', hint: 'Masukkan PIN dari mentor', run: go('/gabung') },
    { g: 'Aksi', icon: 'swords', title: 'Duel 1 lawan 1', hint: 'Tantang teman sekelas', run: go('/duel') },
    { g: 'Aksi', icon: 'award', title: 'Lencana & level', hint: 'Koleksi stiker', run: go('/pengaturan#lencana') },
    { g: 'Aksi', icon: 'image', title: 'Ganti wallpaper', hint: 'Pengaturan', run: go('/pengaturan#wallpaper') },
    { g: 'Orvi', icon: 'orvi-ai', title: 'Orvi AI', hint: 'Tanya apa aja, atau minta bantu ngoding', run: go('/orvi'), kbd: 'Ctrl J' },
    { g: 'Orvi', icon: 'message-circle', title: 'Tip Orvi', hint: 'Tip untuk jendela ini', run: askOrvi },
    { g: 'Orvi', icon: 'moon', title: 'Tidurkan Orvi', hint: 'orvi tidur', run: () => dispatchEvent(new CustomEvent('os:egg', { detail: 'tidur' })) },
    ...(pal.data?.continue || []).map(i => ({ g: 'Lanjutkan', icon: i.icon, title: i.title, hint: i.hint, run: go(i.href || '/beranda') })),
    ...(projs.data?.items || []).slice(0, 8).map(p => ({ g: 'Proyek', icon: 'code-xml', title: p.title, hint: `${p.kind === 'web' ? 'Web' : p.lang} · ${p.updated}`, run: go(`/sandbox/${p.id}`) })),
    ...(pal.data?.chapters || []).map(i => ({ g: 'Bab', icon: i.icon, title: i.title, hint: i.hint, run: go(i.href || '/peta') })),
    ...(pal.data?.concepts || []).map(i => ({ g: 'Konsep', icon: i.icon, title: i.title, hint: i.hint, run: go(i.href || '/peta') })),
    ...friends.map(f => ({ g: 'Teman', icon: 'user', title: f.name, hint: f.what || 'online', run: () => { const el = document.querySelector('.os-mb-friends') as HTMLElement | null; el?.click(); } })),
    { g: 'Pintasan', icon: 'keyboard', title: 'Ctrl K', hint: 'Buka Spotlight', run: () => {} },
    { g: 'Pintasan', icon: 'keyboard', title: 'Seret jendela ke tepi', hint: 'Bagi layar setengah; ke sudut: seperempat; ke atas: penuh', run: () => {} },
    { g: 'Pintasan', icon: 'keyboard', title: 'Esc', hint: 'Keluar dari Mode Fokus atau menutup Spotlight', run: () => {} },
    { g: 'Pintasan', icon: 'keyboard', title: 'Ctrl Enter · Ctrl S', hint: 'Jalankan · snapshot (di Sandbox)', run: () => {} },
  ], [pal.data, projs.data, friends, os, toggleTheme, me?.role]); // eslint-disable-line react-hooks/exhaustive-deps
  const qs = norm(q.trim().replace(/^=/, ''));
  let math: number | null = null;
  if (/^=?\s*[\d\s+\-*/().]+$/.test(q) && /\d/.test(q) && /[+\-*/]/.test(q)) { try { const v = calc(q.replace(/^=/, ''), {}); if (Number.isFinite(v)) math = v; } catch { /* belum lengkap */ } }
  // perintah rahasia: hanya muncul kalau diketik persis
  const secret: Entry[] = qs === 'orvi dansa' ? [{ g: 'Rahasia', icon: 'music', title: 'Orvi dansa', hint: 'Tekan Enter', run: () => dispatchEvent(new CustomEvent('os:egg', { detail: 'dansa' })) }]
    : qs === 'matrix' ? [{ g: 'Rahasia', icon: 'terminal', title: 'Matrix', hint: 'Tekan Enter', run: () => dispatchEvent(new CustomEvent('os:egg', { detail: 'matrix' })) }] : [];
  const rows = [...secret, ...entries].map(e => [e, score(e, q.startsWith('=') ? '' : qs)] as const)
    .filter(([e, s]) => s >= 0 && (initial !== '?' || e.g === 'Pintasan' || qs) && (qs || !['Bab', 'Konsep'].includes(e.g)))
    .sort((a, b) => b[1] - a[1]).slice(0, 12).map(([e]) => e);
  const run = (e?: Entry) => { close(); if (e) { sound('tap'); e.run(); } };
  let group = '';
  return (
    <div className="os-spot-wrap">
      <div className="os-spot-scrim" onClick={close} />
      <div ref={box} className="os-spot" role="dialog" aria-label="Spotlight">
        <div className="os-spot-in"><Icon name="search" size={20} />
          <input autoFocus value={q} placeholder="Cari app, proyek, bab, teman, atau ketik =12*(3+4)" aria-label="Cari" spellCheck={false}
            onChange={e => { setQ(e.target.value); setSel(0); }}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { setSel(s => Math.min(rows.length - 1, s + 1)); e.preventDefault(); }
              else if (e.key === 'ArrowUp') { setSel(s => Math.max(0, s - 1)); e.preventDefault(); }
              else if (e.key === 'Escape') { close(); e.preventDefault(); }
              else if (e.key === 'Enter') {
                e.preventDefault();
                if (math !== null && (q.startsWith('=') || !rows.length)) { navigator.clipboard?.writeText(String(math)).catch(() => {}); toast({ icon: 'calculator', title: 'Disalin', body: `Hasil <b>${math}</b> ada di clipboard.` }); close(); }
                else run(rows[sel]);
              }
            }} /><kbd>Esc</kbd></div>
        <div className="os-spot-list" role="listbox">
          {math !== null && <div className="os-spot-calc"><b>{+math.toFixed(8)}</b><span>hasil hitungan · Enter untuk menyalin</span></div>}
          {rows.map((e, i) => {
            const head = !qs && e.g !== group ? (group = e.g) : null;
            return (
              <div key={e.g + e.title + i}>
                {head && <div className="os-spot-group">{head}</div>}
                <button className="os-spot-row" role="option" aria-selected={i === sel} onMouseMove={() => setSel(i)} onClick={() => run(e)}>
                  <span className="os-spot-ico" style={e.color ? { background: e.color, color: '#fff' } : undefined}><Icon name={e.icon} /></span>
                  <span><b>{e.title}</b>{e.hint && <small>{e.hint}</small>}</span>{e.kbd && <kbd>{e.kbd}</kbd>}
                </button>
              </div>
            );
          })}
          {!rows.length && math === null && <div className="os-spot-group">Tidak ada yang cocok. Coba "sandbox", "python", atau "malam".</div>}
        </div>
        <div className="os-spot-foot"><span><kbd>↑</kbd><kbd>↓</kbd> pilih</span><span><kbd>↵</kbd> buka</span><span><kbd>=</kbd> hitung</span></div>
      </div>
    </div>
  );
}
