// @ts-nocheck
/* Kit gerak landing (port dari design/mockups/js/fx.js). Plugin GSAP sudah didaftarkan di ../fx. */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import confetti from 'canvas-confetti';
import { createIcons, ArrowRight, Blocks, Box, Building2, Check, ChevronRight, CodeXml, Flag, FlaskConical, GraduationCap, Hand, History,
  ListChecks, Moon, Sun, MousePointerClick, Orbit, Play, CirclePlay, Pointer, Presentation, RotateCcw, School, Send, Sparkles, SquareTerminal,
  Text, Undo2, WandSparkles, X, Plus, Lock } from 'lucide';
import { sound } from '../fx';

const ICONS = { ArrowRight, Blocks, Box, Building2, Check, ChevronRight, CodeXml, Flag, FlaskConical, GraduationCap, Hand, History, ListChecks,
  Moon, Sun, MousePointerClick, Orbit, Play, PlayCircle: CirclePlay, CirclePlay, Pointer, Presentation, RotateCcw, School, Send, Sparkles,
  TerminalSquare: SquareTerminal, SquareTerminal, Text, Undo2, WandSparkles, X, Plus, Lock };
/* =====================================================================
 ORVELLA · fx.js — kit gerak "hidup" di atas GSAP
 Semua efek membaca FX.level(): 'full' | 'calm' | 'off'
   full : semua efek (pegas, magnet, tilt, partikel, medan titik)
   calm : hanya perubahan warna/opasitas & gerak kecil (< 8px), tanpa partikel
   off  : tidak ada gerak; keadaan tetap terbaca lewat warna & teks
 Auto-wire: [data-magnetic] [data-tilt] [data-split] [data-reveal] [data-ticker] .btn (ripple)
 ===================================================================== */
const html = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const fine = matchMedia('(hover: hover) and (pointer: fine)');
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* diabaikan */ } },
};
const cssVar = (n, el = html) => getComputedStyle(el).getPropertyValue(n).trim();
const level = () => { const m = html.dataset.motion; return m === 'full' || m === 'calm' || m === 'off' ? m : (reduce.matches ? 'calm' : 'full'); };

function setLevel(l) {
  if (l === 'auto') delete html.dataset.motion; else html.dataset.motion = l;
  store.set('orv-motion', l === 'auto' ? null : l);
  dispatchEvent(new CustomEvent('orv:motion', { detail: level() }));
}
function setTheme(t) {
  if (t === 'system') delete html.dataset.theme; else html.dataset.theme = t;
  store.set('orv-theme', t === 'system' ? null : t);
  dispatchEvent(new CustomEvent('orv:theme', { detail: t }));
}
const theme = () => html.dataset.theme || 'system';
const isDark = () => html.dataset.theme === 'ink';

/* ---------------- interaksi pointer ---------------- */
function magnetic(el, strength = .32) {
  if (el.__mag) return; el.__mag = 1;
  const p = { x: 0, y: 0 };
  const go = (x, y, d, e) => gsap.to(p, { x, y, duration: d, ease: e, overwrite: true, onUpdate: () => (el.style.translate = `${p.x.toFixed(2)}px ${p.y.toFixed(2)}px`) });
  el.addEventListener('pointermove', e => {
    if (level() !== 'full' || !fine.matches) return;
    const r = el.getBoundingClientRect();
    go((e.clientX - r.left - r.width / 2) * strength, (e.clientY - r.top - r.height / 2) * strength, .35, 'power3.out');
  });
  el.addEventListener('pointerleave', () => go(0, 0, .8, 'elastic.out(1, .35)'));
}
function tilt(el, max = 7) {
  if (el.__tilt) return; el.__tilt = 1;
  el.classList.add('has-sheen');
  el.addEventListener('pointermove', e => {
    if (level() !== 'full' || !fine.matches) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    gsap.to(el, { rotationY: (px - .5) * max * 2, rotationX: (.5 - py) * max * 2, transformPerspective: 900, duration: .5, overwrite: 'auto' });
    el.style.setProperty('--gx', (px * 100).toFixed(1) + '%'); el.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
  });
  el.addEventListener('pointerleave', () => gsap.to(el, { rotationX: 0, rotationY: 0, duration: 1, ease: 'elastic.out(1, .45)' }));
}
function ripple(el, e) {
  if (level() === 'off') return;
  const r = el.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2.2;
  const s = document.createElement('span'); s.className = 'ripple';
  s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
  el.appendChild(s);
  gsap.to(s, { scale: 1, opacity: 0, duration: .6, ease: 'power2.out', onComplete: () => s.remove() });
}

