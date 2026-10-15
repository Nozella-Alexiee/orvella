/* Wallpaper hidup di <canvas>: langit + gumpalan aurora yang bernapas dan mengikuti
   kursor, dengan satu sumber cahaya (Orvi = matahari saat Siang, Pip = bulan saat Malam).
   Posisi cahaya dipakai jendela dan widget untuk arah bayangannya (event 'os:light'). */
import { useEffect, useRef } from 'react';
import { motion } from '../fx';
import { isDeskHidden, osBusy } from './motion';

export type WallId = 'fajar' | 'siang' | 'senja' | 'nebula' | 'kode' | 'piksel';
type Pal = { name: string; sky: [string, string]; blobs: string[]; light: 'sun' | 'moon'; t: number; dark: boolean; xp?: number };
export const WALLS: Record<WallId, Pal> = {
  fajar: { name: 'Fajar', sky: ['#FFD6BE', '#CFDBFF'], blobs: ['#FFB224', '#FF8FA3', '#8F7BFF', '#7FD8FF'], light: 'sun', t: .2, dark: false },
  siang: { name: 'Siang', sky: ['#BFD7FF', '#FFE6C9'], blobs: ['#FFC24B', '#7C63FF', '#4FE0B5', '#7FB7FF'], light: 'sun', t: .5, dark: false },
  senja: { name: 'Senja', sky: ['#FFB38F', '#8C6BFF'], blobs: ['#FF7A59', '#FFC247', '#D65CFF', '#5B8CFF'], light: 'sun', t: .82, dark: false },
  nebula: { name: 'Nebula', sky: ['#0B0A22', '#221757'], blobs: ['#7A5CFF', '#FF5FA8', '#2ED3A1', '#3B6BFF'], light: 'moon', t: .7, dark: true },
  kode: { name: 'Hujan Kode', sky: ['#07131B', '#0F2A33'], blobs: ['#10B98A', '#3D8BFF', '#10B98A', '#34D8A6'], light: 'moon', t: .3, dark: true, xp: 1500 },
  piksel: { name: 'Kebun Piksel', sky: ['#CFF3D8', '#FFF1C2'], blobs: ['#7BD88F', '#FFB224', '#5BC0EB', '#FF8FA3'], light: 'sun', t: .35, dark: false, xp: 3000 },
};
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
export const savedWall = () => read('orvella-wall') as WallId | null;
export function setWall(id: WallId) { try { localStorage.setItem('orvella-wall', id); } catch { /* */ } dispatchEvent(new CustomEvent('os:wall', { detail: id })); }

const isInk = () => document.documentElement.dataset.theme === 'ink';
function pick(xp: number): WallId {
  const c = savedWall();
  if (c && WALLS[c] && (WALLS[c].xp || 0) <= xp && WALLS[c].dark === isInk()) return c;
  if (isInk()) return c === 'kode' && (WALLS.kode.xp || 0) <= xp ? 'kode' : 'nebula';
  const hr = new Date().getHours();
  return hr < 9 ? 'fajar' : hr < 16 ? 'siang' : hr < 19 ? 'senja' : 'siang';
}

