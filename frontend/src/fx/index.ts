/* Orvella effect kit (lihat design/MOTION.md).
   Web Animations API + GSAP. Intensitas (html[data-motion]):
     full → semua efek · calm → tanpa partikel, konfeti, tilt, drift · off → hanya perubahan keadaan
   Setiap perubahan level memicu event window 'orv:motion' (dipakai Orvi). */
import confettiLib from 'canvas-confetti';
import { gsap } from 'gsap';
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { Flip } from 'gsap/Flip';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { Draggable } from 'gsap/Draggable';

gsap.registerPlugin(MorphSVGPlugin, DrawSVGPlugin, Flip, ScrollTrigger, SplitText, Draggable);
gsap.defaults({ ease: 'power3.out', duration: .5 });

export type MotionLevel = 'full' | 'calm' | 'off';

const root = () => document.documentElement;
const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

function readMotion(): MotionLevel {
  const v = (root().dataset.motion || store.get('orvella-motion')) as MotionLevel | null;
  if (v === 'full' || v === 'calm' || v === 'off') return v;
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'calm' : 'full';
}

let level: MotionLevel = readMotion();
root().dataset.motion = level;

export const motion = () => level;
export const isFull = () => level === 'full';
const on = () => level !== 'off';

export function setMotion(v: MotionLevel) {
  level = v;
  root().dataset.motion = v;
  store.set('orvella-motion', v);
  dispatchEvent(new CustomEvent('orv:motion', { detail: v }));
}

export const ease = {
  gentle: 'cubic-bezier(.34, 1.25, .64, 1)',
  bouncy: 'cubic-bezier(.34, 1.56, .64, 1)',
  snappy: 'cubic-bezier(.2, .9, .3, 1.08)',
  out: 'cubic-bezier(.2, .8, .2, 1)',
  exit: 'cubic-bezier(.4, 0, 1, 1)',
};

type El = Element | null | undefined;
const done = { finished: Promise.resolve() } as unknown as Animation;
const anim = (el: El, frames: Keyframe[], opts: KeyframeAnimationOptions): Animation =>
  on() && el && (el as HTMLElement).animate ? (el as HTMLElement).animate(frames, opts) : done;

export const pop = (el: El) => anim(el, [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 380, easing: ease.bouncy });
export const shake = (el: El) => anim(el, [0, -7, 7, -5, 4, 0].map(x => ({ transform: `translateX(${x}px)` })), { duration: 380, easing: ease.out });
export const rise = (el: El, delay = 0) => anim(el, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay, easing: ease.gentle, fill: 'both' });