/* ---------------- umpan balik ---------------- */
function pop(el, amt = 1.08) {
  if (level() === 'off' || !el) return;
  gsap.fromTo(el, { scale: 1 }, { scale: level() === 'full' ? amt : 1.03, duration: .14, yoyo: true, repeat: 1, ease: 'power2.out', clearProps: 'scale' });
}
function shake(el) {
  if (!el) return;
  if (level() === 'off') { el.classList.add('is-shook'); setTimeout(() => el.classList.remove('is-shook'), 600); return; }
  const a = level() === 'full' ? 9 : 3;
  gsap.fromTo(el, { x: 0 }, { keyframes: { x: [-a, a, -a * .7, a * .7, -a * .35, 0] }, duration: .46, ease: 'none', clearProps: 'x' });
}
function ring(x, y, color) {
  if (level() === 'off' || !gsap) return;
  const d = document.createElement('div'); d.className = 'fx-ring';
  d.style.cssText = `left:${x}px;top:${y}px;border-color:${color || cssVar('--marigold')}`;
  document.body.appendChild(d);
  gsap.fromTo(d, { scale: .2, opacity: .9 }, { scale: 2.6, opacity: 0, duration: .55, ease: 'power2.out', onComplete: () => d.remove() });
}

/* partikel di satu kanvas overlay */
let pcv, pctx, parts = [], praf = 0;
function burst(x, y, o = {}) {
  if (level() !== 'full') return;
  if (!pcv) {
    pcv = document.createElement('canvas'); pcv.className = 'fx-particles'; document.body.appendChild(pcv);
    pctx = pcv.getContext('2d');
  }
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (pcv.width !== innerWidth * dpr) { pcv.width = innerWidth * dpr; pcv.height = innerHeight * dpr; pctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  const cols = o.colors || [cssVar('--marigold'), cssVar('--perkuat-fill'), cssVar('--pahami-fill'), cssVar('--kuis-fill'), cssVar('--uji-fill')];
  const n = o.count || 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * .5, v = (o.speed || 5) * (.6 + Math.random() * .8);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, life: 1, rot: Math.random() * 6, vr: (Math.random() - .5) * .3,
      s: 3 + Math.random() * 4, c: cols[i % cols.length], shape: i % 3 });
  }
  if (!praf) praf = requestAnimationFrame(stepParts);
}
function stepParts() {
  pctx.clearRect(0, 0, innerWidth, innerHeight);
  parts = parts.filter(p => (p.life -= .022) > 0);
  for (const p of parts) {
    p.x += p.vx; p.y += p.vy; p.vy += .16; p.vx *= .97; p.rot += p.vr;
    pctx.globalAlpha = Math.min(1, p.life * 1.6); pctx.fillStyle = p.c;
    pctx.save(); pctx.translate(p.x, p.y); pctx.rotate(p.rot);
    if (p.shape === 0) { pctx.beginPath(); pctx.arc(0, 0, p.s * .6, 0, 7); pctx.fill(); }
    else if (p.shape === 1) pctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
    else { pctx.beginPath(); for (let k = 0; k < 8; k++) { const rr = k % 2 ? p.s * .3 : p.s; pctx.lineTo(Math.cos(k * Math.PI / 4) * rr, Math.sin(k * Math.PI / 4) * rr); } pctx.fill(); }
    pctx.restore();
  }
  pctx.globalAlpha = 1;
  praf = parts.length ? requestAnimationFrame(stepParts) : 0;
  if (!praf) pctx.clearRect(0, 0, innerWidth, innerHeight);
}
function burstAt(el, o) { const r = el.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, o); }

function confettiAt(el, color) {
  if (level() !== 'full') return;
  const r = el.getBoundingClientRect();
  confetti({ particleCount: 80, spread: 80, startVelocity: 34, scalar: .9, ticks: 180, zIndex: 9600, disableForReducedMotion: true,
    origin: { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height * .4) / innerHeight },
    colors: [cssVar('--marigold'), color || cssVar('--lilac'), cssVar('--perkuat-fill'), cssVar('--pahami-fill'), cssVar('--uji-fill')] });
}

