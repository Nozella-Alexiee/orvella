/* Orvella OS: kerangka desktop untuk siswa (dan staf yang membuka /beranda).
   URL = path jendela yang sedang fokus. RouteSync membaca lokasi lalu membuka,
   memfokuskan, atau memperbarui jendela; jendela yang difokuskan lewat klik
   menulis path-nya kembali ke URL (replace). Tombol back, refresh, dan deep link
   jadi tetap benar. ?ui=klasik membuka tampilan lama. */
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router';
import '@fontsource-variable/unbounded';
import '@fontsource-variable/figtree';
import './os.css';
import './ide.css';
import { useMe } from '../api/hooks';
import { AppNav } from '../app/shell';
import { Boot } from '../app/common';
import { APPS, appById, appOf, isPlayerPath, keyOf, ROUTES, type AppDef } from './registry';
import { useWM, rememberedRect, type Win } from './wm';
import { deskRect, isPhone, Window } from './Window';
import { setDeskHidden } from './motion';
import { Expose } from './Expose';
import { Wallpaper } from './Wallpaper';
import { Menubar } from './Menubar';
import { Dock } from './Dock';
import { Desktop } from './Desktop';
import { Spotlight } from './Spotlight';
import { Guide } from './Guide';
import { CheerRain } from './Friends';
import { ContextMenu } from './ContextMenu';
import { Rewards } from './Rewards';
import { Realtime } from './Realtime';
import { MusicHost } from './music/MusicHost';
import { presence } from './presence';
import { emit, on } from './bus';
import { focusPresence } from './pomodoro';

const klasik = () => { try { if (new URLSearchParams(location.search).get('ui') === 'klasik') localStorage.setItem('orvella-ui', 'klasik'); if (new URLSearchParams(location.search).get('ui') === 'os') localStorage.removeItem('orvella-ui'); return localStorage.getItem('orvella-ui') === 'klasik'; } catch { return false; } };

type OsApi = { open: (path: string) => void; openApp: (id: string) => void; showDesktop: () => void; uiKlasik: () => void };
const OsCtx = createContext<OsApi | null>(null);
export const useOs = () => useContext(OsCtx);

function initialRect(app: AppDef, key: string, n: number) {
  const W = deskRect(), saved = rememberedRect(app.id, key);
  const w = Math.min(saved?.w || app.w, W.w - 24), h = Math.min(saved?.h || app.h, W.h - 16);
  if (saved && saved.x + 80 < W.w && saved.y + 40 < W.h) return { ...saved, w, h };
  return { x: Math.max(12, Math.round((W.w - w) / 2 + (n % 5) * 28 - 40)), y: Math.max(10, Math.round((W.h - h) / 2.4 + (n % 5) * 22)), w, h };
}

/** Satu-satunya tempat yang membaca URL untuk jendela. */
function syncFromUrl(path: string) {
  const st = useWM.getState();
  const p = path.split('#')[0];
  if (p.split('?')[0] === '/beranda') { if (st.wins.some(w => !w.min)) st.minimizeAll(); return; }
  const app = appOf(p);
  if (!app) return;
  const key = keyOf(app, p);
  const act = st.wins.find(w => w.id === st.active);
  if (act && act.path === p && !act.min) return;
  if (act && act.app === app.id && act.key === key) { st.setPath(act.id, p); if (act.min) st.focus(act.id); return; }
  if (act && act.app === 'fokus' && app.id !== 'fokus') st.close(act.id); // keluar dari pemain = tutup Mode Fokus
  const ex = st.wins.find(w => w.app === app.id && w.key === key);
  if (ex) { st.setPath(ex.id, p); st.focus(ex.id); return; }
  const id = st.open({ app: app.id, key, path: p, rect: initialRect(app, key, st.wins.length), focusMode: !!app.focusMode && !isPhone() });
  emit('win:open', { app: app.id, id });
}

/** Statusku untuk teman sekelas: app di jendela yang fokus, atau Beranda. */
function windowPresence() {
  const st = useWM.getState(), a = st.wins.find(w => w.id === st.active), vis = !!a && !a.min;
  presence.state(vis ? a.app : 'beranda', vis ? document.querySelector('.os-win.is-active .os-win-title b')?.textContent || '' : 'Beranda');
}

function WinRouter({ path }: { path: string }) {
  return (
    <Routes location={path}>
      {ROUTES.filter(r => r.path !== '/beranda').map(r => <Route key={r.path} path={r.path} element={r.element} />)}
      <Route path="*" element={<div className="empty" style={{ padding: 32 }}><p>Halaman ini tidak ada.</p></div>} />
    </Routes>
  );
}

function Wins() {
  const wins = useWM(s => s.wins);
  const active = useWM(s => s.active);
  // urutan DOM tetap (sesuai waktu dibuka); tumpukan diatur z-index, jadi iframe tidak dimuat ulang
  const ordered = useMemo(() => [...wins].sort((a, b) => a.born - b.born), [wins]);
  // jendela biasa di belakang jendela maksimal / Mode Fokus tidak kelihatan: jangan digambar (tanpa paint & blur),
  // dan wallpaper berhenti selama desktop tertutup
  const cover = useMemo(() => (isPhone() ? null : wins.filter(w => !w.min && !w.float && (w.max || w.focusMode)).sort((a, b) => b.z - a.z)[0] || null), [wins]);
  useEffect(() => { setDeskHidden(!!cover); }, [cover]);
  return (
    <div className="os-wins">
      {ordered.map((w: Win) => {
        const app = appById(w.app);
        if (!app) return null;
        const occluded = !!cover && w.id !== cover.id && !w.float && !w.min && (cover.focusMode || w.z < cover.z);
        return <Window key={w.id} win={w} app={app} active={w.id === active} occluded={occluded}><WinRouter path={w.path} /></Window>;
      })}
      <MusicHost />
    </div>
  );
}