export function Wallpaper({ xp = 0 }: { xp?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!, ctx = cv.getContext('2d')!;
    let w = 0, h = 0, raf = 0, px = .5, py = .5, sx = .5, sy = .5, last = 0, cur = pick(xp);
    const t0 = performance.now();
    const stars = Array.from({ length: 120 }, () => [Math.random(), Math.random() * .75, Math.random() * 1.4 + .3, Math.random() * 6]);
    const drops = Array.from({ length: 70 }, () => [Math.random(), Math.random(), .3 + Math.random() * .7, '01{}<>=;()'[Math.floor(Math.random() * 10)]] as const);
    const size = () => { const dpr = Math.min(devicePixelRatio || 1, 1.5); w = innerWidth; h = innerHeight; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    const lightPos = (p: Pal) => (w < 760 ? { x: w * (.62 + p.t * .26), y: 30 }
      : { x: (.12 + p.t * .76) * w + (sx - .5) * 30, y: (.1 + Math.pow(Math.abs(p.t - .5) * 2, 2) * .28) * h + (sy - .5) * 20 });
    const draw = (now: number) => {
      const p = WALLS[cur], s = (now - t0) / 1000, live = motion() === 'full';
      sx += (px - sx) * .05; sy += (py - sy) * .05;
      const g = ctx.createLinearGradient(0, 0, w * .3, h); g.addColorStop(0, p.sky[0]); g.addColorStop(1, p.sky[1]);
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      if (p.dark) {
        for (const [x, y, r, ph] of stars) { ctx.globalAlpha = .35 + .35 * Math.sin(s * 1.3 + ph); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x * w - (sx - .5) * 12, y * h - (sy - .5) * 8, r, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = p.dark ? 'screen' : 'soft-light';
      p.blobs.forEach((c, i) => {
        const k = live ? s * (.05 + i * .013) : i;
        const bx = (.15 + .7 * ((Math.sin(k + i * 2.1) + 1) / 2)) * w - (sx - .5) * (40 + i * 18);
        const by = (.25 + .6 * ((Math.cos(k * .8 + i * 1.3) + 1) / 2)) * h - (sy - .5) * (30 + i * 14);
        const r = Math.max(w, h) * (.32 + .06 * Math.sin(k * 1.7 + i));
        const rg = ctx.createRadialGradient(bx, by, 0, bx, by, r); rg.addColorStop(0, c + (p.dark ? '88' : 'cc')); rg.addColorStop(1, c + '00');
        ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
      });
      ctx.globalCompositeOperation = 'source-over';
      if (cur === 'kode') {
        ctx.font = '600 14px "JetBrains Mono Variable", monospace'; ctx.fillStyle = '#34D8A6';
        for (const d of drops) { ctx.globalAlpha = .25 + d[2] * .35; ctx.fillText(d[3], d[0] * w, ((d[1] + (live ? s * d[2] * .06 : 0)) % 1) * h); }
        ctx.globalAlpha = 1;
      }
      const L = lightPos(p);
      (window as unknown as { __osLight: { x: number; y: number } }).__osLight = L;
      const lg = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, Math.min(w, h) * (p.light === 'sun' ? .42 : .3));
      if (p.light === 'sun') { lg.addColorStop(0, 'rgba(255,236,170,.95)'); lg.addColorStop(.12, 'rgba(255,200,90,.55)'); lg.addColorStop(1, 'rgba(255,190,80,0)'); }
      else { lg.addColorStop(0, 'rgba(236,230,255,.9)'); lg.addColorStop(.08, 'rgba(200,190,255,.35)'); lg.addColorStop(1, 'rgba(160,140,255,0)'); }
      ctx.fillStyle = lg; ctx.fillRect(0, 0, w, h);
      ctx.beginPath(); ctx.arc(L.x, L.y, p.light === 'sun' ? 26 : 18, 0, Math.PI * 2); ctx.fillStyle = p.light === 'sun' ? '#FFE9A8' : '#F1EDFF'; ctx.fill();
      if (p.light === 'moon') { ctx.fillStyle = 'rgba(169,155,234,.6)'; ctx.beginPath(); ctx.arc(L.x - 6, L.y - 5, 4, 0, 7); ctx.arc(L.x + 7, L.y - 6, 2.4, 0, 7); ctx.fill(); }
      if (now - last > 120) { last = now; dispatchEvent(new CustomEvent('os:light', { detail: L })); }
    };
    let lastInput = performance.now();
    const loop = (now: number) => {
      raf = 0;
      // jendela lagi bergerak, atau desktop tertutup jendela maksimal: wallpaper diam, kaca blur tidak dihitung ulang tiap frame
      if (osBusy() || isDeskHidden()) { raf = window.setTimeout(() => { raf = 0; start(); }, 250); return; }
      draw(now);
      if (motion() === 'off' || document.hidden) return;
      // gumpalannya gerak pelan: 30 fps cukup; kalau pengguna diam > 20 detik, 8 fps
      const idle = performance.now() - lastInput > 20000;
      raf = requestAnimationFrame(t => { window.setTimeout(() => loop(t), motion() === 'full' ? (idle ? 125 : 33) : 120); });
    };
    const start = () => { if (!raf) raf = requestAnimationFrame(loop); };
    const touch = () => { lastInput = performance.now(); };
    const onMove = (e: PointerEvent) => { px = e.clientX / w; py = e.clientY / h; touch(); start(); };
    const onResize = () => { size(); draw(performance.now()); };
    const repick = () => { cur = pick(xp); draw(performance.now()); start(); };
    size(); draw(performance.now()); start();
    addEventListener('resize', onResize); addEventListener('pointermove', onMove, { passive: true });
    addEventListener('keydown', touch, { passive: true }); addEventListener('wheel', touch, { passive: true });
    document.addEventListener('visibilitychange', start); addEventListener('orv:motion', start); addEventListener('os:wall', repick);
    const mo = new MutationObserver(repick); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      cancelAnimationFrame(raf); clearTimeout(raf); mo.disconnect();
      removeEventListener('keydown', touch); removeEventListener('wheel', touch);
      removeEventListener('resize', onResize); removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', start); removeEventListener('orv:motion', start); removeEventListener('os:wall', repick);
    };
  }, [xp]);
  return <><canvas ref={ref} className="os-wall" aria-hidden="true" /><div className="os-wall-grain" aria-hidden="true" /></>;
}

/** Pratinjau kecil wallpaper untuk Pengaturan. */
export function drawThumb(c: HTMLCanvasElement, id: WallId) {
  const p = WALLS[id], x = c.getContext('2d')!, cw = c.width, ch = c.height;
  const g = x.createLinearGradient(0, 0, cw * .3, ch); g.addColorStop(0, p.sky[0]); g.addColorStop(1, p.sky[1]);
  x.fillStyle = g; x.fillRect(0, 0, cw, ch);
  x.globalCompositeOperation = p.dark ? 'screen' : 'soft-light';
  p.blobs.forEach((col, i) => { const cx = cw * (.2 + i * .2), cy = ch * (.3 + (i % 2) * .4), rg = x.createRadialGradient(cx, cy, 0, cx, cy, cw * .5); rg.addColorStop(0, col + 'cc'); rg.addColorStop(1, col + '00'); x.fillStyle = rg; x.fillRect(0, 0, cw, ch); });
  x.globalCompositeOperation = 'source-over';
  x.beginPath(); x.arc(cw * (.12 + p.t * .76), ch * .22, 7, 0, 7); x.fillStyle = p.light === 'sun' ? '#FFE9A8' : '#F1EDFF'; x.fill();
}
