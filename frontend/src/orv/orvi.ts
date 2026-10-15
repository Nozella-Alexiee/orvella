// @ts-nocheck
/* Orvi — mesin maskot (port langsung dari design/mockups/js/orvi.js; spesifikasi di design/ORVI.md).
   Dipakai lewat komponen <Orvi/> (design/Orvi.tsx). Membaca level gerak dari fx. */
import { gsap } from 'gsap';
import { confettiAt, motion, pop, ring, sound } from '../fx';

/* =====================================================================
 ORVELLA · orvi.js — maskot Orvi (bola cahaya) + Pip (bulan kecil)

 const o = Orvi.mount(el, { size:160, mood:'idle', tint:'python',
                           follow:true, idle:false, idleMs:30000 });
 o.mood('idle'|'happy'|'think'|'focus'|'sleep')   mood dasar (menetap)
 o.react('happy'|'cheer'|'oops', ms)             momen singkat, lalu kembali
 o.celebrate()  o.oops()  o.sleep()  o.wake()
 o.say(teks, {ms, side})            → Promise   balon ucapan
 o.point(el, {at})                  → Promise   Pip terbang & mengetuk elemen
 o.carry(fromEl, toEl, {label, onDrop}) → Promise  Pip membawa nilai
 o.tint('rust' | '#hex' | null)     warna cincin, jejak & cahaya
 o.flyTo(anchorEl)                  → Promise   Orvi pindah tempat (FLIP)
 o.destroy()
 Orvi.svg({mood, tint, size})       → string SVG statis (stiker, kartu)

 Butuh: gsap (+ MorphSVGPlugin opsional). Membaca FX.level() bila ada.
 ===================================================================== */
const RING = { rx: 88, ry: 22, tilt: -16 };
const TAU = Math.PI * 2;
const MOODS = {
  idle:  { mouth: 'M-11 17 Q0 26 11 17', eyes: 'open',   period: 5.2 },
  happy: { mouth: 'M-12.5 15 Q0 29 12.5 15', eyes: 'happy', period: 3.6 },
  cheer: { mouth: 'M-14 13 Q0 38 14 13 Q0 19 -14 13 Z', eyes: 'happy', period: 1.1, fill: true },
  think: { mouth: 'M-8 20 Q1 16.5 10 18', eyes: 'open',  period: 10, look: [3.8, -4.6] },
  oops:  { mouth: 'M-6 20 C-6 13 6 13 6 20 C6 27 -6 27 -6 20 Z', eyes: 'wide', period: 2.6, fill: true },
  focus: { mouth: 'M-8 19.5 L8 19.5', eyes: 'narrow', period: 8 },
  sleep: { mouth: 'M-5 19 Q0 22.5 5 19', eyes: 'shut', period: 0 },
};
const level = () => motion();
const cssVar = (n, el = document.documentElement) => getComputedStyle(el).getPropertyValue(n).trim();
let uid = 0;

/* ---------- markup ---------- */
function eye(x) {
  return `<g class="o-eye" transform="translate(${x} -3)"><g class="o-look">
    <g class="o-open"><g class="o-blink">
      <ellipse class="o-iris" rx="7.6" ry="10.2"/>
      <circle class="o-glint" cx="-2.5" cy="-3.9" r="2.8"/><circle class="o-glint" cx="2.7" cy="3.7" r="1.15"/>
    </g></g>
    <path class="o-happy" d="M-8.5 3 Q0 -8.5 8.5 3"/>
    <path class="o-shut" d="M-8 -1 Q0 6.5 8 -1"/>
  </g></g>`;
}
const PIP = `<g class="o-pip"><circle class="o-pip-body" r="10"/>
    <circle class="o-crater" cx="-3.6" cy="-3.6" r="2.3"/><circle class="o-crater" cx="4" cy="-4.6" r="1.2"/>
    <g class="o-pip-face"><circle cx="-3" cy="2.2" r="1.35"/><circle cx="3.2" cy="2.2" r="1.35"/></g></g>`;

