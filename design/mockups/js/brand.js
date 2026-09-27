/* =====================================================================
   ORVELLA · brand.js — halaman identitas & lembar maskot
   ===================================================================== */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const V = n => FX.cssVar(n);

  /* ---------- tema ---------- */
  const themeBtn = $('#themeBtn');
  const syncTheme = () => { themeBtn.innerHTML = `<i data-lucide="${FX.isDark() ? 'sun' : 'moon'}"></i>`; FX.icons(themeBtn); };
  themeBtn.addEventListener('click', () => { FX.setTheme(FX.isDark() ? 'light' : 'dark'); syncTheme(); });
  syncTheme();

  /* ---------- daftar isi aktif ---------- */
  const tocLinks = $$('.toc a');
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    tocLinks.forEach(a => a.classList.toggle('is-on', a.getAttribute('href') === '#' + e.target.id));
  }), { rootMargin: '-30% 0px -60% 0px' });
  tocLinks.forEach(a => { const s = $(a.getAttribute('href')); s && io.observe(s); });

  /* ---------- nama ---------- */
  UI.phaseRing($('#nameRing'), { size: 210, states: ['done', 'done', 'now', 'lock'], progress: .45, label: '2/4', sub: 'fase', aria: 'Dua dari empat fase selesai' });

  /* ---------- warna ---------- */
  const hexRgb = h => { h = h.trim(); if (h.startsWith('rgb')) return h.match(/[\d.]+/g).slice(0, 3).map(Number); h = h.replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
  const lum = rgb => { const [r, g, b] = rgb.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
  const ratio = (a, b) => { const la = lum(hexRgb(a)), lb = lum(hexRgb(b)); return (Math.max(la, lb) + .05) / (Math.min(la, lb) + .05); };
  const val = n => (n.startsWith('--') ? V(n) : n);
  const BRAND = [
    ['--bg', 'Susu', 'Latar halaman'], ['--surface', 'Kartu', 'Permukaan kartu'], ['--ink', 'Nila', 'Teks & tombol utama'],
    ['--marigold', 'Marigold', 'Cahaya Orvi, aksen utama'], ['--lilac', 'Lilac', 'Cincin default, fokus'], ['--pip', 'Bulan', 'Warna Pip'], ['--code-bg', 'Papan kode', 'Kartu kode, dua tema'],
  ];
  function paintColors() {
    $('#swBrand').innerHTML = BRAND.map(([n, name, role]) => {
      const c = val(n), dark = lum(hexRgb(c)) < .3;
      return `<div class="sw"><div class="sw-chip" style="background:var(${n});color:${dark ? '#FFF8EA' : '#1E1C45'}">${name}</div><div class="sw-meta"><b>${name}</b><code>${n} · ${c.toUpperCase()}</code><span>${role}</span></div></div>`;
    }).join('');
    $('#swPhase').innerHTML = UI.PHASES.map(p => `<div class="phs" data-phase="${p}"><div class="phs-top"><b>${UI.PH_NAME[p]}</b><span>${{ pahami: 'Konsep & animasi', perkuat: 'Latihan adaptif', kuis: 'Gerbang berwaktu', uji: 'Tantangan & ulangan' }[p]}</span></div>
      <div class="phs-row">${['fill', 'soft', 'ink', 'line'].map(k => { const c = V(`--${p}-${k}`); return `<div style="background:${c};color:${lum(hexRgb(c)) < .3 ? '#fff' : '#1E1C45'}">${k}</div>`; }).join('')}</div></div>`).join('');
    $('#swLang').innerHTML = UI.LANGS.map(l => `<div class="lang-tile" data-l="${l.id}" style="--lc:var(--lang-${l.id})"><span class="lang-mono">${UI.esc(l.mono)}</span><span><b>${l.name}</b><code>${V('--lang-' + l.id).toUpperCase()}</code></span></div>`).join('');
    const PAIRS = [
      ['--ink', '--bg', 'Teks utama', 'di latar susu'], ['--ink-2', '--bg', 'Teks sekunder', 'paragraf & keterangan'], ['--ink-3', '--bg', 'Meta', 'label kecil'],
      ['--btn-ink', '--btn-bg', 'Tombol utama', 'teks tombol'], ['#1E1C45', '--marigold', 'Di atas marigold', 'tombol aksen, XP'],
      ['--marigold-ink', '--marigold-soft', 'Lencana hangat', 'peringatan lembut'],
      ['--pahami-ink', '--pahami-soft', 'Pahami', 'tag fase'], ['--perkuat-ink', '--perkuat-soft', 'Perkuat', 'benar / lulus'],
      ['--kuis-ink', '--kuis-soft', 'Kuis', 'tag fase'], ['--uji-ink', '--uji-soft', 'Uji', 'salah / error'],
      ['--code-ink', '--code-bg', 'Kode', 'teks kode'], ['--syn-com', '--code-bg', 'Komentar kode', 'teks redup'],
    ];
    $('#contrast').innerHTML = PAIRS.map(([f, b, name, use]) => {
      const r = ratio(val(f), val(b));
      const badge = r >= 7 ? '<span class="badge badge-ok">AAA</span>' : r >= 4.5 ? '<span class="badge badge-ok">AA</span>' : r >= 3 ? '<span class="badge badge-warn">AA besar</span>' : '<span class="badge badge-bad">Gagal</span>';
      const fv = f.startsWith('--') ? `var(${f})` : f;
      return `<div class="ct-row" role="row"><span class="ct-demo" style="color:${fv};background:var(${b})">Aa</span><span><b>${name}</b><small>${use}</small></span><span class="ct-ratio">${r.toFixed(2)} : 1</span>${badge}</div>`;
    }).join('');
  }
  paintColors();
  addEventListener('orv:theme', () => requestAnimationFrame(paintColors));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paintColors);

  /* ---------- tipografi ---------- */
  const play = $('#typePlay'), wg = $('#tWght'), wd = $('#tWdth');
  const syncType = () => { play.style.fontWeight = wg.value; play.style.fontVariationSettings = `"wdth" ${wd.value}`; $('#oWght').textContent = wg.value; $('#oWdth').textContent = wd.value; };
  wg.addEventListener('input', syncType); wd.addEventListener('input', syncType); syncType();
  const SCALE = [['--t-hero', 'Hero', 'display'], ['--t-h1', 'Judul 1', 'display'], ['--t-h2', 'Judul 2', 'display'], ['--t-h3', 'Judul 3', 'display'], ['--t-lg', 'Lead', 'ui'], ['--t-md', 'Isi', 'ui'], ['--t-sm', 'Kecil', 'ui'], ['--t-xs', 'Mini', 'ui']];
  $('#typeScale').innerHTML = SCALE.map(([t, n, f]) => `<div class="sc-row"><code>${n}<br>${t}</code><span data-t="${t}" style="font-size:var(${t});${f === 'display' ? 'font-family:var(--font-display);font-weight:800;letter-spacing:-.03em;font-variation-settings:\'wdth\' 84;line-height:1.05' : ''}">Pahami dulu, baru ngoding.</span></div>`).join('');
  const addPx = () => $$('.sc-row span').forEach(s => { s.parentElement.querySelector('code').innerHTML = `${SCALE.find(x => x[0] === s.dataset.t)[1]}<br>${Math.round(parseFloat(getComputedStyle(s).fontSize))} px`; });
  addPx(); addEventListener('resize', addPx);

  /* ---------- lab Orvi ---------- */
  const lab = Orvi.mount($('#labOrvi'), { size: 240, follow: true, side: 'right' });
  const setPressed = (wrap, el) => $$('button', wrap).forEach(b => b.setAttribute('aria-pressed', String(b === el)));
  $('#labMood').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    setPressed($('#labMood'), b);
    const m = b.dataset.m;
    if (m === 'cheer') lab.celebrate();
    else if (m === 'oops') lab.oops();
    else if (m === 'sleep') lab.sleep();
    else { lab.wake(); lab.mood(m); }
  });
  const TINTS = [['', 'Bawaan (lilac)', 'var(--lilac)'], ...UI.LANGS.map(l => [l.id, l.name, `var(--lang-${l.id})`])];
  $('#labTint').innerHTML = TINTS.map(([id, n, c], i) => `<button type="button" data-t="${id}" style="--tc:${c}" aria-label="${n}" title="${n}" aria-pressed="${i === 0}"></button>`).join('');
  $('#labTint').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; setPressed($('#labTint'), b); lab.tint(b.dataset.t || null); lab.react('happy', 700); });
  $('#labSize').addEventListener('input', e => { lab.size(+e.target.value); $('#labSizeO').textContent = e.target.value; });
  $('#labFollow').addEventListener('click', e => { const on = e.currentTarget.getAttribute('aria-checked') !== 'true'; e.currentTarget.setAttribute('aria-checked', String(on)); lab.opts.follow = on; });
  $('#labSayForm').addEventListener('submit', e => { e.preventDefault(); const t = $('#labSay').value.trim(); if (t) { lab.wake(); lab.say(t); } });

  /* ---------- anatomi ---------- */
  const AN_SIZE = () => Math.min(300, $('#anatFig').clientWidth - 120);
  const PARTS = [
    ['pip', 66, -3, 70, -70], ['ring', -84.6, 24.3, -60, 45], ['shine', -22, -31, -60, -62], ['eye', 19, -3, 70, 20],
    ['cheek', -33, 15, -70, 5], ['mouth', 0, 20, 30, 75], ['shadow', 34, 88, 60, 25],
  ];
  function drawAnatomy() {
    const size = AN_SIZE();
    $('#anatOrvi').innerHTML = Orvi.svg({ mood: 'idle', size, pipT: .75 });
    const fig = $('#anatFig').getBoundingClientRect(), sv = $('#anatOrvi svg').getBoundingClientRect();
    const px = (x, y) => [sv.left - fig.left + (x + 110) / 220 * sv.width, sv.top - fig.top + (y + 110) / 220 * sv.height];
    $('#anatLines').innerHTML = PARTS.map(([id, x, y, dx, dy], i) => {
      const [ax, ay] = px(x, y), bx = ax + dx * size / 300, by = ay + dy * size / 300;
      return `<g data-a="${id}"><line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}"/><circle class="al-dot" cx="${ax}" cy="${ay}" r="3"/><circle cx="${bx}" cy="${by}" r="11" style="fill:var(--ink)"/><text class="al-num" x="${bx}" y="${by}">${i + 1}</text></g>`;
    }).join('');
  }
  drawAnatomy();
  if (document.fonts) document.fonts.ready.then(drawAnatomy);
  addEventListener('resize', () => { clearTimeout(drawAnatomy.t); drawAnatomy.t = setTimeout(drawAnatomy, 150); });
  $$('.anat-list li').forEach(li => {
    li.addEventListener('pointerenter', () => { li.classList.add('is-hot'); const g = $(`#anatLines g[data-a="${li.dataset.a}"]`); g && gsap.fromTo(g.querySelectorAll('circle'), { scale: 1 }, { scale: 1.5, transformOrigin: '50% 50%', duration: .2, yoyo: true, repeat: 1 }); });
    li.addEventListener('pointerleave', () => li.classList.remove('is-hot'));
  });

  /* ---------- mood ---------- */
  const MOODS = [
    ['idle', 'Diam', 'Keadaan dasar. Mengambang pelan, berkedip, mata mengikuti kursor.'],
    ['happy', 'Senang', 'Jawaban benar, langkah selesai, kode berhasil dijalankan.'],
    ['think', 'Mikir', 'Orvi sedang memeriksa jawaban atau menyiapkan petunjuk.'],
    ['focus', 'Fokus', 'Selama Kuis dan Uji. Orvi mengecil dan tidak mengganggu.'],
    ['oops', 'Kaget', 'Jawaban belum tepat atau ada error. Tidak pernah marah.'],
    ['sleep', 'Tidur', 'Setelah 30 detik tanpa aktivitas. Colek untuk membangunkan.'],
    ['cheer', 'Pesta', 'Bab selesai, naik level, kuis sempurna. Pip berputar cepat.'],
  ];
  $('#moods').innerHTML = MOODS.map(([m, n, d]) => `<button type="button" class="mood-card" data-m="${m}"><span class="mc-orvi"></span><b>${n}</b><small>${d}</small><code>mood('${m}')</code></button>`).join('')
    + `<div class="mood-card is-tip"><span class="mc-poke"></span><b>Colek aku</b><small>Colek Orvi enam kali dalam dua detik dan lihat apa yang terjadi.</small><code>poke</code></div>`;
  Orvi.mount($('.mc-poke'), { size: 110, tint: 'javascript' });
  const moodInst = {};
  $$('.mood-card[data-m]').forEach(c => {
    const m = c.dataset.m;
    const o = moodInst[m] = Orvi.mount(c.querySelector('.mc-orvi'), { size: 110, mood: m === 'cheer' || m === 'oops' ? 'happy' : m, poke: false });
    if (m === 'cheer') o.react('cheer', 1e9);
    if (m === 'oops') o.react('oops', 1e9);
    c.addEventListener('click', () => {
      if (m === 'cheer') { o.celebrate(); setTimeout(() => o.react('cheer', 1e9), 2300); }
      else if (m === 'oops') { o.oops(); setTimeout(() => o.react('oops', 1e9), 1600); }
      else if (m === 'sleep') { o.wake(); setTimeout(() => o.sleep(), 1800); }
      else { o.react('happy', 700); setTimeout(() => o.mood(m), 720); }
    });
  });

  /* ---------- ukuran ---------- */
  const SIZES = [[28, 'xs', 'Navigasi & tab'], [56, 'sm', 'Balon petunjuk'], [96, 'md', 'Kartu & umpan balik'], [160, 'lg', 'Halaman kosong'], [240, 'xl', 'Hero & selebrasi']];
  $('#sizes').innerHTML = SIZES.map(([s, n, u]) => `<div class="size-it"><span class="sz-orvi" data-s="${s}"></span><b>${n} · ${s}</b><small>${u}</small></div>`).join('');
  $$('.sz-orvi').forEach(el => Orvi.mount(el, { size: +el.dataset.s, poke: true }));

  /* ---------- tint ---------- */
  $('#tintRow').innerHTML = UI.LANGS.map(l => `<div class="tint-it">${Orvi.svg({ mood: 'idle', tint: l.id, size: 72, pipT: .6 })}<span>${l.name}</span></div>`).join('');

  /* ---------- Pip ---------- */
  const pip = Orvi.mount($('#pipOrvi'), { size: 150, follow: true, side: 'bottom' });
  $$('.pip-act').forEach(b => b.addEventListener('click', () => {
    const p = b.dataset.p;
    if (p === 'point') { pip.wake(); pip.point($('#pipTarget')); }
    if (p === 'carry') { pip.wake(); $('#pipBoxV').textContent = ''; pip.carry($('#pipVal'), $('#pipBox'), { label: '10', onDrop: () => ($('#pipBoxV').textContent = '10') }); }
    if (p === 'park') { if (pip._state.sleeping) pip.wake(); else pip.sleep(); }
    if (p === 'loop') { pip.wake(); pip.celebrate(); }
  }));
  $('#pipTarget').addEventListener('click', () => UI.toast('Jawaban terkirim.', { tone: 'ok' }));

  /* ---------- stiker ---------- */
  const STICK = [
    ['happy', '--pahami-fill', 'Paham!', 'fase Pahami pertama'], ['cheer', '--kuis-fill', 'Kuis sempurna', '10 dari 10 benar'],
    ['happy', '--marigold-deep', '7 hari beruntun', 'belajar seminggu penuh'], ['focus', '--uji-fill', 'Pembasmi bug', 'memperbaiki 10 error'],
    ['happy', '--lang-cpp', 'Kompilasi pertama', 'program C++ pertama'], ['think', '--lang-rust', 'Pemilik sejati', 'lulus bab ownership Rust'],
    ['cheer', '--lang-html', 'Halaman pertama', 'HTML pertama tampil'], ['sleep', '--lilac', 'Si begadang', 'belajar lewat jam 10 malam'],
  ];
  $('#stickers').innerHTML = STICK.map(([m, c, n, d], i) => `<div class="sticker" style="transform:rotate(${[-4, 3, -2, 4, -3, 2, -4, 3][i]}deg)">${Orvi.svg({ mood: m, tint: V(c), size: 96, pipT: [.7, 2.2, .9, .5, 1.1, 2.5, .8, .6][i] })}<b>${n}</b><small>${d}</small></div>`).join('');

  /* ---------- gerak ---------- */
  const ball = $('#moBall');
  const roll = ease => { const W = ball.parentElement.clientWidth - 46; gsap.fromTo(ball, { x: 0 }, { x: W, duration: 1, ease, onComplete: () => gsap.to(ball, { x: 0, duration: .6, ease: 'power2.inOut', delay: .3 }) }); };
  $('#moSpring').addEventListener('click', () => roll('elastic.out(1, .45)'));
  $('#moLinear').addEventListener('click', () => roll('none'));
  $('#moXp').addEventListener('click', e => FX.xpFly(e.currentTarget, $('#moXpPill'), '+10 XP', () => FX.ticker($('#moXpN'), (+$('#moXpN').textContent || 0) + 10, { dur: .6 })));
  const lvlSeg = UI.segmented($('#moLevel'), b => { FX.setLevel(b.dataset.l); UI.toast(`Gerak: ${b.textContent}`, { icon: 'sparkles' }); });
  const syncLvl = () => { const b = $(`#moLevel [data-l="${FX.level()}"]`); b && b.getAttribute('aria-pressed') !== 'true' && lvlSeg.set(b); };
  addEventListener('orv:motion', syncLvl); syncLvl();
  const EASES = [['--ease-out', 'Keluar', [.22, 1, .36, 1]], ['--ease-spring', 'Pegas', [.34, 1.56, .64, 1]], ['--ease-inout', 'Masuk-keluar', [.65, 0, .35, 1]]];
  const DURS = [['--dur-1', 'Sentuh', 120], ['--dur-2', 'Kecil', 220], ['--dur-3', 'Sedang', 380], ['--dur-4', 'Besar', 640]];
  $('#motionEases').innerHTML = EASES.map(([t, n, [a, b, c, d]]) => `<div class="tok"><svg viewBox="-4 -14 68 58"><line x1="0" y1="40" x2="60" y2="40"/><line x1="0" y1="0" x2="60" y2="0"/><path d="M0 40 C${a * 60} ${40 - b * 40} ${c * 60} ${40 - d * 40} 60 0"/></svg><span><b>${n}</b><code>${t}</code></span></div>`).join('');
  $('#motionDurs').innerHTML = DURS.map(([t, n, ms]) => `<div class="tok"><svg viewBox="0 0 64 40"><line x1="0" y1="20" x2="64" y2="20"/><path d="M0 20 L${ms / 640 * 64} 20" style="stroke-width:8"/></svg><span><b>${n} · ${ms} ms</b><code>${t}</code></span></div>`).join('');

  window.MOCK = {
    states: [{ id: 'default', label: 'Awal' }, { id: 'orvi-sleep', label: 'Lab · Orvi tidur' }, { id: 'orvi-say', label: 'Lab · Orvi bicara' }, { id: 'rust', label: 'Lab · cincin Rust' }],
    onState(id) {
      if (id === 'orvi-sleep') { $('#orvi').scrollIntoView(); $('#labMood [data-m="sleep"]').click(); }
      if (id === 'orvi-say') { $('#orvi').scrollIntoView(); lab.say('Belum tepat, tidak apa-apa. Lihat baris 3.', { ms: 1e6 }); }
      if (id === 'rust') { $('#orvi').scrollIntoView(); $('#labTint [data-t="rust"]').click(); }
      if (id === 'default') location.search = '';
    },
  };
})();
