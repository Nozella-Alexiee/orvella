import { Orvi } from '../design/Orvi';

export function Boot() {
  return <div className="boot" aria-busy="true"><Orvi mood="think" size="lg" force /></div>;
}

export const homeFor = (role?: string) => (role === 'admin' ? '/admin' : role === 'mentor' ? '/mentor' : '/beranda');
