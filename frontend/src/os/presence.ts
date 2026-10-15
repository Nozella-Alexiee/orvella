/* Teman sekelas yang terlihat: klien WebSocket /ws/presence.
   Statusku otomatis mengikuti jendela yang sedang fokus; bisa disembunyikan di Pengaturan. */
import { create } from 'zustand';
import { emit } from './bus';
import { queryClient } from '../api/hooks';

export type Friend = { id: number; name: string; initials: string; app: string; what: string; live?: { project: number; title: string } | null };
/** Pindah halaman dari luar React (presence, toast): OsLayout mendengarkan 'os:nav'. */
export const goTo = (path: string) => dispatchEvent(new CustomEvent('os:nav', { detail: path }));
export const CHEERS = ['👏', '🔥', '🚀', '💡', '🎉'] as const;

type S = {
  people: Friend[]; connected: boolean; hidden: boolean;
  feed: { at: number; text: string }[];
  incoming: { id: number; from: { id: number; name: string; initials: string }; emoji: string } | null;
};
export const usePresence = create<S>(() => ({ people: [], connected: false, hidden: false, feed: [], incoming: null }));

let ws: WebSocket | null = null, retry = 0, pingT = 0, retryT = 0, alive = false;
let lastState: { app: string; what: string } = { app: 'beranda', what: 'Beranda' };
const APP_LABEL: Record<string, string> = { belajar: 'Belajar', fokus: 'Mode Fokus', sandbox: 'Sandbox', galeri: 'Galeri', musik: 'Musik',
  playground: 'Playground', proyek: 'Proyek', progres: 'Progres', pengaturan: 'Pengaturan', beranda: 'Beranda', pomodoro: 'Timer fokus', duel: 'Duel' };
export const appLabel = (a: string) => APP_LABEL[a] || 'Beranda';

function send(m: unknown) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); }
const feed = (text: string) => usePresence.setState(s => ({ feed: [{ at: Date.now(), text }, ...s.feed].slice(0, 20) }));

function connect() {
  if (!alive) return;
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/presence`;
  const sock = ws = new WebSocket(url);
  // socket lama yang ditutup stop() tidak boleh menyambung ulang atau menimpa status (mis. start→stop→start di StrictMode)
  sock.onopen = () => {
    if (ws !== sock) return;
    retry = 0; usePresence.setState({ connected: true });
    send({ t: 'state', ...lastState });
    if (usePresence.getState().hidden) send({ t: 'hide', on: true });
    clearInterval(pingT); pingT = window.setInterval(() => send({ t: 'ping' }), 25_000);
  };
  sock.onmessage = e => {
    if (ws !== sock) return;
    let m: { t: string; people?: Friend[]; p?: Friend; id?: number; from?: { id: number; name: string; initials: string }; emoji?: string };
    try { m = JSON.parse(e.data); } catch { return; }
    const set = usePresence.setState;
    if (m.t === 'roster' && m.people) set({ people: m.people });
    else if (m.t === 'join' && m.p) { const p = m.p; set(s => ({ people: [...s.people.filter(x => x.id !== p.id), p].sort((a, b) => a.name.localeCompare(b.name)) })); feed(`${p.name.split(' ')[0]} baru saja online`); }
    else if (m.t === 'leave') set(s => ({ people: s.people.filter(x => x.id !== m.id) }));
    else if (m.t === 'state' && m.p) {
      const p = m.p, before = usePresence.getState().people.find(x => x.id === p.id);
      set(s => ({ people: s.people.map(x => (x.id === p.id ? p : x)) }));
      if (before && before.app !== p.app) feed(`${p.name.split(' ')[0]} membuka ${p.what || appLabel(p.app)}`);
    } else if (m.t === 'cheer' && m.from && m.emoji) {
      set({ incoming: { id: Date.now(), from: m.from, emoji: m.emoji } });
      emit('cheer', { from: m.from.name, emoji: m.emoji });
    } else if (m.t === 'feed' && typeof (m as { text?: unknown }).text === 'string') {
      feed((m as unknown as { text: string }).text);
    } else if (m.t === 'notify') {
      void queryClient.invalidateQueries({ queryKey: ['/api/me'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    } else {
      // pesan pribadi lain (undangan ngoding bareng, duel, bantuan, kuis langsung): didengarkan komponen masing-masing
      dispatchEvent(new CustomEvent('orvella:rt', { detail: m }));
    }
  };
  sock.onclose = () => {
    if (ws !== sock && ws !== null) return;
    usePresence.setState({ connected: false });
    clearInterval(pingT);
    if (!alive) return;
    retry = Math.min(retry + 1, 6);
    retryT = window.setTimeout(connect, 1000 * 2 ** retry);
  };
}

export const presence = {
  start(hidden: boolean) { if (alive) return; alive = true; usePresence.setState({ hidden }); connect(); },
  stop() { alive = false; clearTimeout(retryT); clearInterval(pingT); ws?.close(); ws = null; usePresence.setState({ people: [], connected: false }); },
  state(app: string, what: string) {
    if (lastState.app === app && lastState.what === what) return;
    lastState = { app, what: what.slice(0, 60) }; send({ t: 'state', ...lastState });
  },
  hide(on: boolean) { usePresence.setState({ hidden: on }); send({ t: 'hide', on }); },
  cheer(to: number, emoji: string) { send({ t: 'cheer', to, emoji }); },
};
