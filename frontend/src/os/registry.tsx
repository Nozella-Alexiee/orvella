/* Daftar app Orvella OS dan rute yang dimiliki tiap app.
   Rute yang sama dipakai dua kali: di dalam jendela (Orvella OS) dan sebagai halaman
   biasa pada tampilan klasik (?ui=klasik). */
import { lazy, type ReactNode } from 'react';
import { matchPath, Navigate, Route } from 'react-router';

const Beranda = lazy(() => import('../pages/Beranda'));
const Peta = lazy(() => import('../pages/Peta'));
const Bab = lazy(() => import('../pages/Bab'));
const Jalur = lazy(() => import('../pages/Jalur'));
const Progres = lazy(() => import('../pages/Progres'));
const Pengaturan = lazy(() => import('../pages/Pengaturan'));
const Playground = lazy(() => import('../pages/Playground'));
const Proyek = lazy(() => import('../pages/Proyek'));
const Pahami = lazy(() => import('../pahami/PahamiPage'));
const Perkuat = lazy(() => import('../perkuat/PerkuatPage'));
const Kuis = lazy(() => import('../kuis/KuisPage'));
const Ulangan = lazy(() => import('../uji/UlanganPage'));
const Challenge = lazy(() => import('../uji/ChallengePage'));
const SandboxApp = lazy(() => import('../sandbox/SandboxApp'));
const GaleriApp = lazy(() => import('../galeri/GaleriApp'));
const MusikApp = lazy(() => import('./music/MusikApp'));
const TanyaOrvi = lazy(() => import('../orvi/TanyaOrvi'));
const DuelApp = lazy(() => import('../duel/DuelApp'));
const LiveJoin = lazy(() => import('../live/LiveJoin'));

export type AppDef = {
  id: string; title: string; icon: string; color: string;
  /** Pola rute milik app ini (urutan penting: yang lebih spesifik dulu). */
  patterns: string[];
  home: string;
  /** Jendela terpisah per kunci (Sandbox: satu jendela per proyek). */
  key?: (path: string) => string;
  w: number; h: number; minW?: number; minH?: number;
  focusMode?: boolean;
  keepAlive?: boolean;
  dock?: boolean;
};

const idFrom = (re: RegExp) => (p: string) => re.exec(p)?.[1] || 'home';

export const APPS: AppDef[] = [
  { id: 'belajar', title: 'Belajar', icon: 'graduation-cap', color: 'var(--os-violet)', patterns: ['/jalur', '/peta', '/peta/:pathId', '/bab/:id'], home: '/peta/saya', w: 1120, h: 720, dock: true },
  { id: 'fokus', title: 'Mode Fokus', icon: 'target', color: 'var(--os-violet)', focusMode: true, w: 1100, h: 720,
    patterns: ['/bab/:id/pahami', '/bab/:id/perkuat', '/bab/:id/kuis', '/bab/:id/uji/ulangan', '/bab/:id/uji/challenge', '/kuis-harian'], home: '/kuis-harian' },
  { id: 'sandbox', title: 'Sandbox', icon: 'code-xml', color: 'var(--os-mint)', patterns: ['/sandbox', '/sandbox/:id'], home: '/sandbox', key: idFrom(/^\/sandbox\/(\d+)/), w: 1240, h: 760, minW: 420, dock: true },
  { id: 'orvi', title: 'Orvi AI', icon: 'orvi-ai', color: 'var(--os-violet)', patterns: ['/orvi'], home: '/orvi', w: 560, h: 720, minW: 340, minH: 420, dock: true },
  { id: 'galeri', title: 'Galeri', icon: 'image', color: 'var(--os-pink)', patterns: ['/galeri', '/galeri/:id'], home: '/galeri', w: 1060, h: 700, dock: true },
  { id: 'duel', title: 'Duel', icon: 'swords', color: 'var(--os-coral)', patterns: ['/duel', '/duel/:id'], home: '/duel', w: 900, h: 700, minW: 360, dock: true },
  { id: 'kuis-live', title: 'Kuis langsung', icon: 'presentation', color: 'var(--os-sky)', patterns: ['/gabung', '/gabung/:pin'], home: '/gabung', w: 760, h: 700, minW: 340 },
  { id: 'musik', title: 'Musik', icon: 'radio', color: 'var(--os-musik)', patterns: ['/musik'], home: '/musik', w: 480, h: 680, minW: 340, keepAlive: true, dock: true },
  { id: 'playground', title: 'Playground', icon: 'notebook-pen', color: 'var(--os-sky)', patterns: ['/playground', '/playground/:notebookId'], home: '/playground', w: 1100, h: 720 },
  { id: 'proyek', title: 'Proyek kurikulum', icon: 'folder-kanban', color: 'var(--os-sun)', patterns: ['/proyek', '/proyek/:projectId'], home: '/proyek', w: 1080, h: 720 },
  { id: 'progres', title: 'Progres', icon: 'sparkles', color: 'var(--os-sky)', patterns: ['/progres'], home: '/progres', w: 1000, h: 700, dock: true },
  { id: 'pengaturan', title: 'Pengaturan', icon: 'settings', color: 'var(--os-slate)', patterns: ['/pengaturan'], home: '/pengaturan', w: 900, h: 680, dock: true },
];

