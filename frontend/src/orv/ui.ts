// @ts-nocheck
/* Pembantu UI landing (port dari design/mockups/js/ui.js): penyorot sintaks, chip bahasa, cincin fase, segmented. */
import { gsap } from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { LANGS, LANG_BY_ID } from '../lib/langs';
import { langIconUrl as iconUrl } from '../design/LangIcon';
import { toast as appToast } from '../design/toast';
import { FX } from './fx';
void DrawSVGPlugin;
/* =====================================================================
 ORVELLA · ui.js — data bahasa, penyorot sintaks ringan, logo, cincin fase, toast
 (Fase 2 memakai CodeMirror 6 asli; penyorot ini cukup untuk kartu kode statis.)
 ===================================================================== */
const byId = LANG_BY_ID;
const iconImg = (id, px = 22) => { const l = byId[id]; return `<span class="lang-ico${l.mono ? ' is-mono' : ''}" style="width:${px}px;height:${px}px"><img src="${iconUrl(l.icon)}" alt="" width="${px}" height="${px}"></span>`; };
const langChip = (id, cls = '') => { const l = byId[id]; return `<span class="lang-chip ${cls === 'lang-lg' ? 'is-lg' : cls}" style="--lc:var(--lang-${id})">${iconImg(id, cls === 'lang-lg' ? 28 : 22)}${l.name}</span>`; };

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
  if (o.animate !== false && gsap && DrawSVGPlugin && FX.level() === 'full')
    gsap.from(el.querySelectorAll('.pr-arc'), { drawSVG: 0, duration: 1, ease: 'power2.inOut', stagger: .25, delay: o.delay || 0 });
}

function toast(text, o = {}) { appToast({ kind: o.tone === 'ok' ? 'success' : o.tone === 'bad' ? 'danger' : 'accent', icon: o.icon || (o.tone === 'ok' ? 'check' : 'sparkles'), title: text }); }

/* ---------------- segmented dengan jempol meluncur ---------------- */
function segmented(el, onChange) {
  let thumb = el.querySelector('.seg-thumb');
  if (!thumb) { thumb = document.createElement('span'); thumb.className = 'seg-thumb'; el.prepend(thumb); }
  const btns = [...el.querySelectorAll('button')];
  const place = (b, anim) => {
    const x = b.offsetLeft, w = b.offsetWidth;
    if (anim && gsap && FX.level() !== 'off') gsap.to(thumb, { x, width: w, duration: .45, ease: 'back.out(1.4)' });
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

export const UI = { LANGS, byId, langChip, iconImg, hl: hlLine, codeHTML, esc, phaseRing, PHASES, PH_NAME, toast, segmented, arc };
