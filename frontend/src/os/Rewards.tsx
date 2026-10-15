/* Hadiah & kejutan di Orvella OS:
   - lencana baru "ditempel" ke layar sebagai stiker (dari respons API mana pun: event 'orvella:lencana')
   - naik level: layar perayaan penuh
   - wallpaper yang terbuka lewat XP: toast dengan tombol Pasang
   - notifikasi baru: Pip terbang ke lonceng
   - easter egg: kode Konami, logo 7×, "orvi dansa" / "matrix" dari Spotlight */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import { useQueryClient } from '@tanstack/react-query';
import { useMe } from '../api/hooks';
import type { Badge } from '../api/types';
import { Icon } from '../design/Icon';
import { Orvi } from '../design/Orvi';
import { toast } from '../design/toast';
import { confetti, confettiAt, motion, sound } from '../fx';
import { usePrefs } from '../state/prefs';
import { emit, on } from './bus';
import { dockOrvi } from './Dock';
import { danceOrvi, sleepOrvi } from './orviActions';
import { setWall, WALLS, type WallId } from './Wallpaper';

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* */ } };

/** Stiker lencana (juga dipakai koleksi di Pengaturan). */
export function BadgeSticker({ b, size = 120 }: { b: Pick<Badge, 'title' | 'icon' | 'color' | 'earned'>; size?: number }) {
  return (
    <span className={`os-badge${b.earned ? '' : ' is-locked'}`} style={{ ['--c' as string]: b.color, ['--s' as string]: `${size}px` }}>
      <span className="os-badge-disc"><Icon name={b.earned ? b.icon : 'lock'} /></span>
      <span className="os-badge-name">{b.title}</span>
    </span>
  );
}

export function Rewards() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const setTheme = usePrefs(s => s.setTheme);
  const [queue, setQueue] = useState<Badge[]>([]);
  const [level, setLevel] = useState<number | null>(null);
  const [egg, setEgg] = useState<'tim' | null>(null);
  const [rain, setRain] = useState(0);
  const lastUnread = useRef<number | null>(null);

  // lencana baru dari respons API
  useEffect(() => {
    const f = (e: Event) => {
      const list = (e as CustomEvent<Badge[]>).detail;
      setQueue(q => [...q, ...list.filter(b => !q.some(x => x.code === b.code))]);
      void qc.invalidateQueries({ queryKey: ['/api/lencana'] });
      void qc.invalidateQueries({ queryKey: ['/api/me'] });
    };
    addEventListener('orvella:lencana', f); return () => removeEventListener('orvella:lencana', f);
  }, [qc]);

  // naik level (dibandingkan dengan level terakhir yang pernah dilihat di perangkat ini)
  useEffect(() => {
    if (!me || me.role !== 'learner') return;
    const k = `orvella-level:${me.id}`, seen = Number(read(k) || 0);
    if (!seen) { write(k, String(me.level)); return; }
    if (me.level > seen) { write(k, String(me.level)); setLevel(me.level); emit('level:up', { level: me.level }); }
  }, [me?.id, me?.level]); // eslint-disable-line react-hooks/exhaustive-deps

  // wallpaper yang baru terbuka lewat XP
  useEffect(() => {
    if (!me) return;
    const k = `orvella-walls:${me.id}`, seen: string[] = JSON.parse(read(k) || '[]');
    const fresh = (Object.entries(WALLS) as [WallId, (typeof WALLS)[WallId]][]).filter(([id, w]) => w.xp && me.xp_total >= w.xp && !seen.includes(id));
    if (!fresh.length) return;
    write(k, JSON.stringify([...seen, ...fresh.map(([id]) => id)]));
    fresh.forEach(([id, w]) => toast({
      kind: 'success', icon: 'image', title: 'Wallpaper baru terbuka!', body: `${w.name} sekarang bisa kamu pakai (${w.xp!.toLocaleString('id-ID')} XP).`,
      actions: [{ label: 'Pasang', primary: true, run: () => { setTheme(w.dark ? 'ink' : 'paper'); setWall(id); sound('ok'); } }, { label: 'Nanti', run: () => {} }],
    }));
  }, [me?.id, me?.xp_total]); // eslint-disable-line react-hooks/exhaustive-deps

  // notifikasi baru: Pip mengantar ke lonceng
  useEffect(() => {
    if (!me) return;
    const prev = lastUnread.current; lastUnread.current = me.unread;
    if (prev !== null && me.unread > prev) {
      const bell = document.querySelector('[data-bell]');
      sound('pop');
      if (bell) void dockOrvi.current?.point(bell, { at: 'center', hold: 400 });
    }
  }, [me?.unread]); // eslint-disable-line react-hooks/exhaustive-deps

  // easter egg: Konami (↑↑↓↓←→←→BA) di mana saja selain kolom teks
  useEffect(() => {
    const code = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let i = 0;
    const k = (e: KeyboardEvent) => {
      if ((e.target as Element).closest?.('input,textarea,[contenteditable],.cm-editor')) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      i = key === code[i] ? i + 1 : key === code[0] ? 1 : 0;
      if (i === code.length) { i = 0; dispatchEvent(new CustomEvent('os:egg', { detail: 'konami' })); }
    };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, []);
  useEffect(() => {
    const f = (e: Event) => {
      const d = (e as CustomEvent<string>).detail;
      if (d === 'tim') { setEgg('tim'); sound('cheer'); }
      else if (d === 'dansa') danceOrvi();
      else if (d === 'tidur') sleepOrvi();
      else if (d === 'konami' || d === 'matrix') {
        setRain(Date.now()); sound('whoosh');
        if (d === 'konami') { dockOrvi.current?.react('cheer', 2000); window.setTimeout(() => dockOrvi.current?.say('Kode rahasia diterima. Aku pakai kacamata dulu 😎', { side: 'top', ms: 3400 }), 300); }
      }
    };
    addEventListener('os:egg', f); return () => removeEventListener('os:egg', f);
  }, []);

  // Orvi bereaksi pada kejadian desktop
  useEffect(() => {
    const offs = [
      on('pomodoro:start', ({ phase }) => { const o = dockOrvi.current; if (!o) return; if (phase === 'work') { o.mood('focus'); void o.say('Mode fokus. Aku jagain, kamu ngoding.', { side: 'top', ms: 2600 }); } else o.mood('happy'); }),
      on('pomodoro:stop', () => dockOrvi.current?.mood('happy')),
      on('pomodoro:done', ({ phase }) => { const o = dockOrvi.current; if (!o) return; o.mood('happy'); if (phase === 'work') o.celebrate(); else o.react('happy', 1200); }),
      on('xp', () => dockOrvi.current?.react('happy', 800)),
      on('level:up', () => dockOrvi.current?.celebrate()),
      on('badge', () => dockOrvi.current?.react('cheer', 1400)),
    ];
    return () => offs.forEach(f => f());
  }, []);

  const badge = queue[0];
  return (
    <>
      {badge && <BadgeToast key={badge.code} b={badge} done={() => setQueue(q => q.slice(1))} />}
      {level && <LevelUp level={level} done={() => setLevel(null)} />}
      {egg === 'tim' && <TeamNote done={() => setEgg(null)} />}
      {rain > 0 && <CodeRain key={rain} glasses done={() => setRain(0)} />}
    </>
  );
}

