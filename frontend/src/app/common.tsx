import { Orvi } from '../design/Orvi';

export function Boot() {
  return <div className="boot" aria-busy="true"><Orvi mood="think" size="lg" force /></div>;
}

/** superadmin = admin + ngatur admin lain dan batas Orvi AI. */
export const isAdmin = (role?: string) => role === 'admin' || role === 'superadmin';
/** Semua peran mendarat di desktop; halaman Admin/Mentor dibuka dari menu Orvella atau Spotlight. */
export const homeFor = (_role?: string) => '/beranda';