export function OsLayout() {
  const { data: me, isLoading } = useMe();
  const loc = useLocation();
  const nav = useNavigate();
  const [mode, setMode] = useState(klasik() ? 'klasik' : 'os');
  const hydrate = useWM(s => s.hydrate);
  const active = useWM(s => s.wins.find(w => w.id === s.active) || null);
  const focusMode = useWM(s => s.wins.some(w => w.focusMode && !w.min));
  const path = loc.pathname + loc.search;
  const ready = useRef(false);

  useEffect(() => { if (me && mode === 'os') { hydrate(me.id); ready.current = true; syncFromUrl(path); } }, [me?.id, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ready.current && mode === 'os') syncFromUrl(path); }, [path, mode]);
  // #bagian (mis. /pengaturan#lencana) tidak ikut ke router jendela: diteruskan lewat event, dan disimpan untuk jendela yang baru dimuat
  useEffect(() => {
    if (!loc.hash || mode !== 'os') return;
    (window as unknown as { __osHash?: string }).__osHash = loc.hash;
    dispatchEvent(new CustomEvent('os:hash', { detail: loc.hash }));
  }, [loc.hash, loc.key, mode]);
  // jendela fokus berubah karena klik/tutup/kecilkan → URL ikut (replace, tanpa menambah riwayat)
  useEffect(() => {
    if (!ready.current || mode !== 'os') return;
    // baca keadaan terbaru: di render pertama (me sudah di cache) `active` di closure masih null,
    // padahal jendela untuk URL ini baru saja dibuka oleh efek di atas
    const st = useWM.getState(), a = st.wins.find(w => w.id === st.active);
    const want = a && !a.min ? a.path : '/beranda';
    if (want !== location.pathname + location.search) nav(want, { replace: true });
  }, [active?.id, active?.path, active?.min]); // eslint-disable-line react-hooks/exhaustive-deps
  // presence: statusku mengikuti jendela yang fokus
  useEffect(() => {
    if (!me || mode !== 'os') return;
    presence.start((me.prefs as { presence?: string }).presence === 'off');
    return () => presence.stop();
  }, [me?.id, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!focusPresence()) windowPresence(); }, [active?.id, active?.path, active?.min]);
  // timer fokus berhenti/selesai → status kembali mengikuti jendela
  useEffect(() => { const offs = [on('pomodoro:stop', windowPresence), on('pomodoro:done', () => { if (!focusPresence()) windowPresence(); })]; return () => offs.forEach(f => f()); }, []);
  useEffect(() => { document.documentElement.classList.toggle('os-focus', focusMode); return () => document.documentElement.classList.remove('os-focus'); }, [focusMode]);
  // buka path dari mana saja (Orvi AI dari Sandbox/bab/Spotlight) + Ctrl+J = Orvi AI
  useEffect(() => {
    const go = (e: Event) => nav((e as CustomEvent<string>).detail);
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); nav('/orvi'); } };
    addEventListener('os:nav', go); addEventListener('keydown', k);
    return () => { removeEventListener('os:nav', go); removeEventListener('keydown', k); };
  }, [nav]);
  // Esc keluar dari Mode Fokus
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.os-spot,.os-tour,.modal,.os-sheet')) return;
      const f = useWM.getState().wins.find(w => w.focusMode && !w.min);
      if (f) { useWM.getState().setFocusMode(f.id, false); e.preventDefault(); }
    };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, []);

  const api = useMemo<OsApi>(() => ({
    open: p => nav(p),
    openApp: id => {
      const st = useWM.getState(), app = appById(id);
      if (!app) return;
      const wins = st.wins.filter(w => w.app === id).sort((a, b) => b.z - a.z);
      const top = wins[0];
      if (top && top.id === st.active && !top.min) { st.minimize(top.id); return; }
      if (top) { st.focus(top.id); return; }
      nav(app.home);
    },
    showDesktop: () => { useWM.getState().minimizeAll(); nav('/beranda'); },
    uiKlasik: () => { try { localStorage.setItem('orvella-ui', 'klasik'); } catch { /* */ } setMode('klasik'); },
  }), [nav]);

  if (isLoading) return <Boot />;
  if (!me) return <Navigate to={`/masuk?next=${encodeURIComponent(path)}`} replace />;
  if (me.role === 'learner' && !me.onboarded) return <Navigate to="/mulai/tujuan" replace />;

  if (mode === 'klasik') {
    const player = isPlayerPath(loc.pathname);
    return <>{!player && <AppNav role="learner" />}<Suspense fallback={<Boot />}><Outlet /></Suspense></>;
  }
  return (
    <OsCtx.Provider value={api}>
      <div className="os-root">
        <Wallpaper xp={me.xp_total} />
        <Menubar />
        <main className="os-desk" aria-label="Desktop">
          <Desktop />
          <Wins />
        </main>
        <Dock />
        <Expose />
        <Spotlight />
        <Guide />
        <CheerRain />
        <ContextMenu />
        <Rewards />
        <Realtime />
      </div>
    </OsCtx.Provider>
  );
}


export function useOpenApp() {
  const os = useOs();
  const nav = useNavigate();
  return useCallback((id: string) => (os ? os.openApp(id) : nav(appById(id)?.home || '/beranda')), [os, nav]);
}
export { APPS };
export const LazyNone = lazy(async () => ({ default: () => null }));