/** Number ticker (XP, scores). */
export function ticker(el: HTMLElement | null, to: number, { from, dur = 900, suffix = '' }: { from?: number; dur?: number; suffix?: string } = {}) {
  if (!el) return;
  const start = from ?? (parseFloat(el.textContent || '') || 0);
  if (!on()) { el.textContent = to + suffix; return; }
  const t0 = performance.now();
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(start + (to - start) * e) + suffix;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export const cssVar = (v: string) => getComputedStyle(root()).getPropertyValue(v).trim();
const phaseColors = () => ['--perkuat-fill', '--kuis-fill', '--pahami-fill', '--uji-fill'].map(cssVar);

/** Particle burst from an element (correct answer). Full motion only. */
export function burst(el: El, { colors, count = 14, spread = 90 }: { colors?: string[]; count?: number; spread?: number } = {}) {
  if (!isFull() || !el) return;
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const pal = colors || phaseColors();
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    p.className = 'particle';
    p.style.left = cx + 'px'; p.style.top = cy + 'px'; p.style.background = pal[i % pal.length];
    if (i % 3 === 0) p.style.borderRadius = '50%';
    document.body.appendChild(p);
    const a = (Math.PI * 2 * i) / count + Math.random() * .5, d = spread * (.55 + Math.random() * .6);
    p.animate([{ transform: 'translate(-50%,-50%) scale(1) rotate(0)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(.4) rotate(${Math.random() * 360}deg)`, opacity: 0 }],
      { duration: 700 + Math.random() * 300, easing: 'cubic-bezier(.1,.7,.3,1)' }).finished.then(() => p.remove());
  }
}

/** Floating "+10 XP". */
export function xpFloat(el: El, text = '+10 XP') {
  if (!on() || !el) return;
  const r = el.getBoundingClientRect();
  const f = document.createElement('div');
  f.className = 'xp-float'; f.textContent = text;
  f.style.left = r.left + r.width / 2 - 30 + 'px'; f.style.top = r.top - 10 + 'px';
  document.body.appendChild(f);
  f.animate([{ opacity: 0, transform: 'translateY(6px) scale(.8)' }, { opacity: 1, transform: 'translateY(-14px) scale(1.05)', offset: .3 }, { opacity: 0, transform: 'translateY(-46px) scale(1)' }],
    { duration: 1100, easing: ease.out }).finished.then(() => f.remove());
}

/** Lingkaran yang mengembang di satu titik layar (Pip mengetuk). */
export function ring(x: number, y: number, color?: string) {
  if (!on()) return;
  const d = document.createElement('div');
  d.className = 'fx-ring';
  d.style.cssText = `left:${x}px;top:${y}px;border-color:${color || cssVar('--marigold')}`;
  document.body.appendChild(d);
  d.animate([{ transform: 'scale(.2)', opacity: .9 }, { transform: 'scale(2.6)', opacity: 0 }], { duration: 550, easing: 'cubic-bezier(.2,.8,.2,1)' }).finished.then(() => d.remove());
}

/** Konfeti dari posisi sebuah elemen (Orvi merayakan). */
export function confettiAt(el: Element | null | undefined, color?: string) {
  if (!isFull() || !el) return;
  const r = el.getBoundingClientRect();
  confettiLib({ particleCount: 80, spread: 80, startVelocity: 34, scalar: .9, ticks: 180, zIndex: 9600, disableForReducedMotion: true,
    origin: { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height * .4) / innerHeight },
    colors: [cssVar('--marigold'), color || cssVar('--lilac'), cssVar('--perkuat-fill'), cssVar('--pahami-fill'), cssVar('--uji-fill')] });
}

/** Confetti — only for phase completion or passing a gate. */
export function confetti() {
  if (!isFull()) return;
  const colors = ['--marigold', '--pahami-fill', '--perkuat-fill', '--kuis-fill', '--uji-fill'].map(cssVar);
  const shoot = (x: number, angle: number) => confettiLib({ particleCount: 60, spread: 70, startVelocity: 42, angle, origin: { x, y: .75 }, colors, scalar: .9, ticks: 180, disableForReducedMotion: true });
  shoot(.2, 60); setTimeout(() => shoot(.8, 120), 150);
}

/** Fly a clone of `src` into `dst` (a value flying into a variable box). */
export function flyTo(src: El, dst: El, { dur = 700 } = {}): Promise<void> {
  if (!src || !dst || !on()) return Promise.resolve();
  const a = src.getBoundingClientRect(), b = dst.getBoundingClientRect();
  const c = src.cloneNode(true) as HTMLElement;
  Object.assign(c.style, { position: 'fixed', left: a.left + 'px', top: a.top + 'px', margin: '0', zIndex: '90', pointerEvents: 'none' });
  document.body.appendChild(c);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
  return c.animate([{ transform: 'translate(0,0) scale(1)' }, { transform: `translate(${dx * .5}px, ${dy * .5 - 60}px) scale(1.15)`, offset: .5 }, { transform: `translate(${dx}px, ${dy}px) scale(1)` }],
    { duration: dur, easing: 'cubic-bezier(.45,.05,.3,1)' }).finished.then(() => c.remove());
}

// ---------- Suara (bawaan mati; Pengaturan › Suara). Disintesis lewat WebAudio. ----------
export type SoundKind = 'ok' | 'no' | 'done' | 'tick' | 'tap' | 'pop' | 'whoosh' | 'level';
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
export const soundOn = () => store.get('orvella-sound') === 'on';
export function setSound(onOff: boolean) { store.set('orvella-sound', onOff ? 'on' : 'off'); if (onOff) sound('ok'); }
function tone(t: number, freq: number, dur: number, { type = 'sine' as OscillatorType, vol = .12, to = 0, attack = .006 } = {}) {
  const o = ctx!.createOscillator(), g = ctx!.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g); g.connect(master!); o.start(t); o.stop(t + dur + .02);
}
function noise(t: number, dur: number, { vol = .06, from = 400, to = 2400 } = {}) {
  const len = Math.floor(ctx!.sampleRate * dur), buf = ctx!.createBuffer(1, len, ctx!.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx!.createBufferSource(); src.buffer = buf;
  const f = ctx!.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
  f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx!.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(master!); src.start(t);
}
const SOUNDS: Record<SoundKind, (t: number) => void> = {
  tap: t => tone(t, 880, .05, { vol: .05, type: 'triangle' }),
  pop: t => tone(t, 420, .09, { to: 980, vol: .1 }),
  tick: t => tone(t, 1320, .03, { vol: .04, type: 'square' }),
  ok: t => { tone(t, 784, .12, { type: 'triangle' }); tone(t + .08, 1047, .16, { type: 'triangle' }); tone(t + .16, 1319, .22, { type: 'triangle', vol: .1 }); },
  no: t => { tone(t, 262, .16, { type: 'triangle', vol: .1, to: 220 }); tone(t + .1, 233, .2, { type: 'triangle', vol: .08, to: 196 }); },
  whoosh: t => noise(t, .35, { vol: .06, from: 300, to: 3200 }),
  level: t => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(t + i * .07, f, .26, { type: 'triangle', vol: .09 })); noise(t + .3, .4, { vol: .03, from: 4000, to: 9000 }); },
  done: t => SOUNDS.level(t),
};
export function sound(kind: SoundKind) {
  if (!soundOn()) return;
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = .5; master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    SOUNDS[kind](ctx.currentTime + .005);
  } catch { /* audio tidak tersedia */ }
}

