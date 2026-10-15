/* Dock orbit: app di kiri-kanan, Orvi di tengah. Ikon terangkat dengan pegas saat
   disorot, titik menandai app yang terbuka, dan ikon proyek bisa dijatuhkan ke Sandbox
   (buka) atau Galeri (terbitkan). Di HP dock menjadi tab bar. */
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { gsap } from 'gsap';
import { useShallow } from 'zustand/react/shallow';
import { Icon } from '../design/Icon';
import { Orvi, type OrviHandle } from '../design/Orvi';
import { motion, sound } from '../fx';
import { greeting } from '../lib/hooks';
import { APPS } from './registry';
import { useWM } from './wm';
import { useOs } from './OsLayout';
import { draggable, target } from './dnd';
import { on } from './bus';

/** Orvi di dock; Guide memakainya untuk menunjuk dan bereaksi. */
export const dockOrvi: { current: OrviHandle | null } = { current: null };
const TIPS = ['Tekan Ctrl+K untuk mencari apa saja.', 'Seret jendela ke tepi layar untuk membaginya dua.', 'Klik dua kali judul jendela untuk memperbesar.',
  'Di Sandbox, Ctrl+Enter menjalankan proyekmu dan Ctrl+S menyimpan snapshot.', 'Seret ikon proyek dari desktop ke Galeri di dock untuk menerbitkannya.',
  'Aku Orvi. Pip, bulan kecilku, suka menunjuk hal penting.', 'Tahan aku buat ngelus. Seret aku ke jendela kalau butuh bantuan.',
  'Klik kanan desktop buat nambah catatan tempel atau timer fokus.'];

/** Orvi dijatuhkan ke jendela: kasih tip sesuai isinya, lalu Pip menunjuk. */
export function orviVisits(winEl: Element, app: string) {
  const o = dockOrvi.current;
  if (!o) return;
  if (o.sleeping()) o.wake();
  const prob = winEl.querySelector('.ide-prob');
  const title = winEl.querySelector('.os-win-title b')?.textContent || '';
  let text: string, at: Element = winEl.querySelector('.os-win-bar') || winEl;
  if (app === 'sandbox' && prob) {
    text = `Masalah pertama: ${prob.querySelector('b')?.textContent || 'ada error'}${prob.querySelector('small')?.textContent ? ` (${prob.querySelector('small')!.textContent})` : ''}. Klik "Ke baris" buat lompat ke sana.`;
    at = prob;
  } else if (app === 'sandbox') text = `${title ? `${title} ` : 'Proyek ini '}aman, gak ada error. Ctrl+Enter buat jalanin, Ctrl+S buat snapshot.`;
  else if (app === 'belajar' || app === 'fokus') text = 'Kerjakan fase yang ditandai cincin warna dulu. Selesai satu, fase berikutnya kebuka.';
  else if (app === 'galeri') text = 'Suka proyeknya? Kasih bintang, atau Remix buat nyalin ke Sandbox-mu dan ubah sesukamu.';
  else if (app === 'musik') text = 'Musiknya tetap jalan walau jendela ini ditutup. Kontrolnya ada di menu bar.';
  else text = `Ini ${title || 'jendela'}. Klik kanan title bar-nya buat bagi layar atau Mode Fokus.`;
  o.react('happy', 900);
  void o.say(text, { side: 'top', ms: Math.max(4200, text.length * 55) });
  window.setTimeout(() => void o.point(at, { at: 'top', hold: 900 }), 500);
}

