/* Bersama untuk semua halaman gaya Stiker pop: Orvi stiker, monogram, kilau, coretan, tanda siap render. */
(function () {
  const W = (window.STK = {});

  /** PRNG kecil supaya susunan selalu sama di setiap render. */
  W.seeded = seed => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

  /** Orvi sebagai stiker die-cut. size dalam px, pipT = posisi Pip di orbit. */
  W.orvi = (mood = 'happy', size = 400, { pipT, tint = '#1E1C45', cls = 'die lg' } = {}) =>
    `<span class="orvi-stk ${cls}" style="width:${size}px;height:${size}px">${window.Orvi.svg({ mood, size, tint, pipT })}</span>`;

  W.LANGS = [['Py', 'Python', '#3470C9'], ['JS', 'JavaScript', '#EDC21B', '#2A2100'], ['&lt;/&gt;', 'HTML', '#EE5F2C'], ['{ }', 'CSS', '#7A4FD6'],
    ['C', 'C', '#4B7392'], ['C++', 'C++', '#3353C3'], ['Rs', 'Rust', '#B4461C'], ['Jv', 'Java', '#D63B3B'], ['Go', 'Go', '#10A0C4'],
    ['SQL', 'SQL', '#1F988A'], ['Kt', 'Kotlin', '#B13FCC'], ['php', 'PHP', '#6C7CC2']];

  /** Monogram bahasa sebagai stiker bulat-kotak. */
  W.mono = (i, size = 150, rot = 0) => {
    const [m, , c, fg] = W.LANGS[i];
    return `<span class="stk mono" style="--c:${c};width:${size}px;height:${size}px;border-radius:${size * .26}px;font-size:${size * .34}px;${fg ? `color:${fg};` : ''}transform:rotate(${rot}deg)">${m}</span>`;
  };

  /** Kilau bintang empat sudut. */
  W.spark = (x, y, s = 60, color = '#FFB224', rot = 0) =>
    `<svg class="spark" viewBox="-30 -30 60 60" style="left:${x}px;top:${y}px;width:${s}px;height:${s}px;--sc:${color};transform:rotate(${rot}deg)"><path d="M0 -26 C4 -8 8 -4 26 0 C8 4 4 8 0 26 C-4 8 -8 4 -26 0 C-8 -4 -4 -8 0 -26 Z"/></svg>`;

  /** Coretan: path SVG bebas di posisi absolut. */
  W.doodle = (d, x, y, w, h, extra = '') => `<svg class="doodle" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px" viewBox="0 0 ${w} ${h}" ${extra}><path d="${d}"/></svg>`;

  /** Selotip washi. */
  W.tape = (x, y, rot, color = '#FFD27A', w = 190) => `<span class="tape" style="left:${x}px;top:${y}px;width:${w}px;transform:rotate(${rot}deg);--tc:${color}"></span>`;

  /** Ikon lucide ke dalam <svg data-i>. */
  W.icons = () => document.querySelectorAll('svg[data-i]').forEach(svg => {
    const name = svg.dataset.i.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());
    const node = window.lucide && lucide.icons[name];
    if (!node) { console.error('ikon tidak ada:', svg.dataset.i); return; }
    const [, attrs, children] = node;
    for (const [k, v] of Object.entries(attrs)) if (!['width', 'height'].includes(k) || !svg.hasAttribute(k)) svg.setAttribute(k, v);
    svg.innerHTML = children.map(([tag, a]) => `<${tag} ${Object.entries(a).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('');
  });

  /** Tanda logo Orvella (geometri frontend/src/design/LogoMark.tsx). */
  W.logo = (size = 90, t = .7) => {
    const a = -18 * Math.PI / 180, x0 = 55 * Math.cos(t), y0 = 14.5 * Math.sin(t);
    const px = x0 * Math.cos(a) - y0 * Math.sin(a), py = x0 * Math.sin(a) + y0 * Math.cos(a), k = 1 + Math.sin(t) * .16;
    const id = 'lg' + Math.random().toString(36).slice(2, 6);
    const pip = `<circle r="8.5" transform="translate(${px.toFixed(1)} ${py.toFixed(1)}) scale(${k.toFixed(2)})" fill="#EEE9FF" stroke="#1E1C45" stroke-width="3.2"/>`;
    return `<svg width="${size}" height="${size}" viewBox="-62 -62 124 124"><defs><radialGradient id="${id}" cx="36%" cy="30%" r="80%"><stop offset="0" stop-color="#FFF3C9"/><stop offset=".5" stop-color="#FFC53D"/><stop offset="1" stop-color="#F28C00"/></radialGradient><clipPath id="${id}c"><rect x="-70" y="0" width="140" height="70"/></clipPath></defs>
      <g transform="rotate(-18)"><ellipse rx="55" ry="14.5" fill="none" stroke="#1E1C45" stroke-width="5" opacity=".35"/></g><circle r="32" fill="url(#${id})"/>
      <ellipse cx="-12" cy="-16" rx="9.5" ry="5.2" transform="rotate(-35 -12 -16)" fill="#fff" opacity=".6"/>
      <g transform="rotate(-18)"><ellipse rx="55" ry="14.5" fill="none" stroke="#1E1C45" stroke-width="5" clip-path="url(#${id}c)"/></g>${pip}</svg>`;
  };

  /** render.mjs menunggu window.__ready. */
  W.ready = async () => {
    await document.fonts.ready;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    window.__ready = true;
  };
})();
