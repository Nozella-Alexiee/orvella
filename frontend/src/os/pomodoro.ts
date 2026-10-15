/* Timer fokus (Pomodoro) untuk desktop: satu timer global, tetap jalan walau widgetnya dibuang atau
   halaman dimuat ulang (disimpan di localStorage). Selama fase fokus, teman sekelas melihat
   "Timer fokus · 18 mnt lagi" dan Orvi di dock ikut serius. */
import { create } from 'zustand';
import { api } from '../api/client';
import { toast } from '../design/toast';
import { confetti, sound } from '../fx';
import { emit } from './bus';
import { presence } from './presence';

export type Phase = 'work' | 'rest';
type S = { phase: Phase; running: boolean; endsAt: number; left: number; work: number; rest: number; today: number };
const KEY = 'orvella-pomodoro';
const load = (): Partial<S> => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const saved = load();
const clampMin = (m: unknown, d: number) => Math.max(1, Math.min(90, Math.round(Number(m) || d)));

export const usePomodoro = create<S>(() => ({
  phase: saved.phase === 'rest' ? 'rest' : 'work', running: !!saved.running, endsAt: saved.endsAt || 0,
  work: clampMin(saved.work, 25), rest: clampMin(saved.rest, 5), left: saved.left || clampMin(saved.work, 25) * 60_000, today: 0,
}));
usePomodoro.subscribe(s => { try { localStorage.setItem(KEY, JSON.stringify({ phase: s.phase, running: s.running, endsAt: s.endsAt, left: s.left, work: s.work, rest: s.rest })); } catch { /* */ } });

export const remaining = (s = usePomodoro.getState()) => (s.running ? Math.max(0, s.endsAt - Date.now()) : s.left);
export const mmss = (ms: number) => { const t = Math.ceil(ms / 1000); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
const full = (s: S, p: Phase = s.phase) => (p === 'work' ? s.work : s.rest) * 60_000;

/** Status teman sekelas selama fase fokus berjalan. Dipanggil juga oleh OsLayout sebelum menulis status jendela. */
export function focusPresence(): boolean {
  const s = usePomodoro.getState();
  if (!s.running || s.phase !== 'work') return false;
  presence.state('pomodoro', `Timer fokus · ${Math.max(1, Math.ceil(remaining(s) / 60_000))} mnt lagi`);
  return true;
}

export const pomodoro = {
  start() {
    const s = usePomodoro.getState();
    usePomodoro.setState({ running: true, endsAt: Date.now() + (s.left || full(s)) });
    sound('tap'); focusPresence();
    emit('pomodoro:start', { phase: s.phase });
  },
  pause() { const s = usePomodoro.getState(); usePomodoro.setState({ running: false, left: remaining(s) }); emit('pomodoro:stop', {}); },
  reset(phase?: Phase) { const s = usePomodoro.getState(), p = phase || s.phase; usePomodoro.setState({ running: false, phase: p, left: full(s, p) }); emit('pomodoro:stop', {}); },
  set(work: number, rest: number) {
    const s = usePomodoro.getState(), w = clampMin(work, 25), r = clampMin(rest, 5);
    usePomodoro.setState({ work: w, rest: r, ...(s.running ? {} : { left: (s.phase === 'work' ? w : r) * 60_000 }) });
  },
};

async function finish() {
  const s = usePomodoro.getState();
  if (s.phase === 'work') {
    usePomodoro.setState({ running: false, phase: 'rest', left: full(s, 'rest') });
    sound('level'); confetti();
    emit('pomodoro:done', { phase: 'work' });
    try { const r = await api.post<{ today: number }>('/api/pomodoro/selesai', { minutes: s.work }); usePomodoro.setState({ today: r.today }); } catch { /* offline: tetap lanjut */ }
    const n = usePomodoro.getState().today;
    toast({ kind: 'success', icon: 'timer', title: `Fokus ${s.work} menit selesai!`, body: `${n ? `Sesi ke-${n} hari ini. ` : ''}Istirahat ${s.rest} menit dulu?`,
      actions: [{ label: 'Mulai istirahat', primary: true, run: () => pomodoro.start() }, { label: 'Nanti', run: () => {} }] });
  } else {
    usePomodoro.setState({ running: false, phase: 'work', left: full(s, 'work') });
    sound('done');
    emit('pomodoro:done', { phase: 'rest' });
    toast({ icon: 'timer', title: 'Istirahat selesai', body: 'Siap fokus lagi?', actions: [{ label: 'Mulai fokus', primary: true, run: () => pomodoro.start() }] });
  }
}

// satu detak global: selesai tepat waktu walau widget tidak tampil, dan status teman diperbarui tiap menit
let lastMin = -1;
window.setInterval(() => {
  const s = usePomodoro.getState();
  if (!s.running) { lastMin = -1; return; }
  const left = remaining(s);
  if (left <= 0) { void finish(); return; }
  const m = Math.ceil(left / 60_000);
  if (m !== lastMin) { lastMin = m; focusPresence(); }
}, 1000);
