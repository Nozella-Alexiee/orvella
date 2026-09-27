/* =====================================================================
   ORVELLA · ui.js — data bahasa, penyorot sintaks ringan, logo, cincin fase, toast
   (Fase 2 memakai CodeMirror 6 asli; penyorot ini cukup untuk kartu kode statis.)
   ===================================================================== */
(function () {
  'use strict';
  const LANGS = [
    { id: 'python', name: 'Python', mono: 'Py', rt: 'Python 3.13', ext: 'py', kind: 'run',
      hello: 'nama = "Orvella"\nprint(f"Halo, {nama}!")', out: 'Halo, Orvella!' },
    { id: 'javascript', name: 'JavaScript', mono: 'JS', rt: 'Node 22', ext: 'js', kind: 'run',
      hello: 'const nama = "Orvella";\nconsole.log(`Halo, ${nama}!`);', out: 'Halo, Orvella!' },
    { id: 'html', name: 'HTML', mono: '</>', rt: 'HTML5', ext: 'html', kind: 'web',
      hello: '<h1 class="halo">Halo, Orvella!</h1>\n<p>Halaman pertamaku.</p>', out: '[pratinjau] Halo, Orvella!' },
    { id: 'css', name: 'CSS', mono: '{ }', rt: 'CSS3', ext: 'css', kind: 'web',
      hello: '.halo {\n  color: #FFB224;\n  font-size: 2rem;\n}', out: '[pratinjau] judul jadi marigold' },
    { id: 'c', name: 'C', mono: 'C', rt: 'GCC 14 · C17', ext: 'c', kind: 'compile',
      hello: '#include <stdio.h>\n\nint main(void) {\n    printf("Halo, Orvella!\\n");\n    return 0;\n}', out: 'Halo, Orvella!' },
    { id: 'cpp', name: 'C++', mono: 'C++', rt: 'GCC 14 · C++20', ext: 'cpp', kind: 'compile',
      hello: '#include <iostream>\n\nint main() {\n    std::cout << "Halo, Orvella!\\n";\n}', out: 'Halo, Orvella!' },
    { id: 'rust', name: 'Rust', mono: 'Rs', rt: 'Rust 1.86', ext: 'rs', kind: 'compile',
      hello: 'fn main() {\n    let nama = "Orvella";\n    println!("Halo, {}!", nama);\n}', out: 'Halo, Orvella!' },
    { id: 'java', name: 'Java', mono: 'Jv', rt: 'OpenJDK 21', ext: 'java', kind: 'compile',
      hello: 'class Main {\n    public static void main(String[] a) {\n        System.out.println("Halo, Orvella!");\n    }\n}', out: 'Halo, Orvella!' },
    { id: 'go', name: 'Go', mono: 'Go', rt: 'Go 1.24', ext: 'go', kind: 'compile',
      hello: 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Halo, Orvella!")\n}', out: 'Halo, Orvella!' },
    { id: 'sql', name: 'SQL', mono: 'SQL', rt: 'PostgreSQL 17', ext: 'sql', kind: 'query',
      hello: "SELECT 'Halo, Orvella!' AS sapaan;", out: " sapaan\n----------------\n Halo, Orvella!\n(1 baris)" },
    { id: 'kotlin', name: 'Kotlin', mono: 'Kt', rt: 'Kotlin 2.1', ext: 'kt', kind: 'compile',
      hello: 'fun main() {\n    println("Halo, Orvella!")\n}', out: 'Halo, Orvella!' },
    { id: 'php', name: 'PHP', mono: 'php', rt: 'PHP 8.4', ext: 'php', kind: 'run',
      hello: '<?php\n$nama = "Orvella";\necho "Halo, $nama!";', out: 'Halo, Orvella!' },
  ];
  const byId = Object.fromEntries(LANGS.map(l => [l.id, l]));
  const langChip = (id, cls = '') => { const l = byId[id]; return `<span class="lang ${cls}" data-l="${id}" style="--lc:var(--lang-${id})"><span class="lang-mono">${esc(l.mono)}</span>${l.name}</span>`; };

  /* ---------------- penyorot sintaks ---------------- */
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  const W = s => new Set(s.split(' '));
  const KW = {
    python: W('def return if elif else for while in import from as class True False None and or not with lambda pass break continue print range len'),
    javascript: W('const let var function return if else for while of in new class import from export true false null undefined await async'),
    c: W('int char float double void return if else for while struct const unsigned long short sizeof'),
    cpp: W('int char float double void return if else for while struct class const auto std using namespace new delete template bool true false'),
    rust: W('fn let mut if else for while loop match return struct enum impl use pub true false self in'),
    java: W('class public static void int return if else for while new private final boolean true false'),
    go: W('package import func var const return if else for range type struct true false'),
    sql: W('SELECT FROM WHERE AS INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE JOIN ON GROUP BY ORDER LIMIT AND OR NOT NULL COUNT'),
    kotlin: W('fun val var return if else for while when class true false null'),
    php: W('echo function return if else foreach as class public new true false null'),
  };
  const TYPES = W('int char float double void bool long short unsigned String str i32 i64 u8 u32 usize f64 Vec string size_t Main');
  function rules(lang) {
    const r = [];
    if (lang === 'python') r.push(['com', /^#[^\n]*/]);
    else if (lang === 'sql') r.push(['com', /^--[^\n]*/]);
    else r.push(['com', /^\/\/[^\n]*/], ['com', /^\/\*[\s\S]*?\*\//]);
    if (lang === 'c' || lang === 'cpp') r.push(['pre', /^#\s*\w+(?:\s*<[^>\n]*>)?/]);
    if (lang === 'php') r.push(['pre', /^<\?php/], ['attr', /^\$\w+/]);
    if (lang === 'python') r.push(['str', /^f"(?:\\.|[^"\\\n])*"/]);
    r.push(['str', /^"(?:\\.|[^"\\\n])*"/], ['str', /^'(?:\\.|[^'\\\n])*'/]);
    if (lang === 'javascript') r.push(['str', /^`[^`]*`/]);
    r.push(['num', /^\d+(?:\.\d+)?/], ['word', /^[A-Za-z_][\w]*!?/], ['ws', /^\s+/], ['punc', /^[{}()[\];,.:<>=+\-*/%&|!?]+/], ['any', /^[\s\S]/]);
    return r;
  }
  function hlLine(src, lang) {
    if (lang === 'html') return hlHtml(src);
    if (lang === 'css') return hlCss(src);
    const kw = KW[lang] || KW.javascript, rs = rules(lang);
    let out = '', i = 0;
    while (i < src.length) {
      const rest = src.slice(i);
      let hit = null;
      for (const [k, re] of rs) { const m = rest.match(re); if (m) { hit = [k, m[0]]; break; } }
      const [k, t] = hit; i += t.length;
      if (k === 'word') {
        const next = src.slice(i).match(/^\s*(.)/);
        const up = lang === 'sql' ? t.toUpperCase() : t;
        const cls = kw.has(up) ? 'kw' : TYPES.has(t) ? 'type' : t.endsWith('!') || (next && next[1] === '(') ? 'fn'
          : (/^[A-Z]/.test(t) && lang !== 'sql') ? 'type' : '';
        out += cls ? `<span class="tk-${cls}">${esc(t)}</span>` : esc(t);
      } else if (k === 'ws' || k === 'any') out += esc(t);
      else out += `<span class="tk-${k}">${esc(t)}</span>`;
    }
    return out;
  }
  function hlHtml(src) {
    let out = '', i = 0;
    while (i < src.length) {
      const rest = src.slice(i);
      if (rest.startsWith('<!--')) { const e = rest.indexOf('-->'); const t = e < 0 ? rest : rest.slice(0, e + 3); out += `<span class="tk-com">${esc(t)}</span>`; i += t.length; continue; }
      if (rest[0] === '<') {
        const m = rest.match(/^<\/?[\w-]*/); out += `<span class="tk-tag">${esc(m[0])}</span>`; i += m[0].length;
        while (i < src.length) {
          const r2 = src.slice(i); let m2;
          if ((m2 = r2.match(/^\/?>/))) { out += `<span class="tk-tag">${esc(m2[0])}</span>`; i += m2[0].length; break; }
          if ((m2 = r2.match(/^[\w:@-]+/))) { out += `<span class="tk-attr">${esc(m2[0])}</span>`; i += m2[0].length; continue; }
          if ((m2 = r2.match(/^"[^"]*"|^'[^']*'/))) { out += `<span class="tk-str">${esc(m2[0])}</span>`; i += m2[0].length; continue; }
          out += esc(r2[0]); i++;
        }
        continue;
      }
      const e = rest.indexOf('<'); const t = e < 0 ? rest : rest.slice(0, e); out += esc(t); i += t.length;
    }
    return out;
  }
  function hlCss(src) {
    return esc(src)
      .replace(/(\/\*.*?\*\/)/g, '<span class="tk-com">$1</span>')
      .replace(/^(\s*)([^{}:;]+?)(\s*\{)/, '$1<span class="tk-tag">$2</span><span class="tk-punc">$3</span>')
      .replace(/^(\s*)([\w-]+)(\s*:)/, '$1<span class="tk-attr">$2</span><span class="tk-punc">$3</span>')
      .replace(/(#[0-9a-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|rem|em|%|s|ms|fr|vh|vw)?\b)/g, '<span class="tk-num">$1</span>')
      .replace(/(&quot;[^&]*&quot;|"[^"]*")/g, '<span class="tk-str">$1</span>');
  }
  /* kode → baris bernomor */
  function codeHTML(src, lang, o = {}) {
    const bad = new Set(o.bad || []), hot = new Set(o.hot || []);
    return src.split('\n').map((line, i) => {
      const n = i + 1, cls = bad.has(n) ? ' is-bad' : hot.has(n) ? ' is-hot' : '';
      return `<span class="ln">${n}</span><span class="lc${cls}" data-line="${n}">${hlLine(line, lang) || ' '}</span>`;
    }).join('');
  }

  /* ---------------- logo ---------------- */
  let lmN = 0;
  function logoMark(el) {
    const n = ++lmN;
    el.innerHTML = `<svg viewBox="-62 -62 124 124" aria-hidden="true" focusable="false">
      <defs><radialGradient id="lmg${n}" cx="36%" cy="30%" r="80%"><stop offset="0" stop-color="#FFF3C9"/><stop offset=".5" stop-color="#FFC53D"/><stop offset="1" stop-color="#F28C00"/></radialGradient>
      <clipPath id="lmc${n}"><rect x="-70" y="0" width="140" height="70"/></clipPath></defs>
      <g class="lm-rg"><ellipse class="lm-ring lm-ring-back" rx="55" ry="14.5"/></g>
      <g class="lm-back"></g>
      <circle r="32" fill="url(#lmg${n})"/>
      <ellipse class="lm-shine" cx="-12" cy="-16" rx="9.5" ry="5.2" transform="rotate(-35 -12 -16)"/>
      <g class="lm-rg"><ellipse class="lm-ring" rx="55" ry="14.5" clip-path="url(#lmc${n})"/></g>
      <g class="lm-front"><circle class="lm-pip" r="8.5"/></g>
    </svg>`;
    const svg = el.firstElementChild, pip = svg.querySelector('.lm-pip'), back = svg.querySelector('.lm-back'), front = svg.querySelector('.lm-front');
    svg.querySelectorAll('.lm-rg').forEach(g => g.setAttribute('transform', 'rotate(-18)'));
    let t = .7, speed = 1, raf = 0, last = 0;
    const place = () => {
      const a = -18 * Math.PI / 180, x0 = 55 * Math.cos(t), y0 = 14.5 * Math.sin(t);
      const x = x0 * Math.cos(a) - y0 * Math.sin(a), y = x0 * Math.sin(a) + y0 * Math.cos(a), f = Math.sin(t) > 0;
      const lay = f ? front : back; if (pip.parentNode !== lay) lay.appendChild(pip);
      pip.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${(1 + Math.sin(t) * .16).toFixed(3)})`);
    };
    const loop = now => {
      const dt = Math.min(.05, (now - last) / 1000 || .016); last = now;
      if (window.FX && FX.level() === 'full') { t += dt * (Math.PI * 2 / 7) * speed; place(); }
      raf = requestAnimationFrame(loop);
    };
    place(); raf = requestAnimationFrame(loop);
    const host = el.closest('.logo') || el;
    host.addEventListener('pointerenter', () => window.gsap && gsap.to({ s: speed }, { s: 5, duration: .4, onUpdate() { speed = this.targets()[0].s; } }));
    host.addEventListener('pointerleave', () => window.gsap && gsap.to({ s: speed }, { s: 1, duration: 1.2, onUpdate() { speed = this.targets()[0].s; } }));
    document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (!raf) raf = requestAnimationFrame(loop); });
  }

  /* ---------------- cincin 4 fase ---------------- */
  const PHASES = ['pahami', 'perkuat', 'kuis', 'uji'];
  const PH_NAME = { pahami: 'Pahami', perkuat: 'Perkuat', kuis: 'Kuis', uji: 'Uji' };
  function arc(r, a0, a1) {
    const p = a => [(r * Math.cos(a * Math.PI / 180)).toFixed(2), (r * Math.sin(a * Math.PI / 180)).toFixed(2)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  }
  function phaseRing(el, o = {}) {
    const size = o.size || 120, sw = o.stroke || Math.max(6, size / 13), r = size / 2 - sw, gap = o.gap ?? 12;
    const states = o.states || ['done', 'now', 'lock', 'lock'], prog = o.progress ?? .5;
    let s = `<svg viewBox="${-size / 2} ${-size / 2} ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${o.aria || 'Kemajuan 4 fase'}">`;
    PHASES.forEach((ph, i) => {
      const a0 = -90 + i * 90 + gap / 2, a1 = a0 + 90 - gap, st = states[i];
      if (st === 'lock') s += `<path class="pr-lock" d="${arc(r, a0, a1)}" stroke-width="${sw * .5}"/>`;
      else {
        s += `<path class="pr-track" d="${arc(r, a0, a1)}" stroke-width="${sw}"/>`;
        const end = st === 'done' ? a1 : a0 + (a1 - a0) * prog;
        if (end > a0 + .5) s += `<path class="pr-arc" data-ph="${ph}" d="${arc(r, a0, end)}" stroke="var(--${ph}-fill)" stroke-width="${sw}"/>`;
      }
    });
    if (o.label) s += `<text class="pr-label" text-anchor="middle" y="${o.sub ? size * .04 : size * .09}" font-size="${size * .24}">${o.label}</text>`;
    if (o.sub) s += `<text class="pr-sub" text-anchor="middle" y="${size * .2}" font-size="${Math.max(9, size * .085)}">${o.sub}</text>`;
    el.classList.add('phase-ring'); el.innerHTML = s + '</svg>';
    if (o.animate !== false && window.gsap && window.DrawSVGPlugin && window.FX && FX.level() === 'full')
      gsap.from(el.querySelectorAll('.pr-arc'), { drawSVG: 0, duration: 1, ease: 'power2.inOut', stagger: .25, delay: o.delay || 0 });
  }

  /* ---------------- toast ---------------- */
  function toast(text, o = {}) {
    let box = document.querySelector('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast' + (o.tone ? ' is-' + o.tone : '');
    t.innerHTML = `<span class="t-ico"><i data-lucide="${o.icon || (o.tone === 'ok' ? 'check' : o.tone === 'bad' ? 'x' : 'sparkles')}"></i></span><span>${text}</span>`;
    box.appendChild(t); window.FX && FX.icons(t);
    const lv = window.FX ? FX.level() : 'full';
    if (window.gsap && lv !== 'off') gsap.from(t, { y: 26, scale: .9, opacity: 0, duration: .5, ease: 'back.out(2)' });
    setTimeout(() => {
      if (window.gsap && lv !== 'off') gsap.to(t, { y: 12, opacity: 0, duration: .25, onComplete: () => t.remove() });
      else t.remove();
    }, o.ms || 2800);
  }

  /* ---------------- segmented dengan jempol meluncur ---------------- */
  function segmented(el, onChange) {
    let thumb = el.querySelector('.seg-thumb');
    if (!thumb) { thumb = document.createElement('span'); thumb.className = 'seg-thumb'; el.prepend(thumb); }
    const btns = [...el.querySelectorAll('button')];
    const place = (b, anim) => {
      const x = b.offsetLeft, w = b.offsetWidth;
      if (anim && window.gsap && window.FX && FX.level() !== 'off') gsap.to(thumb, { x, width: w, duration: .45, ease: 'back.out(1.4)' });
      else { thumb.style.width = w + 'px'; thumb.style.transform = `translateX(${x}px)`; }
    };
    const cur = () => btns.find(b => b.getAttribute('aria-pressed') === 'true') || btns[0];
    btns.forEach(b => b.addEventListener('click', () => {
      if (b.getAttribute('aria-pressed') === 'true') return;
      btns.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      place(b, true); onChange && onChange(b);
    }));
    const init = () => place(cur(), false);
    init(); addEventListener('resize', init);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(init);
    return { set(b) { btns.forEach(x => x.setAttribute('aria-pressed', String(x === b))); place(b, true); } };
  }

  window.UI = { LANGS, byId, langChip, hl: hlLine, codeHTML, esc, logoMark, phaseRing, PHASES, PH_NAME, toast, segmented, arc };
  const boot = () => document.querySelectorAll('[data-logo]').forEach(logoMark);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