export function Dock() {
  const os = useOs();
  const nav = useNavigate();
  const runningApps = useWM(useShallow(s => s.wins.map(w => w.app)));
  const running = new Set(runningApps);
  const ref = useRef<HTMLElement>(null);
  const apps = APPS.filter(a => a.dock);
  const left = apps.slice(0, 2), right = apps.slice(2);

  useEffect(() => {
    const el = ref.current!;
    const offs: (() => void)[] = [];
    const sb = el.querySelector('[data-dock="sandbox"]'), gl = el.querySelector('[data-dock="galeri"]');
    if (sb) offs.push(target(sb, ['proyek'], d => nav(`/sandbox/${d.id}`), { hint: d => `Buka ${d.label} di Sandbox` }));
    if (gl) offs.push(target(gl, ['proyek'], d => nav(`/sandbox/${d.id}?terbit=1`), { hint: d => `Terbitkan ${d.label} ke Galeri` }));
    // dock membesar ala macOS: ikon di dekat kursor membesar, tetangganya bergeser memberi ruang, latarnya ikut melebar.
    // Cuma properti translate/scale yang diubah di requestAnimationFrame, jadi layout tidak dihitung ulang.
    {
      const R = 150, A = .52, amt = { k: 0 };
      type Kid = { el: HTMLElement; c: number; w: number; app: boolean; tip: HTMLElement | null };
      let base: Kid[] | null = null, mx = 0, left = 0, raf = 0, near: HTMLElement | null = null;
      const magOn = () => motion() === 'full' && !matchMedia('(max-width: 760px)').matches;
      const measure = () => {
        left = el.getBoundingClientRect().left;
        base = [...el.children].map(k => { const e = k as HTMLElement; return { el: e, c: e.offsetLeft + e.offsetWidth / 2, w: e.offsetWidth, app: e.classList.contains('os-dock-app'), tip: e.querySelector<HTMLElement>('.os-dock-tip') }; });
      };
      const paint = () => {
        raf = 0; if (!base) return;
        const sc = base.map(b => (b.app ? 1 + A * amt.k * Math.max(0, Math.cos(Math.min(Math.abs(mx - b.c) / R, 1) * Math.PI / 2)) : 1));
        const extra = base.map((b, i) => b.w * (sc[i] - 1)), E = extra.reduce((x, y) => x + y, 0);
        let acc = 0, top = -1;
        base.forEach((b, i) => {
          const o = acc + extra[i] / 2 - E / 2; acc += extra[i];
          b.el.style.translate = Math.abs(o) < .05 ? '' : `${o.toFixed(2)}px 0`;
          if (b.app) { b.el.style.scale = sc[i] === 1 ? '' : sc[i].toFixed(3); if (b.tip) b.tip.style.scale = sc[i] === 1 ? '' : (1 / sc[i]).toFixed(3); if (top < 0 || sc[i] > sc[top]) top = i; }
        });
        el.style.setProperty('--dg', E.toFixed(1) + 'px');
        const n = amt.k > .5 && top >= 0 && sc[top] > 1.2 ? base[top].el : null;
        if (n !== near) { near?.classList.remove('is-near'); n?.classList.add('is-near'); near = n; }
      };
      const enter = (e: PointerEvent) => {
        if (!magOn()) return;
        measure(); mx = e.clientX - left;
        gsap.killTweensOf(amt); gsap.to(amt, { k: 1, duration: .14, ease: 'power2.out', onUpdate: paint });
      };
      const move = (e: PointerEvent) => { if (!base || !magOn()) return; mx = e.clientX - left; if (!raf) raf = requestAnimationFrame(paint); };
      const leave = () => {
        if (!base) return;
        const end = () => { base?.forEach(b => { b.el.style.translate = ''; b.el.style.scale = ''; if (b.tip) b.tip.style.scale = ''; }); el.style.removeProperty('--dg'); base = null; };
        gsap.killTweensOf(amt);
        if (motion() !== 'off') gsap.to(amt, { k: 0, duration: .28, ease: 'power3.out', onUpdate: paint, onComplete: end }); else { amt.k = 0; end(); }
        near?.classList.remove('is-near'); near = null;
      };
      el.addEventListener('pointerenter', enter); el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave);
      offs.push(() => { el.removeEventListener('pointerenter', enter); el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); cancelAnimationFrame(raf); });
    }
    // Orvi bisa diseret ke jendela mana pun (jendela mendaftarkan dirinya sebagai target 'orvi')
    const ob = el.querySelector<HTMLElement>('.os-dock-orvi');
    if (ob) offs.push(draggable(ob, () => (dockOrvi.current ? { type: 'orvi', label: 'Orvi' } : null)));
    offs.push(on('orvi:visit', ({ win, app }) => orviVisits(win, app)));
    return () => offs.forEach(f => f());
  }, [nav]);

  // elus: tahan Orvi sebentar → senang, pipi merona, hati kecil melayang
  const pet = useRef<{ t: number; hearts: number; petted: boolean; slept: boolean }>({ t: 0, hearts: 0, petted: false, slept: false });
  const heart = () => {
    const host = dockOrvi.current?.host(); if (!host || motion() === 'off') return;
    const r = host.getBoundingClientRect(), e = document.createElement('span');
    e.className = 'os-heart'; e.textContent = '♥';
    Object.assign(e.style, { left: r.left + r.width * (.3 + Math.random() * .4) + 'px', top: r.top + r.height * .3 + 'px' });
    document.body.appendChild(e);
    gsap.fromTo(e, { y: 0, scale: .5, opacity: 0 }, { y: -60 - Math.random() * 30, x: (Math.random() - .5) * 40, scale: 1.1, opacity: 1, duration: .9, ease: 'power2.out',
      onComplete: () => gsap.to(e, { opacity: 0, duration: .25, onComplete: () => e.remove() }) });
  };
  const petDown = (e: React.PointerEvent) => {
    const p = pet.current;
    p.slept = !!dockOrvi.current?.sleeping(); p.petted = false;
    if (e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY;
    const cancel = () => { clearTimeout(p.t); clearInterval(p.hearts); removeEventListener('pointerup', cancel); removeEventListener('pointermove', moved); };
    const moved = (ev: PointerEvent) => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) cancel(); };
    p.t = window.setTimeout(() => {
      p.petted = true;
      dockOrvi.current?.react('happy', 2600); sound('pop'); heart();
      p.hearts = window.setInterval(() => { heart(); dockOrvi.current?.react('happy', 1200); }, 320);
    }, 550);
    addEventListener('pointerup', cancel); addEventListener('pointermove', moved);
  };
  // satu klik = tip; klik beruntun = dicolek (engine Orvi yang bereaksi, sampai "pusing" di colekan ke-6)
  const tip = useRef({ t: 0, last: 0 });
  const orviClick = () => {
    const p = pet.current, k = tip.current, now = performance.now(), rapid = now - k.last < 650;
    k.last = now; clearTimeout(k.t);
    if (p.petted) { p.petted = false; dockOrvi.current?.say('Hehe, makasih. Aku jadi semangat!', { side: 'top', ms: 2400 }); return; }
    if (p.slept) { window.setTimeout(() => dockOrvi.current?.say(`${greeting()}! Aku udah bangun.`, { side: 'top', ms: 2600 }), 450); return; }
    if (rapid) return;
    k.t = window.setTimeout(() => dockOrvi.current?.say(TIPS[Math.floor(Math.random() * TIPS.length)], { side: 'top', ms: 3800 }), 380);
  };

  const btn = (a: typeof apps[number]) => (
    <button key={a.id} className={`os-dock-app${running.has(a.id) ? ' is-running' : ''}${a.id === 'progres' || a.id === 'pengaturan' ? ' hide-sm' : ''}`} data-dock={a.id} data-tour={`dock-${a.id}`}
      style={{ ['--app' as string]: a.color }} aria-label={a.title} onClick={() => { sound('tap'); os?.openApp(a.id); }}>
      <Icon name={a.icon} /><span className="os-run" /><span className="os-dock-tip">{a.title}</span>
    </button>
  );
  return (
    <div className="os-dock-wrap">
      <nav ref={ref} className="os-dock" aria-label="Dock" data-tour="dock">
        <button className="os-dock-app" data-dock="beranda" style={{ ['--app' as string]: 'var(--os-sun)' }} aria-label="Beranda" onClick={() => os?.showDesktop()}>
          <Icon name="house" /><span className="os-dock-tip">Beranda</span>
        </button>
        {left.map(btn)}
        <button className="os-dock-orvi" aria-label="Orvi, asistenmu" title="Orvi: klik untuk tips, tahan untuk mengelus, seret ke jendela untuk minta bantuan"
          onPointerDownCapture={petDown} onClick={orviClick}>
          <Orvi ref={dockOrvi} size={70} mood="happy" follow idle />
        </button>
        {right.map(btn)}
      </nav>
    </div>
  );
}