function BadgeToast({ b, done }: { b: Badge; done: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    sound('level'); emit('badge', { title: b.title });
    const el = ref.current;
    if (el && motion() !== 'off') {
      gsap.fromTo(el.querySelector('.os-badge'), { scale: 2.2, rotate: -24, opacity: 0 }, { scale: 1, rotate: -6, opacity: 1, duration: .6, ease: 'back.out(2.2)' });
      gsap.fromTo(el.querySelector('.os-badge-card'), { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: .4, delay: .25 });
      window.setTimeout(() => confettiAt(el.querySelector('.os-badge'), b.color), 350);
    }
    const t = window.setTimeout(close, 5200);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function close() {
    const el = ref.current;
    if (el && motion() !== 'off') gsap.to(el, { y: 30, opacity: 0, duration: .25, ease: 'power2.in', onComplete: done }); else done();
  }
  return createPortal(
    <div ref={ref} className="os-badge-pop" role="status" aria-live="polite" onClick={close}>
      <BadgeSticker b={b} size={132} />
      <div className="os-badge-card"><span className="os-eyebrow"><Icon name="award" size={14} />Lencana baru</span><b>{b.title}</b><p>{b.how}</p></div>
    </div>, document.body);
}

function LevelUp({ level, done }: { level: number; done: () => void }) {
  const ref = useRef<HTMLDivElement>(null), btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    sound('level'); confetti();
    btn.current?.focus();
    if (ref.current && motion() !== 'off') {
      gsap.fromTo(ref.current.querySelector('.os-lvl-card'), { scale: .7, opacity: 0, y: 30 }, { scale: 1, opacity: 1, y: 0, duration: .6, ease: 'back.out(1.8)' });
      gsap.fromTo(ref.current.querySelector('.os-lvl-ring > svg .fg'), { strokeDasharray: '0 400' }, { strokeDasharray: '377 400', duration: 1.2, delay: .3, ease: 'power2.out' });
    }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') done(); };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return createPortal(
    <div ref={ref} className="os-lvl" role="dialog" aria-modal="true" aria-label={`Naik ke level ${level}`}>
      <div className="os-lvl-card">
        <div className="os-lvl-ring">
          <svg viewBox="0 0 140 140" aria-hidden="true"><circle cx="70" cy="70" r="60" className="bg" /><circle cx="70" cy="70" r="60" className="fg" strokeDasharray="377 400" /></svg>
          <span className="os-lvl-orvi"><Orvi size={104} mood="cheer" follow={false} force /></span>
        </div>
        <span className="os-eyebrow"><Icon name="party-popper" size={14} />Naik level</span>
        <h2>Level <em>{level}</em>!</h2>
        <p>Kamu makin jago. Tiap level butuh sedikit lebih banyak XP, jadi santai aja, yang penting jalan terus.</p>
        <button ref={btn} className="btn btn-primary btn-lg" onClick={done}>Lanjut</button>
      </div>
    </div>, document.body);
}