const fmt = (n, dec = 0) => n.toLocaleString('id-ID', { minimumFractionDigits: dec, maximumFractionDigits: dec });
function ticker(el, to, o = {}) {
  const from = o.from ?? (parseFloat((el.textContent || '0').replace(/\./g, '').replace(',', '.')) || 0);
  const dec = o.decimals || 0, suf = o.suffix || '', pre = o.prefix || '';
  if (level() === 'off') { el.textContent = pre + fmt(to, dec) + suf; return; }
  const v = { n: from };
  gsap.to(v, { n: to, duration: o.dur || 1.1, ease: 'power2.out', onUpdate: () => (el.textContent = pre + fmt(v.n, dec) + suf) });
}
function xpFly(fromEl, toEl, text = '+10 XP', onArrive) {
  const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
  if (level() === 'off' || !gsap) { onArrive && onArrive(); return; }
  const c = document.createElement('div'); c.className = 'fx-xp'; c.textContent = text; document.body.appendChild(c);
  const from = [a.left + a.width / 2, a.top + a.height / 2], to = [b.left + b.width / 2, b.top + b.height / 2];
  gsap.set(c, { xPercent: -50, yPercent: -50, x: from[0], y: from[1] });
  const o = { p: 0 };
  gsap.timeline()
    .from(c, { scale: .3, duration: .3, ease: 'back.out(3)' })
    .to(o, { p: 1, duration: .8, ease: 'power2.in', onUpdate: () => {
      const p = o.p, q = 1 - p, cx = (from[0] + to[0]) / 2, cy = Math.min(from[1], to[1]) - 120;
      gsap.set(c, { x: q * q * from[0] + 2 * q * p * cx + p * p * to[0], y: q * q * from[1] + 2 * q * p * cy + p * p * to[1], scale: 1 - p * .5 });
    } }, '+=.15')
    .add(() => { c.remove(); pop(toEl, 1.15); onArrive && onArrive(); });
}

/* ---------------- teks & scroll ---------------- */
function split(el, o = {}) {
  if (!SplitText || level() !== 'full' || el.__split) return;
  el.__split = SplitText.create(el, { type: 'words', mask: 'words' });
  gsap.from(el.__split.words, { yPercent: 110, rotate: 4, duration: 1, ease: 'expo.out', stagger: o.stagger ?? .05, delay: o.delay ?? .1 });
}
function reveal(sel, o = {}) {
  if (!ScrollTrigger || level() !== 'full') return;
  ScrollTrigger.batch(sel, { start: 'top 90%', once: true,
    onEnter: b => gsap.from(b, { y: o.y ?? 42, rotate: o.rotate ?? .8, duration: .95, ease: 'expo.out', stagger: .08, clearProps: 'transform' }) });
}

