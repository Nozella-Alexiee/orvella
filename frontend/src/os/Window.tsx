/* Satu jendela Orvella OS, gerak ala macOS:
   - seret cuma lewat transform di requestAnimationFrame (tanpa hitung ulang layout), magnet ke tepi, lemparan inersia;
   - buka membesar dari ikon dock dengan pegas, tutup memudar, kecilkan "tersedot" ala genie;
   - maksimal/snap/mode layang pakai FLIP: ukuran akhir dipasang sekali, yang dianimasikan cuma transform;
   - tombol lampu merah-kuning-hijau di kiri title bar.
   Posisi tidak dirender React: ditulis langsung ke style, lalu disimpan ke store saat dilepas. */
import { createContext, Suspense, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { Icon } from '../design/Icon';
import { motion, sound } from '../fx';
import { useWM, type Rect, type Win } from './wm';
import { target } from './dnd';
import { emit } from './bus';
import type { AppDef } from './registry';
import { create } from 'zustand';
import { SPRING, holdOff, holdOn, lift, pause, touchHold } from './motion';

export const MENUBAR_H = 38, DOCK_SPACE = 96;
export const isPhone = () => matchMedia('(max-width: 760px)').matches;
export const deskRect = (): Rect => ({ x: 0, y: 0, w: innerWidth, h: innerHeight - MENUBAR_H - DOCK_SPACE });

/** Judul dinamis jendela (mis. nama proyek Sandbox) yang diisi app di dalamnya. */
export const useWinMeta = create<{ meta: Record<string, { title?: string; sub?: string; tools?: ReactNode }>; set: (id: string, m: { title?: string; sub?: string; tools?: ReactNode }) => void }>(set => ({
  meta: {},
  set: (id, m) => set(s => ({ meta: { ...s.meta, [id]: { ...s.meta[id], ...m } } })),
}));

type WinCtx = { id: string; app: string; active: boolean; visible: boolean };
const Ctx = createContext<WinCtx | null>(null);
/** Dipakai app di dalam jendela: id jendela, apakah sedang fokus/terlihat. Null di tampilan klasik. */
export const useWin = () => useContext(Ctx);
export function useWinTitle(title?: string, sub?: string, tools?: ReactNode) {
  const w = useWin();
  const set = useWinMeta(s => s.set);
  useEffect(() => { if (w) set(w.id, { title, sub, tools }); }, [w?.id, title, sub, tools]); // eslint-disable-line react-hooks/exhaustive-deps
}

const dockIcon = (app: string) => document.querySelector(`[data-dock="${app}"]`) || document.querySelector('.os-dock-orvi');
const moving = () => motion() !== 'off';
const dur = (full: number, calm: number) => (motion() === 'full' ? full : calm);
const resized = (id: string) => dispatchEvent(new CustomEvent('os:resize', { detail: id }));

function snapZone(x: number, y: number) {
  const W = deskRect(), e = 14, halfW = Math.round(W.w / 2), halfH = Math.round(W.h / 2);
  if (y < 6 && x > e && x < W.w - e) return { kind: 'max', r: W };
  if (x < e && y < 90) return { kind: 'q', r: { x: 0, y: 0, w: halfW, h: halfH } };
  if (x > W.w - e && y < 90) return { kind: 'q', r: { x: halfW, y: 0, w: W.w - halfW, h: halfH } };
  if (x < e && y > W.h - 90) return { kind: 'q', r: { x: 0, y: halfH, w: halfW, h: W.h - halfH } };
  if (x > W.w - e && y > W.h - 90) return { kind: 'q', r: { x: halfW, y: halfH, w: W.w - halfW, h: W.h - halfH } };
  if (x < e) return { kind: 'l', r: { x: 0, y: 0, w: halfW, h: W.h } };
  if (x > W.w - e) return { kind: 'r', r: { x: halfW, y: 0, w: W.w - halfW, h: W.h } };
  return null;
}
/** Tepi yang bisa ditempeli saat diseret: tepi layar + tepi jendela lain yang kelihatan. */
function edgesFor(id: string) {
  const W = deskRect(), xs = [0, W.w], ys = [0, W.h];
  for (const o of useWM.getState().wins) {
    if (o.id === id || o.min || o.float || o.max || o.focusMode) continue;
    xs.push(o.rect.x, o.rect.x + o.rect.w); ys.push(o.rect.y, o.rect.y + o.rect.h);
  }
  return { xs, ys };
}
function magnet(v: number, size: number, list: number[]) {
  let best = 11, out = v;
  for (const t of list) for (const off of [0, size]) { const d = Math.abs(v + off - t); if (d < best) { best = d; out = t - off; } }
  return out;
}

/* ---------- mode layang: kecil, selalu di atas, nempel ke pojok ---------- */
const FLOAT_SIZE: Record<string, { w: number; h: number }> = { orvi: { w: 380, h: 560 }, musik: { w: 380, h: 470 } };
const cornerAt = (cx: number, cy: number) => { const W = deskRect(); return (cy < W.h / 2 ? 't' : 'b') + (cx < W.w / 2 ? 'l' : 'r'); };
/** Posisi jendela layang di pojok c: antre di belakang jendela layang lain yang lebih dulu ada di pojok itu. */
function floatSlot(c: string, id: string, size: { w: number; h: number }, fseq: number) {
  const W = deskRect(), m = 14;
  const acc = useWM.getState().wins.filter(w => w.id !== id && w.float && !w.min && w.corner === c && (w.fseq || 0) < fseq).reduce((a, w) => a + w.rect.h + 12, 0);
  return { x: c[1] === 'l' ? m : W.w - size.w - m, y: Math.max(m, c[0] === 't' ? m + acc : W.h - size.h - m - acc) };
}
const restack = (corner?: string) => { if (corner) dispatchEvent(new CustomEvent('os:restack', { detail: corner })); };

export function Window({ win, app, active, occluded, children }: { win: Win; app: AppDef; active: boolean; occluded?: boolean; children: ReactNode }) {
  const el = useRef<HTMLElement>(null);
  const ghost = useRef<HTMLDivElement | null>(null);
  const cur = useRef<Rect | null>(null); // rect yang terakhir dipasang ke DOM
  const sh = useRef<[number, number] | null>(null);
  const st = useWM.getState;
  const meta = useWinMeta(s => s.meta[win.id]);
  const [phone, setPhone] = useState(isPhone());
  useEffect(() => { const m = matchMedia('(max-width: 760px)'); const f = () => setPhone(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, []);
  const me = () => st().wins.find(w => w.id === win.id);

  /** Bayangan jatuh menjauhi cahaya wallpaper. Dihitung dari angka (tanpa mengukur DOM) dan cuma ditulis kalau berubah. */
  const shade = (r = cur.current) => {
    const n = el.current, L = (window as unknown as { __osLight?: { x: number; y: number } }).__osLight;
    if (!n || !L || !r) return;
    let dx = r.x + r.w / 2 - L.x, dy = r.y + MENUBAR_H + r.h / 2 - L.y;
    const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 700);
    dx = dx / d * (8 + 16 * k); dy = dy / d * (8 + 16 * k) + 6;
    if (sh.current && Math.abs(sh.current[0] - dx) < 1 && Math.abs(sh.current[1] - dy) < 1) return;
    sh.current = [dx, dy];
    n.style.setProperty('--shx', dx.toFixed(1) + 'px'); n.style.setProperty('--shy', dy.toFixed(1) + 'px');
  };
  const apply = (r: Rect) => {
    const n = el.current; if (!n) return;
    Object.assign(n.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    cur.current = { ...r };
  };
  /** Pasang posisi/ukuran. animate = FLIP: ukuran akhir langsung dipasang, lalu cuma transform yang dianimasikan. */
  const place = (r: Rect, animate = false) => {
    const n = el.current; if (!n || phone || me()?.focusMode) return;
    const from = cur.current;
    apply(r); shade(r);
    if (!animate || !moving() || !from) return;
    gsap.killTweensOf(n, 'x,y,scaleX,scaleY');
    pause(dur(.42, .22)); lift(n, true);
    gsap.fromTo(n, { x: from.x - r.x, y: from.y - r.y, scaleX: from.w / r.w, scaleY: from.h / r.h, transformOrigin: '0 0' },
      { x: 0, y: 0, scaleX: 1, scaleY: 1, duration: dur(.42, .22), ease: SPRING, clearProps: 'transform,transformOrigin',
        onComplete: () => { lift(n, false); resized(win.id); }, onInterrupt: () => lift(n, false) });
  };
  useEffect(() => { const f = () => { if (!drag.current) shade(); }; addEventListener('os:light', f); return () => removeEventListener('os:light', f); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => { if (!win.min) place(win.max ? deskRect() : win.rect); }, [win.max, win.focusMode, phone]); // eslint-disable-line react-hooks/exhaustive-deps

  // muncul: membesar dari ikon dock dengan pegas, isi jendela menyusul (teks tidak kelihatan kabur saat diskalakan)
  useLayoutEffect(() => {
    const n = el.current; if (!n) return;
    const r0 = win.max ? deskRect() : win.rect;
    place(r0);
    if (!moving()) return;
    if (phone) { gsap.from(n, { yPercent: 100, duration: .4, ease: 'power3.out', clearProps: 'transform' }); return; }
    const di = dockIcon(win.app)?.getBoundingClientRect(), top = n.parentElement?.getBoundingClientRect().top ?? MENUBAR_H;
    if (di && !win.focusMode) {
      pause(dur(.46, .24)); lift(n, true);
      gsap.fromTo(n, { x: di.left + di.width / 2 - (r0.x + r0.w / 2), y: di.top + di.height / 2 - (top + r0.y + r0.h / 2), scale: Math.max(.08, di.width / r0.w), opacity: 0 },
        { x: 0, y: 0, scale: 1, opacity: 1, duration: dur(.46, .24), ease: SPRING, clearProps: 'transform,opacity', onComplete: () => { lift(n, false); resized(win.id); }, onInterrupt: () => lift(n, false) });
      const body = n.querySelector('.os-win-body');
      if (body) gsap.fromTo(body, { opacity: 0 }, { opacity: 1, duration: dur(.22, .12), delay: dur(.13, .05), clearProps: 'opacity' });
    }
    sound('open');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- kecilkan & pulihkan: "tersedot" ala genie, dua tahap ---------- */
  const genie = (n: HTMLElement, di: DOMRect) => {
    const r = cur.current || win.rect, top = n.parentElement?.getBoundingClientRect().top ?? MENUBAR_H;
    const tx = di.left + di.width / 2 - (r.x + r.w / 2), ty = di.top + di.height / 2 - (top + r.y + r.h / 2);
    const sk = Math.max(-12, Math.min(12, tx / r.w * 9));
    return { mid: { x: tx * .3, y: ty * .14, scaleX: .58, scaleY: .86, skewX: sk }, end: { x: tx, y: ty, scaleX: di.width / r.w, scaleY: di.height / r.h, skewX: 0 } };
  };
  const wasMin = useRef(win.min);
  useLayoutEffect(() => {
    const n = el.current;
    if (wasMin.current && !win.min && n && moving() && !phone) {
      const di = dockIcon(win.app)?.getBoundingClientRect();
      if (di) {
        const g = genie(n, di), D = dur(.5, .22);
        pause(D * 1.05); lift(n, true);
        gsap.timeline({ onComplete: () => { gsap.set(n, { clearProps: 'transform,opacity' }); lift(n, false); resized(win.id); } })
          .fromTo(n, { ...g.end, opacity: .15, transformOrigin: '50% 50%' }, { ...g.mid, opacity: .92, duration: D * .45, ease: 'power2.out' })
          .to(n, { x: 0, y: 0, scaleX: 1, scaleY: 1, skewX: 0, opacity: 1, duration: D * .6, ease: SPRING });
      }
    }
    wasMin.current = win.min;
  }, [win.min]); // eslint-disable-line react-hooks/exhaustive-deps

  const minimize = () => {
    const n = el.current, di = dockIcon(win.app)?.getBoundingClientRect();
    sound('min');
    const done = () => { st().minimize(win.id); if (win.float) restack(win.corner); };
    if (!n || !di || !moving() || phone) { done(); return; }
    const g = genie(n, di), D = dur(.5, .22);
    pause(D); lift(n, true);
    gsap.timeline({ onComplete: () => { done(); gsap.set(n, { clearProps: 'transform,opacity' }); lift(n, false); } })
      .to(n, { ...g.mid, opacity: .92, transformOrigin: '50% 50%', duration: D * .42, ease: 'power2.in' })
      .to(n, { ...g.end, opacity: .15, duration: D * .58, ease: 'power3.in' });
  };
  const close = () => {
    const n = el.current, corner = me()?.float ? me()?.corner : undefined;
    const done = () => { st().close(win.id); restack(corner); };
    sound('pop');
    if (n && moving()) { pause(dur(.17, .12)); lift(n, true); gsap.to(n, { scale: .96, opacity: 0, transformOrigin: '50% 50%', duration: dur(.17, .12), ease: 'power2.in', onComplete: done }); }
    else done();
  };
  const toggleMax = () => {
    const w0 = me(); if (!w0) return;
    if (w0.float) { toggleFloat(); return; }
    const to = !w0.max ? deskRect() : (w0.prev || w0.rect);
    place(to, true);
    st().setMax(win.id, !w0.max, deskRect());
    if (!moving()) resized(win.id);
  };
  const toggleFocus = () => { if (me()?.float) toggleFloat(); st().setFocusMode(win.id, !win.focusMode); resized(win.id); };
  const half = (side: 'left' | 'right') => {
    const W = deskRect(), hw = Math.round(W.w / 2), r = { x: side === 'left' ? 0 : hw, y: 0, w: side === 'left' ? hw : W.w - hw, h: W.h };
    if (win.focusMode) st().setFocusMode(win.id, false);
    if (me()?.float) st().patch(win.id, { float: false, corner: undefined, floatPrev: null });
    place(r, true);
    if (win.max) st().setMax(win.id, false);
    st().setRect(win.id, r); st().focus(win.id);
    sound('snap');
  };
  const toggleFloat = () => {
    if (phone) return;
    const w0 = me(); if (!w0) return;
    if (!w0.float) {
      if (w0.focusMode) st().setFocusMode(win.id, false);
      const prev = w0.max ? (w0.prev || w0.rect) : (cur.current || w0.rect);
      const W = deskRect(), base = FLOAT_SIZE[app.id] || { w: 380, h: 320 };
      const size = { w: Math.min(Math.max(base.w, app.minW || 0), W.w - 24), h: Math.min(Math.max(base.h, app.minH || 0), W.h - 24) };
      const from = cur.current || w0.rect, c = cornerAt(from.x + from.w / 2, from.y + from.h / 2), fseq = Date.now();
      const to = { ...size, ...floatSlot(c, win.id, size, fseq) };
      place(to, true);
      if (w0.max) st().setMax(win.id, false);
      st().patch(win.id, { float: true, corner: c, fseq, floatPrev: prev });
      st().setRect(win.id, to, false);
    } else {
      const to = w0.floatPrev || w0.rect, old = w0.corner;
      place(to, true);
      st().patch(win.id, { float: false, corner: undefined, floatPrev: null });
      st().setRect(win.id, to);
      restack(old);
    }
    st().focus(win.id);
    sound('snap');
  };
  // jendela layang lain di pojok yang sama pindah/tutup → antre ulang
  useEffect(() => {
    const f = (e: Event) => {
      const w0 = me(); if (!w0?.float || w0.min || w0.corner !== (e as CustomEvent<string>).detail) return;
      const p = floatSlot(w0.corner, w0.id, w0.rect, w0.fseq || 0);
      if (Math.abs(p.x - w0.rect.x) > 1 || Math.abs(p.y - w0.rect.y) > 1) { const to = { ...w0.rect, ...p }; place(to, true); st().setRect(win.id, to, false); }
    };
    addEventListener('os:restack', f); return () => removeEventListener('os:restack', f);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Orvi dari dock bisa dijatuhkan ke jendela ini
  useEffect(() => {
    const n = el.current;
    if (!n) return;
    return target(n, ['orvi'], () => emit('orvi:visit', { win: n, app: app.id }), { hint: () => `Minta bantuan Orvi di ${n.querySelector('.os-win-title b')?.textContent || app.title}` });
  }, [app.id, app.title]);
  // menu klik kanan di title bar (os/ContextMenu.tsx) memakai animasi yang sama dengan tombolnya
  const ctl = useRef({ minimize, close, toggleMax, toggleFocus, half, toggleFloat });
  ctl.current = { minimize, close, toggleMax, toggleFocus, half, toggleFloat };
  useEffect(() => {
    const f = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; do: string }>).detail, c = ctl.current;
      if (d.id !== win.id) return;
      if (d.do === 'max') c.toggleMax(); else if (d.do === 'min') c.minimize(); else if (d.do === 'close') c.close();
      else if (d.do === 'focus') c.toggleFocus(); else if (d.do === 'float') c.toggleFloat(); else if (d.do === 'left' || d.do === 'right') c.half(d.do);
    };
    addEventListener('os:winctl', f); return () => removeEventListener('os:winctl', f);
  }, [win.id]);

  /* ---------- seret: transform di rAF, magnet, snap, lemparan ---------- */
  type Drag = { sx: number; sy: number; px: number; py: number; ox: number; oy: number; x: number; y: number; moved: boolean; raf: number;
    samples: [number, number, number][]; zone: ReturnType<typeof snapZone>; edges: { xs: number[]; ys: number[] } };
  const drag = useRef<Drag | null>(null);
  const frame = () => {
    const d = drag.current, n = el.current, r = cur.current; if (!d || !n || !r) return;
    d.raf = 0; touchHold();
    let x = d.ox + d.px - d.sx, y = Math.max(0, d.oy + d.py - d.sy);
    if (!me()?.float && moving()) { x = magnet(x, r.w, d.edges.xs); y = Math.max(0, magnet(y, r.h, d.edges.ys)); }
    d.x = x; d.y = y;
    n.style.transform = `translate3d(${x - r.x}px, ${y - r.y}px, 0)`;
    if (!me()?.float) { d.zone = snapZone(d.px, d.py - MENUBAR_H); showGhost(d.zone?.r || null); }
  };
  const onBarDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as Element).closest('button,input,select,a,.no-drag') || phone || win.focusMode || document.documentElement.classList.contains('os-expose')) return;
    const n = el.current; if (!n) return;
    if (gsap.isTweening(n)) {
      // dipegang lagi saat masih meluncur: posisi saat ini jadi titik awal, bukan loncat balik
      const tx = Number(gsap.getProperty(n, 'x')) || 0, ty = Number(gsap.getProperty(n, 'y')) || 0, sx = Number(gsap.getProperty(n, 'scaleX'));
      gsap.killTweensOf(n);
      if (sx === 1 && (tx || ty) && cur.current) { const r = { ...cur.current, x: cur.current.x + tx, y: cur.current.y + ty }; apply(r); st().setRect(win.id, r, false); }
      gsap.set(n, { clearProps: 'transform' });
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const base = cur.current || win.rect;
    drag.current = { sx: e.clientX, sy: e.clientY, px: e.clientX, py: e.clientY, ox: base.x, oy: base.y, x: base.x, y: base.y, moved: false, raf: 0, samples: [], zone: null, edges: { xs: [], ys: [] } };
  };
  const onBarMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const evs = (e.nativeEvent.getCoalescedEvents?.() || []) as PointerEvent[];
    for (const c of evs.length ? evs : [e.nativeEvent]) d.samples.push([c.clientX, c.clientY, c.timeStamp]);
    if (d.samples.length > 12) d.samples.splice(0, d.samples.length - 12);
    d.px = e.clientX; d.py = e.clientY;
    if (!d.moved && Math.hypot(d.px - d.sx, d.py - d.sy) < 4) return;
    if (!d.moved) {
      d.moved = true; el.current?.classList.add('is-dragging'); holdOn();
      const w0 = me();
      if (w0?.max) { // lepas dari maksimal: kembali ke ukuran lama di bawah kursor
        const prev = w0.prev || w0.rect, c = cur.current || deskRect(), frac = (e.clientX - c.x) / (c.w || 1);
        const r = { ...prev, x: e.clientX - prev.w * frac, y: 0 };
        apply(r); st().setMax(win.id, false); st().setRect(win.id, r, false);
        d.ox = r.x; d.oy = r.y; d.sx = e.clientX; d.sy = e.clientY; d.x = r.x; d.y = r.y;
      }
      d.edges = edgesFor(win.id);
    }
    if (!d.raf) d.raf = requestAnimationFrame(frame);
  };
  const onBarUp = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null;
    if (!d) return;
    if (d.raf) cancelAnimationFrame(d.raf);
    if (!d.moved) return;
    const n = el.current!, r0 = cur.current || win.rect, r = { ...r0, x: d.x, y: d.y };
    n.classList.remove('is-dragging'); showGhost(null);
    n.style.transform = ''; apply(r); // disimpan ke left/top di frame yang sama: tidak meloncat
    const now = e.nativeEvent.timeStamp || performance.now(), recent = d.samples.filter(p => now - p[2] < 90);
    let vx = 0, vy = 0;
    if (recent.length > 1) { const a = recent[0], b = recent[recent.length - 1], dt = Math.max(8, b[2] - a[2]); vx = (b[0] - a[0]) / dt; vy = (b[1] - a[1]) / dt; }
    const w0 = me();
    if (w0?.float) { // jendela layang meluncur ke pojok terdekat (ke arah lemparan)
      const c = cornerAt(r.x + r.w / 2 + vx * 200, r.y + r.h / 2 + vy * 200), old = w0.corner, fseq = Date.now();
      const to = { ...r, ...floatSlot(c, win.id, r, fseq) };
      place(to, true); st().patch(win.id, { corner: c, fseq }); st().setRect(win.id, to, false);
      if (old && old !== c) restack(old);
      sound('snap'); holdOff(); return;
    }
    if (d.zone) {
      if (d.zone.kind === 'max') { st().setRect(win.id, r); place(deskRect(), true); st().setMax(win.id, true, deskRect()); }
      else { place(d.zone.r, true); st().setRect(win.id, d.zone.r); }
      sound('snap'); holdOff(); return;
    }
    st().setRect(win.id, r);
    if (Math.hypot(vx, vy) > .35 && motion() === 'full') {
      // lemparan: meluncur lalu melambat, tidak keluar dari layar
      const W = deskRect(), bx: [number, number] = [-r.w + 120 - r.x, W.w - 120 - r.x], by: [number, number] = [-r.y, W.h - 60 - r.y];
      pause(.9);
      gsap.to(n, { inertia: { x: { velocity: vx * 650, min: bx[0], max: bx[1] }, y: { velocity: vy * 650, min: by[0], max: by[1] }, duration: { min: .25, max: .9 } },
        onComplete: () => { const tx = Number(gsap.getProperty(n, 'x')) || 0, ty = Number(gsap.getProperty(n, 'y')) || 0; gsap.set(n, { clearProps: 'transform' });
          const fr = { ...r, x: r.x + tx, y: r.y + ty }; apply(fr); shade(fr); st().setRect(win.id, fr); } } as gsap.TweenVars);
    } else shade(r);
    holdOff();
  };
  const showGhost = (r: Rect | null) => {
    if (!r) { ghost.current?.remove(); ghost.current = null; return; }
    if (!ghost.current) { ghost.current = document.createElement('div'); ghost.current.className = 'os-snap-ghost'; document.querySelector('.os-wins')?.appendChild(ghost.current); }
    const k = `${r.x},${r.y},${r.w},${r.h}`;
    if (ghost.current.dataset.k !== k) { ghost.current.dataset.k = k; Object.assign(ghost.current.style, { left: r.x + 6 + 'px', top: r.y + 6 + 'px', width: r.w - 12 + 'px', height: r.h - 12 + 'px' }); }
  };

  // ---- ubah ukuran dari 8 sisi (lewat rAF)
  const onResizeDown = (dir: string) => (e: React.PointerEvent) => {
    if (win.max || phone || win.float) return;
    e.preventDefault();
    const t = e.currentTarget as HTMLElement; t.setPointerCapture(e.pointerId);
    const s = { x: e.clientX, y: e.clientY, r: { ...(cur.current || win.rect) } };
    const mw = app.minW || 340, mh = app.minH || 240;
    let last = s.r, raf = 0, rt = 0;
    holdOn();
    t.onpointermove = ev => {
      const dx = ev.clientX - s.x, dy = ev.clientY - s.y, r = { ...s.r };
      if (dir.includes('e')) r.w = Math.max(mw, s.r.w + dx);
      if (dir.includes('s')) r.h = Math.max(mh, s.r.h + dy);
      if (dir.includes('w')) { r.w = Math.max(mw, s.r.w - dx); r.x = s.r.x + (s.r.w - r.w); }
      if (dir.includes('n')) { r.h = Math.max(mh, s.r.h - dy); r.y = Math.max(0, s.r.y + (s.r.h - r.h)); }
      last = r; touchHold();
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; apply(last); clearTimeout(rt); rt = window.setTimeout(() => resized(win.id), 90); });
    };
    t.onpointerup = t.onpointercancel = () => {
      t.onpointermove = t.onpointerup = t.onpointercancel = null; if (raf) cancelAnimationFrame(raf);
      apply(last); shade(last); st().setRect(win.id, last); holdOff(); resized(win.id);
    };
  };

  const title = meta?.title || app.title;
  const cls = ['os-win', active && 'is-active', win.min && 'is-min', win.max && 'is-max', win.focusMode && !phone && 'is-focus', win.float && !phone && 'is-float', occluded && 'is-occluded', `app-${app.id}`].filter(Boolean).join(' ');
  return (
    <section ref={el} className={cls} role="dialog" aria-label={title} aria-hidden={win.min || undefined} data-win={win.id}
      style={{ zIndex: win.focusMode ? 9000 : win.float ? 4000 + win.z : win.z, ['--app' as string]: app.color }}
      onPointerDownCapture={() => { if (!active && !document.documentElement.classList.contains('os-expose')) st().focus(win.id); }}>
      <div className="os-win-bar" onPointerDown={onBarDown} onPointerMove={onBarMove} onPointerUp={onBarUp} onPointerCancel={onBarUp}
        onDoubleClick={e => { if (!(e.target as Element).closest('button')) toggleMax(); }}>
        <div className="os-win-lights no-drag">
          <button className="os-light os-light-close os-close" title="Tutup" aria-label="Tutup jendela" onClick={close}><Icon name="x" /></button>
          <button className="os-light os-light-min" title="Kecilkan ke dock" aria-label="Kecilkan" onClick={minimize}><Icon name="minus" /></button>
          <button className="os-light os-light-max hide-sm" title={win.max ? 'Kembalikan ukuran' : 'Perbesar'} aria-label="Perbesar" onClick={toggleMax}><Icon name={win.max ? 'minimize-2' : 'maximize-2'} /></button>
        </div>
        <span className="os-win-glyph"><Icon name={app.icon} /></span>
        <div className="os-win-title"><b>{title}</b>{meta?.sub && <span>{meta.sub}</span>}</div>
        <div className="os-win-tools no-drag">{meta?.tools}</div>
        <div className="os-win-ctl">
          <button className="hide-sm" title={win.float ? 'Balik ke jendela biasa' : 'Mode layang: kecil dan selalu di atas'} aria-label={win.float ? 'Balik ke jendela biasa' : 'Mode layang'} onClick={toggleFloat}>
            <Icon name={win.float ? 'app-window' : 'picture-in-picture-2'} /></button>
          <button className="os-focusbtn hide-sm" title="Mode Fokus" aria-label="Mode Fokus" onClick={toggleFocus}><Icon name={win.focusMode ? 'minimize' : 'scan'} /></button>
        </div>
      </div>
      <div className="os-win-body">
        <Ctx.Provider value={{ id: win.id, app: app.id, active, visible: !win.min }}>
          <Suspense fallback={<div className="os-win-loading"><Icon name="loader-circle" className="spin" /></div>}>{children}</Suspense>
        </Ctx.Provider>
      </div>
      {['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map(d => <div key={d} className="os-win-rs" data-d={d} onPointerDown={onResizeDown(d)} />)}
    </section>
  );
}