function markup(id, mood) {
  const m = MOODS[mood] || MOODS.idle;
  return `<svg class="orvi-svg" viewBox="-110 -110 220 220" data-mood="${mood}" data-eyes="${m.eyes}" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="ob${id}" cx="36%" cy="30%" r="78%">
      <stop offset="0" style="stop-color:var(--orvi-hi)"/>
      <stop offset=".5" style="stop-color:var(--orvi-mid)"/>
      <stop offset="1" style="stop-color:color-mix(in oklab, var(--orvi-lo) 82%, var(--orvi-tint))"/>
    </radialGradient>
    <radialGradient id="og${id}">
      <stop offset=".35" style="stop-color:var(--orvi-mid);stop-opacity:.9"/>
      <stop offset=".62" style="stop-color:var(--orvi-tint);stop-opacity:.32"/>
      <stop offset="1" style="stop-color:var(--orvi-tint);stop-opacity:0"/>
    </radialGradient>
    <clipPath id="oc${id}"><rect x="-130" y="0" width="260" height="130"/></clipPath>
  </defs>
  <ellipse class="o-shadow" cx="0" cy="88" rx="40" ry="7"/>
  <circle class="o-glow" r="106" fill="url(#og${id})"/>
  <g class="o-float">
    <g class="o-ring-g"><ellipse class="o-ring o-ring-back" rx="${RING.rx}" ry="${RING.ry}"/></g>
    <g class="o-back"></g>
    <g class="o-body">
      <circle class="o-core" r="58" fill="url(#ob${id})"/>
      <path class="o-rim" d="M45 31.5 A55 55 0 0 1 -45 31.5"/>
      <ellipse class="o-shine" cx="-22" cy="-31" rx="17" ry="9.5" transform="rotate(-35 -22 -31)"/>
      <circle class="o-shine2" cx="-42" cy="-9" r="3.6"/>
      <g class="o-face">
        <ellipse class="o-cheek" cx="-33" cy="15" rx="8.5" ry="5"/>
        <ellipse class="o-cheek" cx="33" cy="15" rx="8.5" ry="5"/>
        ${eye(-19)}${eye(19)}
        <path class="o-brow o-brow-l" d="M-27 -21 Q-19 -25.5 -11 -21"/>
        <path class="o-brow o-brow-r" d="M11 -21 Q19 -25.5 27 -21"/>
        <path class="o-mouth${m.fill ? ' is-filled' : ''}" d="${m.mouth}"/>
      </g>
    </g>
    <g class="o-ring-g"><ellipse class="o-ring o-ring-front" rx="${RING.rx}" ry="${RING.ry}" clip-path="url(#oc${id})"/></g>
    <g class="o-front"></g>
    <g class="o-fx"></g>
  </g>
</svg>`;
}

const ringPos = (t, tilt, k = 1) => {
  const x = RING.rx * k * Math.cos(t), y = RING.ry * k * Math.sin(t);
  const a = tilt * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c, Math.sin(t)];
};

/* ---------- shared loop + pointer ---------- */
const all = new Set();
const pointer = { x: -1, y: -1, seen: false, t: 0 };
let lastActivity = performance.now();
let raf = 0, last = 0;
const activity = () => { lastActivity = performance.now(); all.forEach(o => o._state.sleeping && o._autoSlept && o.wake()); };
addEventListener('pointermove', e => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.seen = true; pointer.t = performance.now(); activity(); }, { passive: true });
['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => addEventListener(ev, activity, { passive: true }));
addEventListener('scroll', () => all.forEach(o => (o._rectAge = 1e9)), { passive: true });
addEventListener('resize', () => all.forEach(o => (o._rectAge = 1e9)));
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
addEventListener('orv:motion', () => all.forEach(o => o._applyLevel()));

function frame(now) {
  raf = requestAnimationFrame(frame);
  // jendela lagi bergerak (os/motion.ts): Orvi diam sebentar; kursor diam > 2 detik: kedip & napas cukup 24 fps
  if (window.__osBusy && window.__osBusy()) { last = now; return; }
  if (now - pointer.t > 2000 && now - last < 41) return;
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
  for (const o of all) if (o._visible) o._tick(dt, now / 1000);
}
function start() { if (!raf && all.size && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } }
function stop() { cancelAnimationFrame(raf); raf = 0; }

const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { const o = e.target.__orvi; if (o) o._visible = e.isIntersecting; }), { rootMargin: '80px' }) : null;

