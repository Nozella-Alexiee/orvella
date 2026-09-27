import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { api } from '../api/client';
import { useApi } from '../api/hooks';
import { Icon } from '../design/Icon';
import { LangIcon } from '../design/LangIcon';
import { Orvi } from '../design/Orvi';
import { PhaseRing } from '../design/PhaseRing';
import { cx, LoadError, Skel } from '../design/ui';
import { motion } from '../fx';
import { LANG_BY_ID } from '../lib/langs';

gsap.registerPlugin(Flip);

type Item = { slug: string; title: string; description: string; language: string; level: string; chapters: number; chapters_total: number; pct: number;
  started: boolean; current: boolean; from_class: boolean; by: string; visibility: string };

const css = `
.jl-filters { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 22px; }
.jl-chip { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 14px 0 10px; border-radius: 999px; border: 1.5px solid var(--border); background: var(--surface);
  font-weight: 700; font-size: 14px; color: var(--text-muted); transition: all var(--dur-200) var(--spring-bouncy); }
.jl-chip:hover { transform: translateY(-2px); color: var(--text); }
.jl-chip[aria-pressed="true"] { border-color: var(--lc, var(--marigold)); color: var(--text); box-shadow: 0 4px 0 color-mix(in oklab, var(--lc, var(--marigold)) 35%, transparent); }
.jl-chip .n { font-size: 11px; font-weight: 800; padding: 1px 7px; border-radius: 999px; background: var(--surface-sunken); }
.jl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; margin-top: 22px; }
.jl-card { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 14px; padding: 20px; border-radius: 24px; background: var(--surface);
  border: 1px solid var(--border); box-shadow: var(--shadow-clay); overflow: hidden; transition: transform var(--dur-200) var(--spring-bouncy), box-shadow var(--dur-200); }
.jl-card:hover { transform: translateY(-4px) rotate(-.3deg); box-shadow: var(--shadow-pop); }
.jl-card::after { content: ''; position: absolute; right: -40px; bottom: -60px; width: 170px; height: 170px; border-radius: 50%; background: var(--lc, var(--lilac)); opacity: .1; pointer-events: none; }
.jl-card.is-current { border-color: var(--marigold); box-shadow: 0 0 0 3px var(--marigold-soft), var(--shadow-clay); }
.jl-card h3 { font-family: var(--font-display); font-weight: 800; font-size: 21px; margin: 10px 0 4px; letter-spacing: -.01em; }
.jl-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.jl-empty { text-align: center; padding: 48px 16px; }
`;

/** Katalog jalur: semua jalur yang boleh dibuka siswa, disaring per bahasa. */
export default function Jalur() {
  const q = useApi<{ current: string; items: Item[] }>('/api/paths', { staleTime: 0 });
  const nav = useNavigate();
  const [lang, setLang] = useState('semua');
  const grid = useRef<HTMLDivElement>(null);
  const flip = useRef<Flip.FlipState | null>(null);
  const items = q.data?.items || [];
  const langs = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach(i => m.set(i.language, (m.get(i.language) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);
  const shown = items.filter(i => lang === 'semua' || i.language === lang);
  const choose = (l: string) => {
    if (grid.current && motion() !== 'off') flip.current = Flip.getState(grid.current.querySelectorAll('.jl-card'));
    setLang(l);
  };
  useLayoutEffect(() => {
    if (!flip.current) return;
    Flip.from(flip.current, { duration: 0.5, ease: 'back.out(1.4)', stagger: 0.03, absolute: true,
      onEnter: els => gsap.fromTo(els, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.4 }),
      onLeave: els => gsap.to(els, { opacity: 0, scale: 0.85, duration: 0.25 }) });
    flip.current = null;
  }, [lang]);
  const open = async (it: Item) => {
    try { await api.post(`/api/paths/${it.slug}/pick`); } catch { /* the map still opens */ }
    nav(`/peta/${it.slug}`);
  };

  if (q.error) return <main className="page"><LoadError onRetry={() => q.refetch()} /></main>;
  return (
    <main className="page page-wide">
      <style>{css}</style>
      <div className="row between wrap gap-4" style={{ alignItems: 'flex-end' }}>
        <div><div className="eyebrow">Jalur belajar</div><h1 className="big-serif mt-2" style={{ fontSize: 46 }}>Mau belajar <em>bahasa apa</em>?</h1>
          <p className="t-muted mt-2">Setiap jalur punya peta bab sendiri. Progresmu tersimpan di semua jalur.</p></div>
        <Orvi size="md" mood="happy" />
      </div>
      <div className="jl-filters" role="group" aria-label="Saring bahasa">
        <button className="jl-chip" aria-pressed={lang === 'semua'} onClick={() => choose('semua')}><Icon name="layout-grid" size={14} />Semua<span className="n">{items.length}</span></button>
        {langs.map(([l, n]) => (
          <button key={l} className="jl-chip" aria-pressed={lang === l} style={{ ['--lc' as string]: `var(--lang-${l}, var(--lilac))` }} onClick={() => choose(l)}>
            <LangIcon id={l} size={20} />{LANG_BY_ID[l]?.name || l}<span className="n">{n}</span></button>
        ))}
      </div>
      {!q.data ? <div className="jl-grid">{[0, 1, 2, 3].map(i => <Skel key={i} h={200} r={24} />)}</div> : (
        <div className="jl-grid" ref={grid}>
          {shown.map(it => (
            <button key={it.slug} data-flip-id={it.slug} className={cx('jl-card', it.current && 'is-current')} style={{ ['--lc' as string]: `var(--lang-${it.language}, var(--lilac))`, textAlign: 'left' }} onClick={() => open(it)}>
              <div style={{ minWidth: 0 }}>
                <div className="row gap-2" style={{ alignItems: 'center' }}><LangIcon id={it.language} size={34} />
                  {it.current && <span className="badge badge-accent"><Icon name="map" />jalurmu sekarang</span>}
                  {it.from_class && !it.current && <span className="badge badge-success"><Icon name="users" />dari kelasmu</span>}</div>
                <h3>{it.title}</h3>
                <p className="t-sm t-muted" style={{ margin: 0 }}>{it.description || `Belajar ${LANG_BY_ID[it.language]?.name} dari dasar.`}</p>
                <div className="jl-meta"><span className="badge">{it.level}</span><span className="badge">{it.chapters} bab</span><span className="badge">oleh {it.by}</span></div>
              </div>
              <PhaseRing values={[0, 1, 2, 3].map(k => Math.max(0, Math.min(1, it.pct / 25 - k)))} size={64} stroke={6}><b style={{ fontSize: 13 }}>{it.pct}%</b></PhaseRing>
            </button>
          ))}
        </div>
      )}
      {q.data && !shown.length && <div className="jl-empty"><Orvi size="lg" mood="think" /><p className="t-muted mt-3">Belum ada jalur untuk bahasa ini.</p></div>}
      <p className="t-xs t-faint mt-6">Mentor juga bisa membuat jalur khusus kelasmu lewat Studio Materi. <Link className="link" to="/playground?baru=1">Atau ngoding bebas di Playground</Link>.</p>
    </main>
  );
}