/* ---------------- medan titik (latar hidup) ---------------- */
function field(cv, o = {}) {
  const gap = o.gap || 26, reach = o.reach || 150, base = o.r || 1.25;
  const ctx = cv.getContext('2d');
  let w = 0, h = 0, dots = [], vis = true, raf = 0, mx = -9999, my = -9999, c1 = '', c2 = '', lastMove = 0;
  const colors = () => { c1 = cssVar(o.color || '--line-strong'); c2 = cssVar(o.accent || '--marigold'); };
  function size() {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    w = r.width; h = r.height; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dots = []; for (let y = gap / 2; y < h; y += gap) for (let x = gap / 2; x < w; x += gap) dots.push({ x, y, ox: 0, oy: 0, f: 0 });
    colors(); draw(performance.now());
  }
  function draw(t) {
    const lv = level(), live = lv === 'full';
    ctx.clearRect(0, 0, w, h);
    const k = .14, ts = t / 1000;
    ctx.fillStyle = c1; ctx.beginPath();
    const hot = [];
    for (const d of dots) {
      let tx = 0, ty = 0, f = 0;
      if (live) {
        const dx = d.x - mx, dy = d.y - my, dist = Math.hypot(dx, dy);
        if (dist < reach) { f = 1 - dist / reach; f *= f; tx = dx / (dist || 1) * f * 16; ty = dy / (dist || 1) * f * 16; }
        ty += Math.sin(ts * .9 + d.x * .011 + d.y * .017) * 1.4;
      }
      d.ox += (tx - d.ox) * k; d.oy += (ty - d.oy) * k; d.f += (f - d.f) * k;
      const x = d.x + d.ox, y = d.y + d.oy;
      if (d.f > .04) hot.push([x, y, d.f]);
      else { ctx.moveTo(x + base, y); ctx.arc(x, y, base, 0, 6.2832); }
    }
    ctx.fill();
    ctx.fillStyle = c2;
    for (const [x, y, f] of hot) { ctx.globalAlpha = .35 + f * .65; ctx.beginPath(); ctx.arc(x, y, base + f * 2.6, 0, 6.2832); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  function loop(t) { raf = 0; if (!vis || document.hidden || level() !== 'full') return; draw(t); raf = requestAnimationFrame(loop); }
  const kick = () => { if (!raf && vis && level() === 'full') raf = requestAnimationFrame(loop); };
  const onMove = e => { const r = cv.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; lastMove = performance.now(); kick(); };
  const onResize = () => { clearTimeout(cv.__rs); cv.__rs = setTimeout(size, 150); };
  const onMotion = () => { draw(performance.now()); kick(); };
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('resize', onResize);
  addEventListener('orv:motion', onMotion);
  const mo = new MutationObserver(() => { colors(); draw(performance.now()); });
  mo.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
  const io = new IntersectionObserver(es => { vis = es[0].isIntersecting; kick(); }); io.observe(cv);
  document.addEventListener('visibilitychange', kick);
  size(); kick();
  return { redraw: size, destroy() { cancelAnimationFrame(raf); vis = false; io.disconnect(); mo.disconnect(); removeEventListener('pointermove', onMove); removeEventListener('resize', onResize); removeEventListener('orv:motion', onMotion); document.removeEventListener('visibilitychange', kick); } };
}

/* ---------------- tirai transisi ---------------- */
function curtain(color, x = innerWidth / 2, y = innerHeight / 2) {
  return new Promise(res => {
    if (level() === 'off' || !gsap) return res();
    const c = document.createElement('div'); c.className = 'fx-curtain'; c.style.background = color || cssVar('--marigold');
    document.body.appendChild(c);
    const R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    gsap.timeline({ onComplete: () => c.remove() })
      .fromTo(c, { clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(${R}px at ${x}px ${y}px)`, duration: .5, ease: 'power3.in' })
      .add(res)
      .to(c, { clipPath: `circle(0px at ${innerWidth / 2}px ${-40}px)`, duration: .6, ease: 'power3.inOut' }, '+=.08');
  });
}

/* ---------------- ikon ---------------- */
const icons = root => createIcons({ icons: ICONS, attrs: { 'stroke-width': 1.9 }, root: root || document });

/* ---------------- wiring otomatis ---------------- */
function wire(root = document) {
  root.querySelectorAll('[data-magnetic]').forEach(el => magnetic(el, parseFloat(el.dataset.magnetic) || .3));
  root.querySelectorAll('[data-tilt]').forEach(el => tilt(el, parseFloat(el.dataset.tilt) || 7));
  root.querySelectorAll('[data-split]').forEach((el, i) => split(el, { delay: .1 + i * .1 }));
  if (ScrollTrigger) root.querySelectorAll('[data-ticker]').forEach(el => {
    const to = parseFloat(el.dataset.ticker);
    if (level() === 'off') { el.textContent = fmt(to, +(el.dataset.dec || 0)) + (el.dataset.suffix || ''); return; }
    ScrollTrigger.create({ trigger: el, start: 'top 92%', once: true, onEnter: () => ticker(el, to, { from: 0, decimals: +(el.dataset.dec || 0), suffix: el.dataset.suffix || '' }) });
  });
}
export const FX = { level, setLevel, theme, setTheme, isDark, cssVar, store, magnetic, tilt, ripple, pop, shake, ring, burst, burstAt, confettiAt,
  ticker, xpFly, split, reveal, field, curtain, icons, wire, fmt, fine };