export const appById = (id: string) => APPS.find(a => a.id === id) || null;

/** App pemilik sebuah path, atau null untuk desktop (/beranda) dan path yang tidak dikenal. */
export function appOf(path: string): AppDef | null {
  const p = path.split(/[?#]/)[0];
  for (const a of APPS) if (a.patterns.some(pt => matchPath({ path: pt, end: true }, p))) return a;
  return null;
}
export const keyOf = (a: AppDef, path: string) => (a.key ? a.key(path.split(/[?#]/)[0]) : '');

/** Elemen halaman per rute (dipakai jendela dan tampilan klasik). */
export const ROUTES: { path: string; element: ReactNode }[] = [
  { path: '/beranda', element: <Beranda /> },
  { path: '/peta', element: <Navigate to="/peta/saya" replace /> },
  { path: '/jalur', element: <Jalur /> },
  { path: '/peta/:pathId', element: <Peta /> },
  { path: '/bab/:id', element: <Bab /> },
  { path: '/playground', element: <Playground /> },
  { path: '/playground/:notebookId', element: <Playground /> },
  { path: '/proyek', element: <Proyek /> },
  { path: '/proyek/:projectId', element: <Proyek /> },
  { path: '/progres', element: <Progres /> },
  { path: '/duel', element: <DuelApp /> },
  { path: '/gabung', element: <LiveJoin /> },
  { path: '/gabung/:pin', element: <LiveJoin /> },
  { path: '/duel/:id', element: <DuelApp /> },
  { path: '/pengaturan', element: <Pengaturan /> },
  { path: '/bab/:id/pahami', element: <Pahami /> },
  { path: '/bab/:id/perkuat', element: <Perkuat /> },
  { path: '/bab/:id/kuis', element: <Kuis /> },
  { path: '/kuis-harian', element: <Kuis daily /> },
  { path: '/bab/:id/uji/ulangan', element: <Ulangan /> },
  { path: '/bab/:id/uji/challenge', element: <Challenge /> },
  { path: '/sandbox', element: <SandboxApp /> },
  { path: '/sandbox/:id', element: <SandboxApp /> },
  { path: '/galeri', element: <GaleriApp /> },
  { path: '/galeri/:id', element: <GaleriApp /> },
  { path: '/musik', element: <MusikApp /> },
  { path: '/orvi', element: <TanyaOrvi /> },
];
export const PLAYER_PATTERNS = APPS.find(a => a.id === 'fokus')!.patterns;
export const isPlayerPath = (p: string) => PLAYER_PATTERNS.some(pt => matchPath({ path: pt, end: true }, p.split(/[?#]/)[0]));

/** Rute app sebagai <Route> (dipakai App.tsx di dalam OsLayout, untuk jendela maupun tampilan klasik). */
export function osRouteElements(): ReactNode[] {
  return ROUTES.map(r => <Route key={r.path} path={r.path} element={r.element} />);
}