// ---------- Answer-check choreography (MOTION §3.2) ----------
export function correct({ button, xpEl, xp }: { button?: El; xpEl?: HTMLElement | null; xp?: number } = {}) {
  if (button) { burst(button); pop(button); }
  if (xpEl && xp) { ticker(xpEl, (parseInt(xpEl.textContent || '0', 10) || 0) + xp); xpFloat(xpEl, `+${xp} XP`); }
  sound('ok');
}
export function wrong({ target }: { target?: El } = {}) {
  if (target) shake(target);
  sound('no');
}

// ---------- Perilaku global: tilt [data-tilt], magnet [data-magnetic], ripple .btn ----------
let installed = false;
export function installGlobalFx() {
  if (installed) return;
  installed = true;
  document.addEventListener('pointermove', e => {
    if (!isFull()) return;
    const t = (e.target as Element | null)?.closest?.('[data-tilt]') as HTMLElement | null;
    if (t) {
      const r = t.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      t.style.transform = `perspective(900px) rotateX(${(-y * 5).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg) translateY(-2px)`;
    }
    const m = (e.target as Element | null)?.closest?.('[data-magnetic]') as HTMLElement | null;
    if (m && matchMedia('(hover: hover) and (pointer: fine)').matches) {
      const r = m.getBoundingClientRect(), k = parseFloat(m.dataset.magnetic || '') || .25;
      gsap.to(m, { x: (e.clientX - r.left - r.width / 2) * k, y: (e.clientY - r.top - r.height / 2) * k, duration: .35, overwrite: 'auto' });
    }
  }, { passive: true });
  document.addEventListener('pointerout', e => {
    const t = (e.target as Element | null)?.closest?.('[data-tilt]') as HTMLElement | null;
    if (t && !t.contains(e.relatedTarget as Node | null)) t.style.transform = '';
    const m = (e.target as Element | null)?.closest?.('[data-magnetic]') as HTMLElement | null;
    if (m && !m.contains(e.relatedTarget as Node | null)) gsap.to(m, { x: 0, y: 0, duration: .8, ease: 'elastic.out(1, .35)', overwrite: 'auto' });
  });
  document.addEventListener('pointerdown', e => {
    const b = (e.target as Element | null)?.closest?.('.btn') as HTMLElement | null;
    if (!b || !on() || (b as HTMLButtonElement).disabled) return;
    const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2.2;
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    b.appendChild(s);
    s.animate([{ transform: 'scale(0)', opacity: .22 }, { transform: 'scale(1)', opacity: 0 }], { duration: 600, easing: 'cubic-bezier(.2,.8,.2,1)' }).finished.then(() => s.remove());
    sound('tap');
  });
}
