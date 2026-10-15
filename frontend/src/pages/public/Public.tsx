/* Halaman publik bergaya Orvella OS (landing, masuk, daftar, onboarding):
   wallpaper hidup, menu bar publik, dan tombol "Masuk dengan Google". */
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import '@fontsource-variable/unbounded';
import '@fontsource-variable/figtree';
import '../../os/os.css';
import './public.css';
import { useApi } from '../../api/hooks';
import { Icon } from '../../design/Icon';
import { LogoMark } from '../../design/LogoMark';
import { toast } from '../../design/toast';
import { usePrefs } from '../../state/prefs';
import { Wallpaper } from '../../os/Wallpaper';

const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const clock = (d = new Date()) => `${DAYS[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]} ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;

export function PublicShell({ children, nav, cta = true, className = '' }: { children: ReactNode; nav?: ReactNode; cta?: boolean; className?: string }) {
  const toggleTheme = usePrefs(s => s.toggleTheme);
  const [now, setNow] = useState(clock());
  useEffect(() => { const t = setInterval(() => setNow(clock()), 15000); return () => clearInterval(t); }, []);
  return (
    <div className={`pub-root ${className}`}>
      <Wallpaper />
      <header className="os-menubar pub-menubar">
        <Link className="os-mb-item os-mb-logo" to="/"><LogoMark /><span>Orvella OS</span></Link>
        <nav className="pub-links" aria-label="Bagian halaman">{nav}</nav>
        <span className="os-mb-spacer" />
        <button className="os-mb-item" aria-label="Ganti Siang atau Malam" onClick={toggleTheme}><Icon name="sun-moon" /></button>
        <span className="os-mb-item os-mb-clock hide-sm">{now}</span>
        {cta && <><Link className="os-mb-item pub-mb-login" to="/masuk">Masuk</Link><Link className="btn btn-sm pub-mb-cta" to="/daftar">Mulai gratis</Link></>}
      </header>
      {children}
    </div>
  );
}

/** Logo "G" resmi Google untuk tombol masuk (pedoman merek Google Sign-In). */
export function GoogleG({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** Masuk/daftar lewat Google (OAuth di server). Kalau admin belum menyambungkan Google, tampil pesan. */
export function GoogleButton({ next = '', label = 'Masuk dengan Google', className = '' }: { next?: string; label?: string; className?: string }) {
  const q = useApi<{ google: boolean }>('/api/auth/providers', { staleTime: 60_000, retry: false });
  const go = () => {
    if (!q.data?.google) {
      toast({ kind: 'accent', icon: 'info', title: 'Login Google belum aktif', body: 'Admin belum menyambungkan akun Google ke Orvella. Pakai email dulu, ya.' });
      return;
    }
    location.href = `/api/auth/google/start${next ? `?next=${encodeURIComponent(next)}` : ''}`;
  };
  return <button type="button" className={`btn btn-lg pub-google ${className}`} onClick={go}><GoogleG />{label}</button>;
}

/** Pesan dari ?galat=google-… setelah kembali dari Google. */
export const GOOGLE_ERRORS: Record<string, string> = {
  'google-batal': 'Masuk dengan Google dibatalkan.',
  'google-state': 'Sesi masuk Google kedaluwarsa. Coba lagi dari awal.',
  'google-token': 'Google belum bisa memverifikasi akunmu. Coba lagi sebentar.',
  'google-email': 'Email Google-mu belum terverifikasi, jadi tidak bisa ditautkan ke akun yang sudah ada.',
  'google-nonaktif': 'Login Google belum diaktifkan admin.',
  'google-akun': 'Akun ini tidak bisa masuk. Hubungi admin sekolahmu.',
};