function TeamNote({ done }: { done: () => void }) {
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => { btn.current?.focus(); confetti(); const k = (e: KeyboardEvent) => { if (e.key === 'Escape') done(); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [done]);
  return createPortal(
    <div className="os-lvl" role="dialog" aria-modal="true" aria-label="Pesan dari tim Orvella" onClick={e => { if (e.target === e.currentTarget) done(); }}>
      <div className="os-lvl-card os-egg-card">
        <span className="os-lvl-orvi solo"><Orvi size={96} mood="happy" follow={false} force /></span>
        <span className="os-eyebrow"><Icon name="sparkles" size={14} />Pesan rahasia</span>
        <h2>Eh, ketemu!</h2>
        <p>Orvella dibikin sambil ngopi dan sedikit begadang, biar kamu bisa belajar, bikin proyek, dan ngoding bareng teman. Makasih udah nyobain sampai ngeklik logo tujuh kali.</p>
        <p className="os-egg-sign">— tim Orvella · @orvella.labs</p>
        <button ref={btn} className="btn btn-primary" onClick={done}>Sama-sama!</button>
      </div>
    </div>, document.body);
}

/** Hujan kode sementara (Konami / "matrix"). */
function CodeRain({ done, glasses }: { done: () => void; glasses?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (motion() === 'off') { toast({ icon: 'sparkles', title: 'Hujan kode!', body: 'Nyalakan animasi di Pengaturan buat melihatnya.' }); done(); return; }
    const cv = ref.current!, ctx = cv.getContext('2d')!, w = cv.width = innerWidth, h = cv.height = innerHeight, fs = 16;
    const cols = Math.ceil(w / fs), y = Array.from({ length: cols }, () => Math.random() * -h / fs), chars = '01{}[]<>=;()/*+-orvella'.split('');
    let raf = 0; const t0 = performance.now();
    const draw = (now: number) => {
      const age = (now - t0) / 1000;
      ctx.fillStyle = 'rgba(7, 19, 27, .16)'; ctx.fillRect(0, 0, w, h);
      ctx.font = `700 ${fs}px "JetBrains Mono Variable", monospace`;
      for (let i = 0; i < cols; i++) {
        ctx.fillStyle = Math.random() > .96 ? '#E8FFF6' : '#34D8A6';
        ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * fs, y[i] * fs);
        y[i] = y[i] * fs > h && Math.random() > .975 ? 0 : y[i] + 1;
      }
      cv.style.opacity = String(age < 6.5 ? .88 : Math.max(0, .88 - (age - 6.5) * .6));
      if (age < 8) raf = requestAnimationFrame(draw); else done();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [done]);
  const host = glasses ? dockOrvi.current?.host() : null, r = host?.getBoundingClientRect();
  return createPortal(<>
    <canvas ref={ref} className="os-rain" aria-hidden="true" />
    {r && <svg className="os-shades" viewBox="0 0 100 40" style={{ left: r.left + r.width * .18, top: r.top + r.height * .36, width: r.width * .64 }} aria-hidden="true">
      <path d="M4 8 H96 L92 14 H56 L52 10 H48 L44 14 H8 Z" /><path d="M8 13 H44 L40 30 Q26 38 12 30 Z M56 13 H92 L88 30 Q74 38 60 30 Z" /></svg>}
  </>, document.body);
}