/* live region untuk ucapan Orvi */
let live;
function announce(t) {
  if (!live) { live = document.createElement('div'); live.className = 'sr-only'; live.setAttribute('aria-live', 'polite'); document.body.appendChild(live); }
  live.textContent = ''; setTimeout(() => (live.textContent = t), 30);
}

/* ---------- kelas Orvi ---------- */
class OrviInst {
  constructor(host, opts) {
    this.host = host;
    this.opts = Object.assign({ size: 160, mood: 'idle', tint: null, follow: true, idle: false, idleMs: 30000, poke: true }, opts || {});
    this.id = ++uid;
    host.classList.add('orvi');
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.innerHTML = markup(this.id, this.opts.mood);
    host.__orvi = this;
    this.svg = host.querySelector('svg');
    this.q = s => this.svg.querySelector(s);
    this.els = {
      float: this.q('.o-float'), rings: [...this.svg.querySelectorAll('.o-ring-g')], back: this.q('.o-back'), front: this.q('.o-front'),
      face: this.q('.o-face'), looks: [...this.svg.querySelectorAll('.o-look')], blinks: [...this.svg.querySelectorAll('.o-blink')],
      mouth: this.q('.o-mouth'), glow: this.q('.o-glow'), shadow: this.q('.o-shadow'), fx: this.q('.o-fx'),
    };
    // Pip + jejak
    this.els.front.insertAdjacentHTML('beforeend', PIP);
    this.pip = this.els.front.querySelector('.o-pip');
    this.trail = [];
    for (let i = 0; i < 4; i++) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('class', 'o-trail'); c.setAttribute('r', String(5.5 - i * 1.1)); c.style.opacity = String(.34 - i * .07);
      this.els.front.insertBefore(c, this.pip); this.trail.push(c);
    }
    this._state = { t: 0.9, sx: 1, sy: 1, jy: 0, x: 0, rot: 0, tilt: RING.tilt, ringK: 1, lookX: 0, lookY: 0, faceX: 0, faceY: 0,
      pipAway: false, pipPark: 0, boost: 0, sleeping: false, glow: 1 };
    this._base = this.opts.mood;
    this._visible = true;
    this._nextBlink = performance.now() / 1000 + 1 + Math.random() * 2;
    this._lookAround = null; this._rectAge = 1e9; this._pokes = [];
    this.size(this.opts.size);
    if (this.opts.tint) this.tint(this.opts.tint, true);
    if (this.opts.poke) this.svg.addEventListener('pointerdown', e => this._poke(e));
    if (io) io.observe(host);
    all.add(this); this._applyLevel(); start();
    if (this.opts.mood === 'sleep') this.sleep();
  }

  size(px) {
    this.opts.size = px;
    this.svg.setAttribute('width', px); this.svg.setAttribute('height', px);
    this.host.classList.toggle('orvi--xs', px < 44);
    this.host.classList.toggle('orvi--sm', px >= 44 && px < 80);
    return this;
  }

  _applyLevel() {
    this.lvl = level();
    this.host.dataset.orviLevel = this.lvl;
    if (this.lvl === 'off') { this._render(0); }
  }

  /* ---------- mood ---------- */
  mood(name, opts = {}) {
    if (!MOODS[name]) return this;
    if (!opts.moment) this._base = name;
    if (name !== 'sleep' && this._state.sleeping) this._unsleep();
    const m = MOODS[name];
    this.svg.dataset.mood = name; this.svg.dataset.eyes = m.eyes;
    this.els.mouth.classList.toggle('is-filled', !!m.fill);
    if (this.lvl !== 'off') {
      gsap.to(this.els.mouth, { morphSVG: m.mouth, duration: .32, ease: 'back.out(2)', overwrite: true });
    } else this.els.mouth.setAttribute('d', m.mouth);
    this._fxFor(name);
    this.host.dispatchEvent(new CustomEvent('orvi:mood', { detail: name }));
    return this;
  }
  react(name, ms = 1400) {
    clearTimeout(this._reactT);
    this.mood(name, { moment: true });
    this._reactT = setTimeout(() => this.mood(this._base), ms);
    return this;
  }
  _fxFor(name) {
    const fx = this.els.fx;
    fx.innerHTML = '';
    if (this._fxTl) { this._fxTl.kill(); this._fxTl = null; }
    if (this.lvl === 'off') return;
    if (name === 'think') {
      fx.innerHTML = '<g class="o-think"><circle cx="58" cy="-66" r="4"/><circle cx="70" cy="-80" r="5.5"/><circle cx="86" cy="-96" r="7.5"/></g>';
      this._fxTl = gsap.timeline({ repeat: -1 }).from(fx.querySelectorAll('circle'), { scale: 0, transformOrigin: '50% 50%', stagger: .22, duration: .35, ease: 'back.out(3)' }).to({}, { duration: 1 });
    } else if (name === 'sleep') {
      fx.innerHTML = '<g class="o-zzz"><text x="46" y="-58">z</text><text x="60" y="-76">z</text><text x="78" y="-96">Z</text></g>';
      this._fxTl = gsap.timeline({ repeat: -1 }).fromTo(fx.querySelectorAll('text'), { opacity: 0, y: 8 }, { opacity: 1, y: 0, stagger: .45, duration: .6 }).to(fx.querySelectorAll('text'), { opacity: 0, y: -8, duration: .5 }, '+=.5');
    } else if (name === 'cheer') {
      this._sparkle(7);
    }
  }
  _sparkle(n = 6) {
    if (this.lvl !== 'full') return;
    const fx = this.els.fx;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, r = 70 + Math.random() * 26;
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', 'M0 -7 L1.8 -1.8 L7 0 L1.8 1.8 L0 7 L-1.8 1.8 L-7 0 L-1.8 -1.8 Z');
      p.setAttribute('class', 'o-spark'); fx.appendChild(p);
      gsap.fromTo(p, { x: Math.cos(a) * 40, y: Math.sin(a) * 40, scale: 0, rotation: 0, transformOrigin: '50% 50%' },
        { x: Math.cos(a) * r, y: Math.sin(a) * r, scale: .6 + Math.random() * .8, rotation: 90, duration: .7, ease: 'power2.out', delay: i * .04,
          onComplete: () => gsap.to(p, { scale: 0, duration: .3, onComplete: () => p.remove() }) });
    }
  }

  celebrate() {
    this.react('cheer', 2200);
    sound('level');
    if (this.lvl === 'full') {
      const s = this._state;
      this._state.boost = 2.4;
      gsap.timeline({ overwrite: true })
        .to(s, { sx: 1.12, sy: .86, duration: .12, ease: 'power2.out' })
        .to(s, { jy: -30, sx: .93, sy: 1.1, duration: .26, ease: 'power2.out' })
        .to(s, { tilt: RING.tilt - 14, duration: .26, ease: 'sine.inOut' }, '<')
        .to(s, { jy: 0, sx: 1, sy: 1, duration: .24, ease: 'power2.in' })
        .to(s, { sx: 1.14, sy: .88, duration: .08, ease: 'power1.out' })
        .to(s, { sx: 1, sy: 1, tilt: RING.tilt, duration: .7, ease: 'elastic.out(1, .4)' });
      confettiAt(this.svg, this.tintColor);
    }
    return this;
  }
  oops() {
    this.react('oops', 1500);
    if (this.lvl !== 'off') {
      const s = this._state;
      const amp = this.lvl === 'full' ? 6 : 2;
      gsap.timeline({ overwrite: true })
        .to(s, { sx: .9, sy: 1.08, duration: .08 })
        .to(s, { x: -amp, duration: .06 }).to(s, { x: amp, duration: .06, repeat: 3, yoyo: true })
        .to(s, { x: 0, sx: 1, sy: 1, duration: .4, ease: 'elastic.out(1, .5)' });
      gsap.fromTo(s, { ringK: 1.16 }, { ringK: 1, duration: .8, ease: 'elastic.out(1, .35)' });
    }
    return this;
  }
  sleep() {
    this._state.sleeping = true; this.mood('sleep', { moment: true });
    gsap.to(this._state, { pipPark: 1, duration: this.lvl === 'off' ? 0 : 1.1, ease: 'power2.inOut' });
    return this;
  }
  _unsleep() {
    this._state.sleeping = false; this._autoSlept = false;
    gsap.to(this._state, { pipPark: 0, duration: this.lvl === 'off' ? 0 : .7, ease: 'back.out(1.6)' });
  }
  wake() {
    if (!this._state.sleeping) return this;
    this._unsleep(); this.react('oops', 450);
    setTimeout(() => this.mood(this._base === 'sleep' ? 'idle' : this._base), 460);
    return this;
  }

  /* ---------- tint ---------- */
  tint(name, instant) {
    let c = !name ? cssVar('--lilac') : name[0] === '#' ? name : (cssVar('--lang-' + name) || cssVar('--lilac'));
    this.tintName = name; this.tintColor = c;
    if (!instant && this.lvl !== 'off') gsap.to(this.host, { '--orvi-tint': c, duration: .6, ease: 'power2.out' });
    else this.host.style.setProperty('--orvi-tint', c);
    return this;
  }

  /* ---------- bicara ---------- */
  say(text, o = {}) {
    const ms = o.ms ?? Math.max(2200, text.length * 55);
    let b = this._bubble;
    if (!b) { b = this._bubble = document.createElement('div'); b.className = 'orvi-say'; this.host.appendChild(b); }
    b.dataset.side = o.side || this.opts.side || 'right';
    // ukur dengan teks penuh, kunci lebarnya, lalu geser bila keluar layar
    b.style.width = ''; b.style.marginLeft = '0px'; b.textContent = text; b.classList.add('is-on');
    const r0 = b.getBoundingClientRect();
    b.style.width = Math.ceil(r0.width) + 1 + 'px';
    const pad = 8, dx = r0.left < pad ? pad - r0.left : r0.right > innerWidth - pad ? innerWidth - pad - r0.right : 0;
    b.style.marginLeft = dx + 'px';
    b.textContent = '';
    announce(text);
    clearInterval(this._typeT); clearTimeout(this._sayT);
    if (this.lvl === 'off') b.textContent = text;
    else {
      let i = 0; const step = Math.max(1, Math.round(text.length / 45));
      this._typeT = setInterval(() => { i += step; b.textContent = text.slice(0, i); if (i >= text.length) clearInterval(this._typeT); }, 22);
    }
    this.lvl !== 'off' && gsap.fromTo(b, { scale: .6, opacity: 0 }, { scale: 1, opacity: 1, duration: .45, ease: 'back.out(2.2)', overwrite: true });
    return new Promise(res => { this._sayT = setTimeout(() => { this.hush(); res(); }, ms); });
  }
  hush() {
    const b = this._bubble; if (!b) return;
    clearInterval(this._typeT);
    if (this.lvl !== 'off') gsap.to(b, { scale: .8, opacity: 0, duration: .2, onComplete: () => b.classList.remove('is-on') });
    else b.classList.remove('is-on');
  }

  /* ---------- Pip terbang ---------- */
  _pipCenter() { const r = this.pip.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width]; }
  _makeFlyer(px) {
    const f = document.createElement('div');
    f.className = 'pip-flyer';
    f.style.setProperty('--orvi-tint', this.tintColor || cssVar('--lilac'));
    const d = Math.max(22, px);
    f.innerHTML = `<svg viewBox="-13 -13 26 26" width="${d}" height="${d}">${PIP}</svg>`;
    document.body.appendChild(f);
    return f;
  }
  _fly(f, from, to, dur, getTo) {
    return new Promise(res => {
      const o = { p: 0 };
      gsap.to(o, { p: 1, duration: dur, ease: 'power2.inOut', onComplete: res,
        onUpdate: () => {
          const end = getTo ? getTo() : to;
          const dx = end[0] - from[0], dy = end[1] - from[1];
          const lift = Math.min(170, Math.hypot(dx, dy) * .38);
          const cx = from[0] + dx / 2, cy = Math.min(from[1], end[1]) - lift;
          const p = o.p, q = 1 - p;
          const x = q * q * from[0] + 2 * q * p * cx + p * p * end[0];
          const y = q * q * from[1] + 2 * q * p * cy + p * p * end[1];
          gsap.set(f, { x, y, rotation: (p - .5) * 40 * Math.sign(dx || 1) });
        } });
    });
  }
  async _away(fn) {
    if (this._busy) return; this._busy = true;
    const [sx, sy, pw] = this._pipCenter();
    const f = this._makeFlyer(pw * 1.25);
    gsap.set(f, { xPercent: -50, yPercent: -50, x: sx, y: sy });
    this._state.pipAway = true; this.pip.style.opacity = 0; this.trail.forEach(t => (t.style.visibility = 'hidden'));
    try { await fn(f, [sx, sy]); }
    finally {
      const [fx, fy] = [gsap.getProperty(f, 'x'), gsap.getProperty(f, 'y')];
      if (this.lvl !== 'off') await this._fly(f, [fx, fy], null, .55, () => this._pipCenter());
      f.remove(); this._state.pipAway = false; this.pip.style.opacity = ''; this.trail.forEach(t => (t.style.visibility = ''));
      this._busy = false;
    }
  }
  _spot(el, at = 'tr') {
    const r = el.getBoundingClientRect();
    if (at === 'center') return [r.left + r.width / 2, r.top + r.height / 2];
    if (at === 'left') return [r.left + 4, r.top + r.height / 2];
    if (at === 'top') return [r.left + r.width / 2, r.top - 4];
    return [r.right - 6, r.top + 4];
  }
  point(el, o = {}) {
    if (!el) return Promise.resolve();
    if (this.lvl === 'off') { el.classList.add('is-pointed'); setTimeout(() => el.classList.remove('is-pointed'), 1200); return Promise.resolve(); }
    return this._away(async (f, from) => {
      await this._fly(f, from, null, this.lvl === 'full' ? .8 : .45, () => this._spot(el, o.at));
      const to = this._spot(el, o.at);
      for (let i = 0; i < 2; i++) {
        await gsap.to(f, { scale: .72, duration: .09, yoyo: true, repeat: 1 }).then();
        ring(to[0], to[1], this.tintColor);
        sound('tap');
      }
      el.classList.add('is-pointed');
      gsap.fromTo(el, { scale: 1 }, { scale: 1.035, duration: .16, yoyo: true, repeat: 1, ease: 'power1.inOut', clearProps: 'scale' });
      await new Promise(r => setTimeout(r, o.hold ?? 700));
      el.classList.remove('is-pointed');
    });
  }
  carry(fromEl, toEl, o = {}) {
    if (!fromEl || !toEl) return Promise.resolve();
    if (this.lvl === 'off') { o.onDrop && o.onDrop(); return Promise.resolve(); }
    return this._away(async (f, from) => {
      const aAt = () => { const p = this._spot(fromEl, 'top'); return [p[0], p[1] - 14]; };
      await this._fly(f, from, null, .7, aAt);
      const a0 = aAt();
      const cargo = document.createElement('div');
      cargo.className = 'pip-cargo'; cargo.textContent = o.label ?? fromEl.textContent.trim();
      f.appendChild(cargo);
      gsap.from(cargo, { scale: 0, y: 20, duration: .35, ease: 'back.out(2.5)' });
      sound('pop');
      await new Promise(r => setTimeout(r, 260));
      await this._fly(f, a0, null, .75, () => { const p = this._spot(toEl, 'top'); return [p[0], p[1] - 26]; });
      await gsap.to(cargo, { y: 30, scale: .4, opacity: 0, duration: .28, ease: 'power2.in' }).then();
      o.onDrop && o.onDrop();
      pop(toEl);
      sound('ok');
      await new Promise(r => setTimeout(r, 200));
    });
  }

  /* ---------- pindah tempat (FLIP) ---------- */
  flyTo(anchor) {
    if (!anchor) return Promise.resolve();
    const r0 = this.host.getBoundingClientRect();
    anchor.appendChild(this.host);
    const r1 = this.host.getBoundingClientRect();
    if (this.lvl === 'off') return Promise.resolve();
    const dx = r0.left - r1.left, dy = r0.top - r1.top;
    const o = { p: 0 };
    return new Promise(res => gsap.to(o, { p: 1, duration: .9, ease: 'power3.inOut', onComplete: () => { gsap.set(this.host, { clearProps: 'transform' }); res(); },
      onUpdate: () => { const q = 1 - o.p; gsap.set(this.host, { x: dx * q, y: dy * q - Math.sin(o.p * Math.PI) * 60, rotation: Math.sin(o.p * Math.PI) * -8 }); } }));
  }

  /* ---------- colek ---------- */
  _poke(e) {
    if (this._state.sleeping) { this.wake(); return; }
    const now = performance.now();
    this._pokes = this._pokes.filter(t => now - t < 2200); this._pokes.push(now);
    sound('pop');
    if (this._pokes.length >= 6) { this._pokes = []; this.oops(); this.say(this.opts.dizzyText || 'Aduh, pusing. Pelan-pelan ya.', { ms: 2200 }); return; }
    this.react('happy', 900);
    this._sparkle(3);
    if (this.lvl === 'full') {
      gsap.timeline({ overwrite: true }).to(this._state, { sx: 1.1, sy: .9, duration: .09 }).to(this._state, { sx: 1, sy: 1, duration: .6, ease: 'elastic.out(1.1, .35)' });
    }
  }

  /* ---------- per frame ---------- */
  _tick(dt, now) {
    if (this.lvl === 'off') return;
    const s = this._state, full = this.lvl === 'full';
    const moodName = this.svg.dataset.mood; const m = MOODS[moodName] || MOODS.idle;
    // tidur otomatis
    if (this.opts.idle && !s.sleeping && performance.now() - lastActivity > this.opts.idleMs) { this._autoSlept = true; this.sleep(); }
    // orbit Pip
    let period = m.period || 0;
    if (s.boost > 0) { s.boost -= dt; period = 1.1; }
    if (!full && period) period *= 1.8;
    if (period && !s.sleeping) s.t = (s.t + dt * TAU / period) % TAU;
    // mata mengikuti kursor
    let tx = 0, ty = 0;
    if (m.look) { tx = m.look[0]; ty = m.look[1]; }
    else if (m.eyes !== 'shut' && this.opts.follow && pointer.seen) {
      if ((this._rectAge += dt) > .5) { this._rect = this.svg.getBoundingClientRect(); this._rectAge = 0; }
      const r = this._rect, cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = pointer.x - cx, dy = pointer.y - cy, d = Math.hypot(dx, dy) || 1;
      const mag = Math.min(1, d / 260) * 4.4;
      tx = dx / d * mag; ty = dy / d * mag;
      if (performance.now() - pointer.t > 4000) {                  // kursor diam → lirik sekitar
        if (!this._lookAround || now > this._lookAround.until) this._lookAround = { x: (Math.random() - .5) * 8, y: (Math.random() - .6) * 6, until: now + 1.2 + Math.random() * 2 };
        tx = this._lookAround.x; ty = this._lookAround.y;
      }
    }
    const k = 1 - Math.exp(-dt * 10);
    s.lookX += (tx - s.lookX) * k; s.lookY += (ty - s.lookY) * k;
    s.faceX += (tx * .55 - s.faceX) * k; s.faceY += (ty * .45 - s.faceY) * k;
    // kedip
    if (now > this._nextBlink && (m.eyes === 'open' || m.eyes === 'narrow' || m.eyes === 'wide')) {
      const dbl = Math.random() < .18;
      const tl = gsap.timeline();
      tl.to(this.els.blinks, { scaleY: .08, duration: .07, transformOrigin: '50% 50%' }).to(this.els.blinks, { scaleY: 1, duration: .1 });
      if (dbl) tl.to(this.els.blinks, { scaleY: .08, duration: .07 }, '+=.08').to(this.els.blinks, { scaleY: 1, duration: .1 });
      this._nextBlink = now + 2.4 + Math.random() * 3.8;
    }
    this._render(now, full);
  }
  _render(now, full) {
    const s = this._state;
    const amp = this.lvl === 'off' ? 0 : full ? 3.6 : 1.4;
    const bob = now ? Math.sin(now * TAU / (s.sleeping ? 4.6 : 3.2)) * amp : 0;
    const y = bob + s.jy;
    this.els.float.setAttribute('transform', `translate(${s.x.toFixed(2)} ${y.toFixed(2)}) translate(0 58) scale(${s.sx.toFixed(3)} ${s.sy.toFixed(3)}) translate(0 -58)`);
    const lift = Math.max(0, -y);
    this.els.shadow.setAttribute('transform', `scale(${(1 - lift / 90).toFixed(3)} 1)`);
    this.els.shadow.style.opacity = String(Math.max(.25, 1 - lift / 50));
    if (now) this.els.glow.setAttribute('transform', `scale(${(1 + Math.sin(now * 1.7) * .035).toFixed(3)})`);
    this.els.rings.forEach(g => g.setAttribute('transform', `rotate(${s.tilt.toFixed(2)})`));
    const lt = `translate(${s.lookX.toFixed(2)} ${s.lookY.toFixed(2)})`;
    this.els.looks.forEach(l => l.setAttribute('transform', lt));
    this.els.face.setAttribute('transform', `translate(${s.faceX.toFixed(2)} ${s.faceY.toFixed(2)})`);
    // Pip
    let [px, py, depth] = ringPos(s.t, s.tilt, s.ringK);
    if (s.pipPark > 0) { const k = s.pipPark; px += (20 - px) * k; py += (-66 - py) * k; depth += (1 - depth) * k; }
    const front = depth > 0 || s.pipPark > .5;
    const layer = front ? this.els.front : this.els.back;
    if (this.pip.parentNode !== layer) layer.appendChild(this.pip);
    const sc = 1 + depth * .18;
    this.pip.setAttribute('transform', `translate(${px.toFixed(2)} ${py.toFixed(2)}) scale(${sc.toFixed(3)})`);
    // jejak
    const period = 1;
    this.trail.forEach((c, i) => {
      if (s.pipPark > .05 || this.lvl === 'off') { c.style.display = 'none'; return; }
      c.style.display = '';
      const [tx, ty, td] = ringPos(s.t - (i + 1) * .16 * period, s.tilt, s.ringK);
      const lay = td > 0 ? this.els.front : this.els.back;
      if (c.parentNode !== lay) lay.insertBefore(c, lay.firstChild);
      c.setAttribute('cx', tx.toFixed(2)); c.setAttribute('cy', ty.toFixed(2));
    });
  }

  destroy() {
    all.delete(this); io && io.unobserve(this.host);
    clearTimeout(this._reactT); clearTimeout(this._sayT); clearInterval(this._typeT);
    this._fxTl && this._fxTl.kill();
    this.host.innerHTML = ''; delete this.host.__orvi;
    if (!all.size) stop();
  }
}

