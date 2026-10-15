/* Menu bar Orvella OS: menu, nama app aktif, XP, beruntun, teman, mini-player musik,
   Spotlight, notifikasi, tema, jam, dan akun. */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useMe } from '../api/hooks';
import { Icon } from '../design/Icon';
import { LogoMark } from '../design/LogoMark';
import { usePrefs } from '../state/prefs';
import { appById } from './registry';
import { useWM } from './wm';
import { useOs } from './OsLayout';
import { FriendsButton } from './Friends';
import { controller, useMusic } from './music/store';
import { Menu, type MenuItem as Item } from './Menu';
import { orviActions } from './orviActions';
import { isAdmin } from '../app/common';

const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const clock = (d = new Date()) => `${DAYS[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]} ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;

function MiniPlayer() {
  const cur = useMusic(s => s.current), playing = useMusic(s => s.playing), progress = useMusic(s => s.progress);
  const os = useOs();
  if (!cur) return null;
  const spotify = cur.provider === 'spotify' && !!controller.c;
  return (
    <div className="os-mbm" role="group" aria-label="Musik yang sedang diputar">
      <button className="os-mbm-open" title="Buka Musik" onClick={() => os?.openApp('musik')}>
        <span className={`os-mbm-eq${playing ? ' is-on' : ''}`}><i /><i /><i /><i /></span>
        <span className="os-mbm-t"><b>{cur.title}</b><small>{cur.provider === 'spotify' ? 'Spotify' : 'Apple Music'}</small></span>
        <i className="os-mbm-prog" style={{ ['--p' as string]: `${Math.round(progress * 100)}%` }} />
      </button>
      {spotify && <button className="os-mbm-b" aria-label={playing ? 'Jeda' : 'Putar'} onClick={() => controller.c?.togglePlay()}><Icon name={playing ? 'pause' : 'play'} /></button>}
      <button className="os-mbm-b" aria-label="Hentikan musik" onClick={() => useMusic.getState().stop()}><Icon name="x" /></button>
    </div>
  );
}

export function Menubar() {
  const { data: me } = useMe();
  const os = useOs();
  const nav = useNavigate();
  const qc = useQueryClient();
  const theme = usePrefs(s => s.theme), toggleTheme = usePrefs(s => s.toggleTheme);
  const active = useWM(s => s.wins.find(w => w.id === s.active && !w.min));
  const [menu, setMenu] = useState<{ id: string; at: DOMRect } | null>(null);
  const [now, setNow] = useState(clock());
  useEffect(() => { const t = setInterval(() => setNow(clock()), 15000); return () => clearInterval(t); }, []);
  const ink = document.documentElement.dataset.theme === 'ink';
  const logout = async () => { await api.post('/api/auth/logout'); useWM.getState().clear(); qc.clear(); nav('/masuk'); };
  const focusActive = () => { const a = useWM.getState().wins.find(w => w.id === useWM.getState().active); if (a) useWM.getState().setFocusMode(a.id, true); };
  const MENUS: Record<string, Item[]> = {
    orvella: [['label', 'Orvella OS'], ['sparkles', 'Tur bersama Orvi', () => dispatchEvent(new CustomEvent('os:tour'))], ['settings', 'Pengaturan…', () => nav('/pengaturan')], ['sep'],
      // halaman kerja staf (semua peran mendarat di desktop dulu)
      ...(isAdmin(me?.role) ? [['layout-dashboard', 'Dashboard Admin', () => nav('/admin')] as Item] : []),
      ...(me?.role === 'mentor' || isAdmin(me?.role) ? [['chart-no-axes-column', 'Ruang Mentor', () => nav('/mentor')] as Item] : []),
      ...(me?.role !== 'learner' ? [['sep'] as Item] : []),
      ...orviActions().slice(1), ['sep'],
      ['layout-list', 'Tampilan klasik', () => os?.uiKlasik()], ['log-out', 'Keluar', logout]],
    berkas: [['file-plus', 'Proyek baru…', () => nav('/sandbox?baru=1'), 'Ctrl N'], ['folder-open', 'Proyek saya', () => nav('/sandbox')], ['image', 'Galeri', () => nav('/galeri')], ['sep'],
      ['notebook-pen', 'Playground', () => nav('/playground')], ['folder-kanban', 'Proyek kurikulum', () => nav('/proyek')]],
    tampilan: [['layout-dashboard', 'Tampilkan desktop', () => os?.showDesktop()], ['layout-grid', 'Semua jendela', () => dispatchEvent(new CustomEvent('os:expose')), 'Ctrl ↑'],
      ['picture-in-picture-2', 'Jadikan jendela layang', () => { const a = useWM.getState().active; if (a) dispatchEvent(new CustomEvent('os:winctl', { detail: { id: a, do: 'float' } })); }],
      ['target', 'Mode Fokus jendela aktif', focusActive], ['sep'],
      ['sun-moon', ink ? 'Ganti ke Siang' : 'Ganti ke Malam', toggleTheme], ['image', 'Wallpaper…', () => nav('/pengaturan#wallpaper')],
      ['layout-grid', 'Atur widget', () => { os?.showDesktop(); dispatchEvent(new CustomEvent('os:desk', { detail: { do: 'edit' } })); }]],
    bantuan: [['sparkles', 'Ulangi tur bersama Orvi', () => dispatchEvent(new CustomEvent('os:tour'))], ['keyboard', 'Pintasan keyboard', () => dispatchEvent(new CustomEvent('os:spot', { detail: '?' }))]],
    akun: [['label', me?.name || ''], ['award', 'Lencana', () => nav('/pengaturan#lencana')], ['sparkles', 'Progres', () => nav('/progres')], ['settings', 'Pengaturan', () => nav('/pengaturan')], ['log-out', 'Keluar', logout]],
  };
  // easter egg: logo diklik 7× cepat → pesan dari tim
  const taps = useRef<number[]>([]);
  const logoTap = () => {
    const now = Date.now(); taps.current = [...taps.current.filter(t => now - t < 2500), now];
    if (taps.current.length < 7) return false;
    taps.current = []; setMenu(null); dispatchEvent(new CustomEvent('os:egg', { detail: 'tim' }));
    return true;
  };
  const open = (id: string) => (e: React.MouseEvent) => { const at = (e.currentTarget as HTMLElement).getBoundingClientRect(); setMenu(m => (m?.id === id ? null : { id, at })); };
  const app = active ? appById(active.app) : null;
  return (
    <header className="os-menubar" role="banner">
      <button className="os-mb-item os-mb-logo" data-menu aria-haspopup="menu" aria-expanded={menu?.id === 'orvella'} onClick={e => { if (!logoTap()) open('orvella')(e); }}><LogoMark /><span>Orvella</span></button>
      <span className="os-mb-item os-mb-app">{app ? app.title : 'Beranda'}</span>
      {(['berkas', 'tampilan', 'bantuan'] as const).map(id => (
        <button key={id} className="os-mb-item os-mb-menu" data-menu aria-haspopup="menu" aria-expanded={menu?.id === id} onClick={open(id)}>{id[0].toUpperCase() + id.slice(1)}</button>
      ))}
      <span className="os-mb-spacer" />
      <MiniPlayer />
      {me && <button className="os-mb-pill os-mb-lvl hide-sm" title={`Level ${me.level}: ${me.level_xp}/${me.next_xp} XP ke level berikutnya`} onClick={() => nav('/pengaturan#lencana')}
        style={{ ['--p' as string]: `${Math.round(100 * me.level_xp / Math.max(1, me.next_xp))}%` }} aria-label={`Level ${me.level}`}>Lv<b className="num" data-level>{me.level}</b></button>}
      <span className="os-mb-pill os-mb-xp hide-sm" title="XP minggu ini"><Icon name="zap" /><span className="num" data-xp>{me?.xp_week ?? 0}</span> XP</span>
      <span className="os-mb-pill os-mb-fire hide-sm" title="Hari beruntun"><Icon name="activity" /><span className="num">{me?.streak ?? 0}</span></span>
      <FriendsButton />
      <button className="os-mb-item hide-sm" title="Semua jendela (Ctrl+↑)" aria-label="Semua jendela" onClick={() => dispatchEvent(new CustomEvent('os:expose'))}><Icon name="layout-grid" /></button>
      <button className="os-mb-item os-mb-search" data-tour="cari" aria-label="Cari (Ctrl+K)" onClick={() => dispatchEvent(new CustomEvent('os:spot'))}>
        <Icon name="search" /><span className="hide-sm">Cari apa saja…</span><kbd className="hide-sm">{navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      <button className={`os-mb-item${me?.unread ? ' os-mb-dot' : ''}`} data-bell aria-label={`Notifikasi${me?.unread ? `, ${me.unread} baru` : ''}`} onClick={() => nav('/progres#feedback')}><Icon name="bell" /></button>
      <button className="os-mb-item" aria-label="Ganti Siang atau Malam" onClick={toggleTheme}><Icon name={theme === 'ink' || ink ? 'sun-moon' : 'sun-moon'} /></button>
      <span className="os-mb-item os-mb-clock hide-sm">{now}</span>
      <button className="os-mb-item os-mb-avatar" data-menu aria-label="Akun" onClick={open('akun')}>{me?.initials}</button>
      {menu && <Menu items={MENUS[menu.id]} at={menu.at} close={() => setMenu(null)} />}
    </header>
  );
}
