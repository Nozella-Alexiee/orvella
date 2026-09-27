import type { CSSProperties } from 'react';
import { LANG_BY_ID, STACK_ICONS } from '../lib/langs';

/* Logo bahasa asli dari Devicon (MIT). Dipakai sebagai <img> supaya id gradien tidak bentrok;
   logo satu warna (Rust, Express, Flask) dibalik warnanya di tema Malam lewat .is-mono. */
const URLS = import.meta.glob('../assets/lang/*.svg', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

function resolve(id: string) {
  const l = LANG_BY_ID[id];
  if (l) return { file: l.icon, mono: !!l.mono, name: l.name };
  const s = STACK_ICONS[id];
  return s ? { file: s.icon, mono: !!s.mono, name: s.name } : null;
}

export function LangIcon({ id, size = 22, className = '', style, label }: { id: string; size?: number; className?: string; style?: CSSProperties; label?: boolean }) {
  const r = resolve(id);
  if (!r) return null;
  return (
    <span className={`lang-ico${r.mono ? ' is-mono' : ''} ${className}`} style={{ width: size, height: size, ...style }}>
      <img src={URLS[`../assets/lang/${r.file}.svg`]} alt={label ? r.name : ''} width={size} height={size} loading="lazy" decoding="async" />
    </span>
  );
}

export function LangChip({ id, lg, className = '' }: { id: string; lg?: boolean; className?: string }) {
  const r = resolve(id);
  if (!r) return null;
  return (
    <span className={`lang-chip${lg ? ' is-lg' : ''} ${className}`} style={{ ['--lc' as string]: `var(--lang-${id}, var(--lilac))` }}>
      <LangIcon id={id} size={lg ? 28 : 22} />{r.name}
    </span>
  );
}

/** URL berkas ikon (untuk HTML yang dibangun tanpa React, mis. landing). */
export const langIconUrl = (file: string) => URLS[`../assets/lang/${file}.svg`];