/* ---------- statis (stiker, kartu, logo) ---------- */
function staticSvg(o = {}) {
  const mood = o.mood || 'idle', id = 's' + (++uid), m = MOODS[mood] || MOODS.idle;
  const tint = o.tint ? (o.tint[0] === '#' ? o.tint : `var(--lang-${o.tint})`) : 'var(--lilac)';
  let s = markup(id, mood).replace('class="orvi-svg"', `class="orvi-svg is-static" style="--orvi-tint:${tint}" width="${o.size || 96}" height="${o.size || 96}"`);
  const [px, py, d] = ringPos(o.pipT ?? .75, RING.tilt);
  const pip = PIP.replace('class="o-pip"', `class="o-pip" transform="translate(${px.toFixed(1)} ${py.toFixed(1)}) scale(${(1 + d * .18).toFixed(2)})"`);
  const target = d > 0 ? '<g class="o-front">' : '<g class="o-back">';
  s = s.replace(target + '</g>', target + pip + '</g>');
  if (mood === 'sleep') s = s.replace('<g class="o-fx"></g>', '<g class="o-fx"><g class="o-zzz"><text x="46" y="-58">z</text><text x="62" y="-78">z</text><text x="80" y="-98">Z</text></g></g>');
  if (mood === 'think') s = s.replace('<g class="o-fx"></g>', '<g class="o-fx"><g class="o-think"><circle cx="58" cy="-66" r="4"/><circle cx="70" cy="-80" r="5.5"/><circle cx="86" cy="-96" r="7.5"/></g></g>');
  return s;
}

export const Orvi = {
  mount: (el, opts) => (el.__orvi ? el.__orvi : new OrviInst(el, opts)),
  svg: staticSvg,
  moods: Object.keys(MOODS),
  instances: all,
  get pointer() { return pointer; },
};
