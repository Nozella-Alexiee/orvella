/* Musik (mode embed): pemutar resmi Spotify / Apple Music. Siswa login di pemutarnya
   sendiri; Orvella hanya menyimpan link yang dipilih. Pemutar hidup di MusicHost supaya
   lagu tetap jalan saat jendela Musik dikecilkan atau ditutup. */
import { create } from 'zustand';
import { api } from '../../api/client';

export type Track = { provider: 'spotify' | 'apple'; kind: string; id: string; title: string; embed_url: string; open_url: string; uri?: string; thumb?: string | null; url?: string };
type S = {
  enabled: boolean; curated: Track[]; saved: Track[]; current: Track | null;
  playing: boolean; progress: number; ready: boolean; loaded: boolean;
  /** pemutar cuma memberi cuplikan 30 detik (belum masuk Spotify di browser ini) */
  preview: boolean;
  /** pernah menekan "Masuk dengan Spotify" di browser ini (Orvella tidak bisa melihat akunnya, cuma menandai) */
  signedIn: boolean;
  /** naik = pemutar dibuat ulang (setelah masuk, supaya pemutar membaca sesi Spotify yang baru) */
  reload: number;
  load: () => Promise<void>;
  markSignedIn: () => void;
  play: (t: Track) => void;
  save: (t: Track) => void;
  stop: () => void;
};
const read = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } };

export const useMusic = create<S>((set, get) => ({
  enabled: true, curated: [], saved: read<Track[]>('orvella-music-saved', []), current: read<Track | null>('orvella-music-current', null),
  playing: false, progress: 0, ready: false, loaded: false, preview: false, signedIn: read<boolean>('orvella-music-signedin', false), reload: 0,
  async load() {
    if (get().loaded) return;
    try {
      const r = await api.get<{ enabled: boolean; curated: (Track & { title: string })[] }>('/api/music');
      set({ enabled: r.enabled, curated: r.curated, loaded: true });
    } catch { set({ loaded: true }); }
  },
  play(t) { write('orvella-music-current', t); set({ current: t, playing: false, progress: 0, ready: false, preview: false }); },
  markSignedIn() { write('orvella-music-signedin', true); set(s => ({ signedIn: true, preview: false, reload: s.reload + 1 })); },
  save(t) { const saved = [t, ...get().saved.filter(x => x.open_url !== t.open_url)].slice(0, 8); write('orvella-music-saved', saved); set({ saved }); },
  stop() { write('orvella-music-current', null); set({ current: null, playing: false }); },
}));

/* ---- kendali Spotify lewat iFrame API (usaha terbaik; Apple Music tidak punya API tanpa MusicKit) ---- */
type Controller = { loadUri: (u: string) => void; togglePlay: () => void; play: () => void; pause: () => void; destroy: () => void;
  addListener: (ev: string, fn: (e: { data: { isPaused: boolean; position: number; duration: number } }) => void) => void };
type IFrameAPI = { createController: (el: HTMLElement, o: { uri: string; width?: string | number; height?: string | number }, cb: (c: Controller) => void) => void };
let apiP: Promise<IFrameAPI | null> | null = null;
export function spotifyApi(): Promise<IFrameAPI | null> {
  if (apiP) return apiP;
  apiP = new Promise(res => {
    const w = window as unknown as { onSpotifyIframeApiReady?: (a: IFrameAPI) => void };
    const t = window.setTimeout(() => res(null), 6000);
    w.onSpotifyIframeApiReady = a => { clearTimeout(t); res(a); };
    const s = document.createElement('script');
    s.src = 'https://open.spotify.com/embed/iframe-api/v1'; s.async = true; s.onerror = () => { clearTimeout(t); res(null); };
    document.head.appendChild(s);
  });
  return apiP;
}
export const controller: { c: Controller | null } = { c: null };

/** Buka halaman masuk resmi Spotify di jendela kecil. Setelah ditutup, pemutar dibuat ulang supaya memakai sesi barunya.
    Kata sandi diketik di accounts.spotify.com, Orvella tidak pernah melihatnya. */
export function signInSpotify(): boolean {
  const url = 'https://accounts.spotify.com/login?continue=' + encodeURIComponent('https://open.spotify.com/');
  const w = 480, h = 720, left = Math.max(0, (screen.width - w) / 2), top = Math.max(0, (screen.height - h) / 2);
  const pop = window.open(url, 'orvella-spotify-login', `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
  if (!pop) return false;  // popup diblokir: pemanggil menampilkan link biasa
  const t = window.setInterval(() => { if (pop.closed) { clearInterval(t); useMusic.getState().markSignedIn(); } }, 600);
  return true;
}
