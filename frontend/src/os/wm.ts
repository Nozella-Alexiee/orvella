/* Pengelola jendela Orvella OS (zustand).
   Aturan utama: URL = path jendela yang sedang fokus. Hanya RouteSync yang membaca lokasi;
   aksi di sini tidak pernah memanggil navigate sendiri (lihat os/RouteSync.tsx).
   Keadaan jendela disimpan per pengguna di localStorage dan dihapus saat keluar. */
import { create } from 'zustand';

export type Rect = { x: number; y: number; w: number; h: number };
export type Win = {
  id: string; app: string; key: string; path: string; rect: Rect; prev: Rect | null;
  max: boolean; min: boolean; z: number; focusMode: boolean; born: number;
  /** Mode layang: kecil, selalu di atas, nempel ke pojok (tl/tr/bl/br). floatPrev = posisi sebelum melayang. */
  float?: boolean; corner?: string; fseq?: number; floatPrev?: Rect | null;
};

type State = {
  uid: number | null;
  wins: Win[];
  active: string | null;
  z: number;
  hydrate: (uid: number) => void;
  open: (w: { app: string; key: string; path: string; rect: Rect; max?: boolean; focusMode?: boolean }) => string;
  focus: (id: string) => void;
  close: (id: string) => void;
  minimize: (id: string) => void;
  restore: (id: string) => void;
  setRect: (id: string, r: Partial<Rect>, save?: boolean) => void;
  setPath: (id: string, path: string) => void;
  setMax: (id: string, max: boolean, desk?: Rect) => void;
  setFocusMode: (id: string, on: boolean) => void;
  /** Ubah beberapa kolom jendela sekaligus (dipakai mode layang). */
  patch: (id: string, p: Partial<Win>) => void;
  minimizeAll: () => void;
  clear: () => void;
};

const KEY = (uid: number) => `orvella-os:${uid}`;
const SIZES = 'orvella-os-sizes';
const read = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* mode privat */ } };
let saveT = 0;

/** Ukuran terakhir per app (dan per proyek untuk Sandbox), dipakai saat jendela dibuka lagi. */
export const rememberedRect = (app: string, key: string): Rect | null => read<Record<string, Rect>>(SIZES, {})[`${app}:${key}`] || read<Record<string, Rect>>(SIZES, {})[`${app}:`] || null;
const remember = (w: Win) => { if (w.max || w.focusMode || w.float) return; const all = read<Record<string, Rect>>(SIZES, {}); all[`${w.app}:${w.key}`] = w.rect; all[`${w.app}:`] = w.rect; write(SIZES, all); };

export const useWM = create<State>((set, get) => {
  const persist = () => {
    clearTimeout(saveT);
    saveT = window.setTimeout(() => {
      const { uid, wins, active } = get();
      if (uid != null) write(KEY(uid), { wins: wins.map(w => ({ ...w })), active });
    }, 250);
  };
  const upd = (id: string, f: (w: Win) => Partial<Win>) => { set(s => ({ wins: s.wins.map(w => (w.id === id ? { ...w, ...f(w) } : w)) })); persist(); };
  const topVisible = (wins: Win[], except?: string) => wins.filter(w => !w.min && w.id !== except).sort((a, b) => b.z - a.z)[0]?.id ?? null;
  return {
    uid: null, wins: [], active: null, z: 10,
    hydrate(uid) {
      if (get().uid === uid) return;
      const saved = read<{ wins: Win[]; active: string | null }>(KEY(uid), { wins: [], active: null });
      const wins = (saved.wins || []).filter(w => w && w.app && w.path).slice(-12);
      set({ uid, wins, active: saved.active && wins.some(w => w.id === saved.active) ? saved.active : topVisible(wins), z: Math.max(10, ...wins.map(w => w.z)) });
    },
    open({ app, key, path, rect, max = false, focusMode = false }) {
      const id = `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
      const z = get().z + 1;
      set(s => ({ wins: [...s.wins, { id, app, key, path, rect, prev: null, max, min: false, z, focusMode, born: Date.now() }], active: id, z }));
      persist();
      return id;
    },
    focus(id) {
      const z = get().z + 1;
      set(s => ({ z, active: id, wins: s.wins.map(w => (w.id === id ? { ...w, z, min: false } : w)) }));
      persist();
    },
    close(id) {
      set(s => { const wins = s.wins.filter(w => w.id !== id); return { wins, active: s.active === id ? topVisible(wins) : s.active }; });
      persist();
    },
    minimize(id) {
      set(s => { const wins = s.wins.map(w => (w.id === id ? { ...w, min: true, focusMode: false } : w)); return { wins, active: s.active === id ? topVisible(wins, id) : s.active }; });
      persist();
    },
    restore(id) { get().focus(id); },
    setRect(id, r, save = true) {
      upd(id, w => ({ rect: { ...w.rect, ...r } }));
      if (save) { const w = get().wins.find(x => x.id === id); if (w) remember(w); }
    },
    setPath(id, path) { upd(id, () => ({ path })); },
    setMax(id, max, desk) {
      upd(id, w => (max ? { max: true, prev: w.max ? w.prev : w.rect, rect: desk || w.rect } : { max: false, rect: w.prev || w.rect, prev: null }));
    },
    setFocusMode(id, on) { upd(id, () => ({ focusMode: on })); },
    patch(id, p) { upd(id, () => p); },
    minimizeAll() { set(s => ({ wins: s.wins.map(w => ({ ...w, min: true, focusMode: false })), active: null })); persist(); },
    clear() { const { uid } = get(); if (uid != null) try { localStorage.removeItem(KEY(uid)); } catch { /* */ } set({ uid: null, wins: [], active: null }); },
  };
});

export const topWin = () => { const { wins, active } = useWM.getState(); return wins.find(w => w.id === active) || null; };
