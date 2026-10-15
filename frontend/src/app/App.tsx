import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient, useMe } from '../api/hooks';
import { AdminLayout, AppNav, CommandPalette } from './shell';
import { ToastStack } from '../design/toast';
import { Boot, homeFor } from './common';
import { osRouteElements } from '../os/registry';

const Landing = lazy(() => import('../pages/landing/LandingOS'));
const OsLayout = lazy(() => import('../os/OsLayout').then(m => ({ default: m.OsLayout })));
const Auth = lazy(() => import('../pages/Auth'));
const Onboarding = lazy(() => import('../pages/Onboarding'));
const Mentor = lazy(() => import('../mentor/MentorPage'));
const Siswa = lazy(() => import('../mentor/SiswaPage'));
const Roster = lazy(() => import('../mentor/RosterPage'));
const ReviewQueue = lazy(() => import('../mentor/ReviewQueue'));
const Admin = lazy(() => import('../admin/AdminPage'));
const Builder = lazy(() => import('../admin/BuilderPage'));
const ChapterList = lazy(() => import('../admin/ChapterList'));
const People = lazy(() => import('../admin/PeoplePage'));
const Runtime = lazy(() => import('../admin/RuntimePage'));
const Log = lazy(() => import('../admin/LogPage'));
const LupaSandi = lazy(() => import('../pages/LupaSandi'));
const ResetSandi = lazy(() => import('../pages/LupaSandi').then(m => ({ default: m.ResetSandi })));
const Privasi = lazy(() => import('../pages/legal/Legal').then(m => ({ default: m.Privasi })));
const Syarat = lazy(() => import('../pages/legal/Legal').then(m => ({ default: m.Syarat })));
const StudioHome = lazy(() => import('../studio/StudioPages').then(m => ({ default: m.StudioHome })));
const StudioPath = lazy(() => import('../studio/StudioPages').then(m => ({ default: m.StudioPath })));
const NotFound = lazy(() => import('../pages/NotFound'));
const KolabJoin = lazy(() => import('../pages/KolabJoin'));
const LiveSetup = lazy(() => import('../live/LiveHost').then(m => ({ default: m.LiveSetup })));
const LiveScreen = lazy(() => import('../live/LiveHost').then(m => ({ default: m.LiveScreen })));

function RequireAuth({ roles, children }: { roles?: string[]; children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  const loc = useLocation();
  if (isLoading) return <Boot />;
  if (!me) return <Navigate to={`/masuk?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (me.role === 'learner' && !me.onboarded && !loc.pathname.startsWith('/mulai')) return <Navigate to="/mulai/tujuan" replace />;
  // superadmin lolos di semua halaman yang mengizinkan admin
  if (roles && !roles.includes(me.role) && !(me.role === 'superadmin' && roles.includes('admin'))) return <Navigate to={homeFor(me.role)} replace />;
  return <>{children}</>;
}

function MentorLayout() {
  return <RequireAuth roles={['mentor', 'admin']}><AppNav role="mentor" /><Suspense fallback={<Boot />}><Outlet /></Suspense></RequireAuth>;
}
function AdminShell() {
  return <RequireAuth roles={['admin']}><AdminLayout><Suspense fallback={<Boot />}><Outlet /></Suspense></AdminLayout></RequireAuth>;
}
function StudioShell() {
  return <RequireAuth roles={['mentor', 'admin']}><Suspense fallback={<Boot />}><Outlet /></Suspense></RequireAuth>;
}

function SessionWatcher() {
  const nav = useNavigate();
  useEffect(() => {
    const f = () => {
      queryClient.setQueryData(['/api/me'], null);
      // halaman publik (tanpa login) tidak dilempar ke /masuk
      if (!/^\/(masuk|daftar|lupa-sandi|reset-sandi\/[^/]+|privasi|syarat)?$/.test(location.pathname)) nav(`/masuk?next=${encodeURIComponent(location.pathname)}`);
    };
    addEventListener('orvella:unauthorized', f);
    return () => removeEventListener('orvella:unauthorized', f);
  }, [nav]);
  return null;
}

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { if (!location.hash) scrollTo(0, 0); }, [pathname]);
  return null;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionWatcher />
        <ScrollTop />
        <Suspense fallback={<Boot />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/masuk" element={<Auth mode="login" />} />
            <Route path="/daftar" element={<Auth mode="register" />} />
            <Route path="/lupa-sandi" element={<LupaSandi />} />
            <Route path="/reset-sandi/:token" element={<ResetSandi />} />
            <Route path="/privasi" element={<Privasi />} />
            <Route path="/syarat" element={<Syarat />} />
            <Route path="/mulai/:step" element={<RequireAuth roles={['learner']}><Onboarding /></RequireAuth>} />
            <Route path="/s/:kode" element={<RequireAuth><KolabJoin /></RequireAuth>} />
            <Route path="/kuis-langsung/:pin/layar" element={<RequireAuth roles={['mentor', 'admin']}><LiveScreen /></RequireAuth>} />

            {/* Siswa (dan staf yang membuka /beranda): Orvella OS. Rute yang sama juga jadi jendela; ?ui=klasik membuka tampilan lama. */}
            <Route element={<OsLayout />}>{osRouteElements()}</Route>

            <Route element={<MentorLayout />}>
              <Route path="/mentor" element={<Mentor />} />
              <Route path="/mentor/siswa" element={<Roster />} />
              <Route path="/mentor/siswa/:userId" element={<Siswa />} />
              <Route path="/mentor/review" element={<ReviewQueue />} />
              <Route path="/mentor/kuis-langsung" element={<LiveSetup />} />
              <Route path="/studio" element={<StudioHome />} />
              <Route path="/studio/jalur/:id" element={<StudioPath />} />
            </Route>
            <Route element={<StudioShell />}>
              <Route path="/studio/bab/:id" element={<Builder studio />} />
            </Route>

            <Route element={<AdminShell />}>
              <Route path="/admin" element={<Admin />} />
              <Route path="/admin/bab" element={<ChapterList />} />
              <Route path="/admin/bab/:id" element={<Builder />} />
              <Route path="/admin/pengguna" element={<People />} />
              <Route path="/admin/runtime" element={<Runtime />} />
              <Route path="/admin/log" element={<Log />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        <CommandPalette />
        <ToastStack />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
