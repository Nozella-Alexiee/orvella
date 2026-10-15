/* Bersama untuk slides.html dan pp.html: Orvi statis, tanda logo, ikon lucide, dan sinyal siap-render. */

/** PRNG kecil supaya bintang selalu sama di setiap render. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Tanda logo Orvella (geometri sama dengan frontend/src/design/LogoMark.tsx). Garis memakai currentColor. */
function logoMark(svg, t = 0.7) {
  const id = 'lm' + Math.random().toString(36).slice(2, 7);
  const a = -18 * Math.PI / 180, x0 = 55 * Math.cos(t), y0 = 14.5 * Math.sin(t);
  const px = x0 * Math.cos(a) - y0 * Math.sin(a), py = x0 * Math.sin(a) + y0 * Math.cos(a), k = 1 + Math.sin(t) * .16;
  const pip = `<circle r="8.5" transform="translate(${px.toFixed(1)} ${py.toFixed(1)}) scale(${k.toFixed(2)})" fill="#EEE9FF" stroke="currentColor" stroke-width="3.2"/>`;
  svg.innerHTML = `<defs><radialGradient id="${id}g" cx="36%" cy="30%" r="80%"><stop offset="0" stop-color="#FFF3C9"/><stop offset=".5" stop-color="#FFC53D"/><stop offset="1" stop-color="#F28C00"/></radialGradient>
    <clipPath id="${id}c"><rect x="-70" y="0" width="140" height="70"/></clipPath></defs>
    <g transform="rotate(-18)"><ellipse rx="55" ry="14.5" fill="none" stroke="currentColor" stroke-width="5" opacity=".35"/></g>
    ${Math.sin(t) > 0 ? '' : pip}
    <circle r="32" fill="url(#${id}g)"/>
    <ellipse cx="-12" cy="-16" rx="9.5" ry="5.2" transform="rotate(-35 -12 -16)" fill="#fff" opacity=".6"/>
    <g transform="rotate(-18)"><ellipse rx="55" ry="14.5" fill="none" stroke="currentColor" stroke-width="5" clip-path="url(#${id}c)"/></g>
    ${Math.sin(t) > 0 ? pip : ''}`;
}

/** Ikon lucide dari node-nya, ke dalam <svg data-i="nama-ikon">. */
function icon(svg) {
  const name = svg.dataset.i.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());
  const node = window.lucide && lucide.icons[name];
  if (!node) { console.error('ikon tidak ada:', svg.dataset.i); return; }
  const [, attrs, children] = node;
  for (const [k, v] of Object.entries(attrs)) if (!['width', 'height'].includes(k) || !svg.hasAttribute(k)) svg.setAttribute(k, v);
  svg.innerHTML = children.map(([tag, a]) => `<${tag} ${Object.entries(a).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('');
}

function paintCommon() {
  document.querySelectorAll('[data-orvi]').forEach(el => {
    el.innerHTML = Orvi.svg({ mood: el.dataset.orvi, size: +el.dataset.size || 400, pipT: el.dataset.pip ? +el.dataset.pip : undefined });
    const holder = el.firstElementChild;
    if (holder) { holder.style.width = '100%'; holder.style.height = '100%'; }
    if (el.hasAttribute('data-nopip')) el.querySelectorAll('.o-pip').forEach(p => p.remove());
    // bungkus .orvi supaya aturan CSS orvi.css berlaku
    const wrap = document.createElement('span'); wrap.className = 'orvi'; wrap.style.cssText = 'width:100%;height:100%;display:block';
    wrap.append(...el.childNodes); el.append(wrap);
  });
  document.querySelectorAll('[data-pipsolo]').forEach(el => {
    el.innerHTML = `<svg viewBox="-14 -14 28 28" width="100%" height="100%"><circle r="10" fill="#EEE9FF" stroke="#A99BEA" stroke-width="1.6"/>
      <circle cx="-3.6" cy="-3.6" r="2.3" fill="#C8BDF4"/><circle cx="4" cy="-4.6" r="1.2" fill="#C8BDF4"/>
      <circle cx="-3" cy="2.2" r="1.35" fill="#2A1F4E"/><circle cx="3.2" cy="2.2" r="1.35" fill="#2A1F4E"/></svg>`;
  });
  document.querySelectorAll('svg.mark').forEach(s => logoMark(s, +(s.dataset.t || .7)));
  document.querySelectorAll('svg[data-i]').forEach(icon);
}

/** render.mjs menunggu window.__ready: huruf sudah termuat dan dua frame sudah digambar. */
async function ready() {
  await document.fonts.ready;
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  window.__ready = true;
}
