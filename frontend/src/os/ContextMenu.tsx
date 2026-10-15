/* Klik kanan di Orvella OS: satu handler untuk desktop kosong, widget, ikon proyek, title bar jendela,
   ikon dock, dan Orvi. Di dalam isi jendela, editor kode, dan kolom teks, menu bawaan browser tetap muncul
   (salin/tempel, periksa ejaan, dll). */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api/client';
import { queryClient } from '../api/hooks';
import { toast } from '../design/toast';
import { sound } from '../fx';
import { usePrefs } from '../state/prefs';
import { Menu, type MenuItem } from './Menu';
import { orviActions } from './orviActions';
import { useOs } from './OsLayout';
import { appById } from './registry';
import { useWM } from './wm';

const desk = (d: { do: string; id?: string | number }) => dispatchEvent(new CustomEvent('os:desk', { detail: d }));
const winctl = (id: string, d: string) => dispatchEvent(new CustomEvent('os:winctl', { detail: { id, do: d } }));

export function ContextMenu() {
  const [menu, setMenu] = useState<{ items: MenuItem[]; at: DOMRect; label: string } | null>(null);
  const nav = useNavigate();
  const os = useOs();
  const toggleTheme = usePrefs(s => s.toggleTheme);

  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      const t = e.target as Element;
      // biarkan menu bawaan browser di tempat yang butuh salin/tempel
      if (t.closest('input,textarea,[contenteditable="true"],[contenteditable="plaintext-only"],.cm-editor,.os-win-body,iframe')) return;
      const at = new DOMRect(e.clientX, e.clientY, 0, 0);
      const ink = document.documentElement.dataset.theme === 'ink';
      let items: MenuItem[] | null = null, label = 'Menu';

      const bar = t.closest('.os-win');
      const dockApp = t.closest<HTMLElement>('.os-dock-app');
      const proj = t.closest<HTMLElement>('[data-ctx="proyek"]');
      const wg = t.closest<HTMLElement>('[data-ctx="widget"]');
      if (bar && t.closest('.os-win-bar')) {
        const w = useWM.getState().wins.find(x => x.id === (bar as HTMLElement).dataset.win);
        if (w) {
          label = 'Jendela';
          items = [['label', appById(w.app)?.title || 'Jendela'],
            [w.max ? 'copy' : 'square', w.max ? 'Pulihkan ukuran' : 'Perbesar', () => winctl(w.id, 'max')],
            ['minus', 'Kecilkan ke dock', () => winctl(w.id, 'min')],
            ['scan', w.focusMode ? 'Keluar dari Mode Fokus' : 'Mode Fokus', () => winctl(w.id, 'focus')], ['sep'],
            ['panel-left', 'Bagi ke kiri', () => winctl(w.id, 'left')], ['panel-right', 'Bagi ke kanan', () => winctl(w.id, 'right')], ['sep'],
            ['x', 'Tutup', () => winctl(w.id, 'close')]];
        }
      } else if (t.closest('.os-dock-orvi')) {
        label = 'Orvi';
        items = orviActions();
      } else if (dockApp?.dataset.dock) {
        const app = dockApp.dataset.dock, open = useWM.getState().wins.filter(w => w.app === app);
        label = 'Dock';
        items = app === 'beranda' ? [['layout-dashboard', 'Tampilkan desktop', () => os?.showDesktop()]]
          : [['label', appById(app)?.title || app], ['external-link', open.length ? 'Tampilkan' : 'Buka', () => os?.openApp(app)],
            ...(open.length ? [['x', open.length > 1 ? `Tutup ${open.length} jendela` : 'Tutup jendela', () => open.forEach(w => winctl(w.id, 'close'))] as MenuItem] : [])];
      } else if (proj?.dataset.proj) {
        const id = Number(proj.dataset.proj), name = proj.dataset.name || 'proyek';
        label = 'Proyek';
        items = [['label', name], ['folder-open', 'Buka', () => nav(`/sandbox/${id}`)], ['image', 'Terbitkan ke Galeri', () => nav(`/sandbox/${id}?terbit=1`)],
          ['download', 'Unduh .zip', () => { window.location.href = `/api/sandbox/${id}/export`; }], ['sep'],
          ['pencil', 'Ganti nama', () => desk({ do: 'rename', id }), 'F2'], ['trash-2', 'Hapus…', () => confirmDelete(id, name)]];
      } else if (wg?.dataset.w) {
        label = 'Widget';
        items = [['label', wg.getAttribute('aria-label') || 'Widget'], ['x', 'Buang widget', () => desk({ do: 'remove', id: wg.dataset.w })],
          ['layout-grid', 'Atur widget', () => desk({ do: 'edit' })]];
      } else if (t.closest('[data-ctx="desk"]')) {
        label = 'Desktop';
        items = [['file-plus', 'Proyek baru…', () => nav('/sandbox?baru=1'), 'Ctrl N'], ['layout-grid', 'Atur widget', () => desk({ do: 'edit' })],
          ['notebook-pen', 'Tambah catatan tempel', () => desk({ do: 'add', id: 'catatan' })], ['timer', 'Tambah timer fokus', () => desk({ do: 'add', id: 'fokus' })],
          ['braces', 'Tebak output hari ini', () => desk({ do: 'add', id: 'teka' })], ['sep'],
          ['image', 'Ganti wallpaper…', () => nav('/pengaturan#wallpaper')], ['sun-moon', ink ? 'Ganti ke Siang' : 'Ganti ke Malam', toggleTheme],
          ['layout-list', 'Rapikan ikon', () => desk({ do: 'tidy' })]];
      }
      if (!items) return;
      e.preventDefault();
      sound('tap');
      setMenu({ items, at, label });
    };
    addEventListener('contextmenu', onCtx);
    return () => removeEventListener('contextmenu', onCtx);
  }, [nav, os, toggleTheme]);

  return menu ? <Menu items={menu.items} at={menu.at} label={menu.label} close={() => setMenu(null)} /> : null;
}

function confirmDelete(id: number, name: string) {
  toast({
    kind: 'danger', icon: 'trash-2', title: `Hapus "${name}"?`, body: 'Proyek, snapshot, dan replay-nya ikut terhapus.',
    actions: [{ label: 'Hapus', primary: true, run: async () => {
      try { await api.del(`/api/sandbox/${id}`); await queryClient.invalidateQueries({ queryKey: ['/api/sandbox'] }); sound('pop'); toast({ icon: 'trash-2', title: 'Proyek dihapus' }); }
      catch { toast({ kind: 'danger', icon: 'circle-alert', title: 'Belum bisa menghapus', body: 'Coba lagi, ya.' }); }
    } }, { label: 'Batal', run: () => {} }],
  });
}
