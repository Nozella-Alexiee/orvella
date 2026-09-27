// @ts-nocheck
/* Logika landing Orvella (port dari design/mockups/js/landing.js).
   mountLanding() dipanggil setelah markup dirender; nilai kembaliannya membersihkan semua loop, listener, dan animasi. */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Flip } from 'gsap/Flip';
import { Draggable } from 'gsap/Draggable';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { Orvi } from '../../orv/orvi';
import { FX } from '../../orv/fx';
import { UI } from '../../orv/ui';
import { sound } from '../../fx';
import { usePrefs } from '../../state/prefs';

export function mountLanding() {
  let dead = false;
  const disposers = [];
  const on = (ev, fn, opts) => { addEventListener(ev, fn, opts); disposers.push(() => removeEventListener(ev, fn, opts)); };
  const every = (fn, ms) => { const id = setInterval(fn, ms); disposers.push(() => clearInterval(id)); return id; };
  const orvis = [];
  const mount = (el, o) => { const i = Orvi.mount(el, o); orvis.push(i); return i; };
  const ctx = gsap.context(() => {
    /* =====================================================================
     ORVELLA · landing.js
     Hero orbit · Coba sekarang (memori 3 bahasa) · 4 fase · editor · studio · Orvi
     ===================================================================== */
    const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
    const lv = () => FX.level();
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const SVGNS = 'http://www.w3.org/2000/svg';
    const TAU = Math.PI * 2;
      void Flip; void DrawSVGPlugin;

    /* ============================== NAV ============================== */
    const nav = $('#nav');
    const onScroll = () => nav.classList.toggle('is-stuck', scrollY > 8);
    on('scroll', onScroll, { passive: true }); onScroll();
    const themeBtn = $('#themeBtn');
    const syncTheme = () => { themeBtn.innerHTML = `<i data-lucide="${FX.isDark() ? 'sun' : 'moon'}"></i>`; FX.icons(themeBtn); };
    themeBtn.addEventListener('click', () => { usePrefs.getState().toggleTheme(); syncTheme(); });
    syncTheme();

    /* ============================== HERO ============================== */
    const heroField = FX.field($('#heroField'), { gap: 26, reach: 160 }); disposers.push(() => heroField.destroy());
    if (lv() === 'full' && DrawSVGPlugin) gsap.from('#swashPath', { drawSVG: 0, duration: 1.1, delay: .7, ease: 'power2.inOut' });

    const orbit = $('#orbit');
    const heroOrvi = mount($('#heroOrvi'), { size: 200, tint: 'python', idle: true, idleMs: 45000, side: 'right' });
    const INNER = ['python', 'javascript', 'html', 'css', 'sql'];
    const OUTER = ['cpp', 'rust', 'c', 'java', 'go', 'kotlin', 'php'];
    const ORDER = [...INNER, ...OUTER];
    const chips = [];
    [...INNER.map((id, i) => [id, 0, i / INNER.length]), ...OUTER.map((id, i) => [id, 1, i / OUTER.length])].forEach(([id, ring, f]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'orb-chip'; b.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-label', `${UI.byId[id].name}: lihat contoh kode`);
      b.innerHTML = UI.langChip(id);
      orbit.appendChild(b);
      chips.push({ el: b, id, ring, a0: f * TAU + (ring ? .45 : 0) });
    });
    const TILT = -9 * Math.PI / 180, cT = Math.cos(TILT), sT = Math.sin(TILT);
    let geo, t = 0, spin = { v: 1 }, hovered = null, heroInView = true;
    function measure() {
      const w = orbit.clientWidth, h = orbit.clientHeight;
      geo = { w, h, cx: w / 2, cy: h * .5, rings: [{ rx: w * (w < 520 ? .27 : .31), ry: w * .095, sp: .2, dir: 1 }, { rx: w * (w < 520 ? .39 : .47), ry: w * (w < 520 ? .19 : .15), sp: .13, dir: -1 }] };
      [['#ringIn', 0], ['#ringOut', 1]].forEach(([s, i]) => {
        const e = $(s), r = geo.rings[i];
        e.setAttribute('cx', geo.cx); e.setAttribute('cy', geo.cy); e.setAttribute('rx', r.rx); e.setAttribute('ry', r.ry);
        e.setAttribute('transform', `rotate(-9 ${geo.cx} ${geo.cy})`);
      });
      heroOrvi.size(w < 420 ? 170 : w < 520 ? 210 : 270);
      placeChips();
    }
    function placeChips() {
      for (const c of chips) {
        const r = geo.rings[c.ring], a = c.a0 + t * r.sp * r.dir;
        const x0 = r.rx * Math.cos(a), y0 = r.ry * Math.sin(a);
        const x = x0 * cT - y0 * sT, y = x0 * sT + y0 * cT, d = Math.sin(a), k = (d + 1) / 2;
        const s = (geo.w < 420 ? .7 : geo.w < 520 ? .8 : .9) * (.82 + .24 * k) * (hovered === c ? 1.14 : 1);
        c.x = geo.cx + x; c.y = geo.cy + y;
        c.el.style.transform = `translate(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px) translate(-50%, -50%) scale(${s.toFixed(3)})`;
        c.el.style.opacity = hovered === c || c.id === current ? 1 : (.5 + .5 * k).toFixed(2);
        c.el.classList.toggle('is-front', d > -.05);
      }
    }
    let lastT = 0;
    function frame(now) {
      if (dead) return;
      requestAnimationFrame(frame);
      const dt = Math.min(.05, (now - lastT) / 1000 || .016); lastT = now;
      if (!geo || !heroInView || document.hidden || lv() !== 'full') return;
      t += dt * spin.v; placeChips();
    }
    const heroIO = new IntersectionObserver(es => (heroInView = es[0].isIntersecting)); heroIO.observe(orbit); disposers.push(() => heroIO.disconnect());
    on('resize', () => { clearTimeout(measure.t); measure.t = setTimeout(measure, 120); });
    on('orv:motion', () => placeChips());

    const tip = $('#orbTip');
    function showTip(c) {
      const L = UI.byId[c.id];
      tip.innerHTML = `<div class="tip-head"><b>${L.name}</b><span>${L.rt}</span></div><div class="code-body">${UI.codeHTML(L.hello.split('\n').slice(0, 4).join('\n'), c.id)}</div>`;
      tip.hidden = false;
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      const left = clamp(c.x - tw / 2, 0, geo.w - tw), top = c.y > geo.h * .55 ? c.y - th - 30 : c.y + 30;
      tip.style.left = left + 'px'; tip.style.top = top + 'px';
      if (lv() !== 'off') gsap.fromTo(tip, { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: .25 });
    }
    chips.forEach(c => {
      const enter = () => { hovered = c; gsap.to(spin, { v: 0, duration: .45, overwrite: true }); showTip(c); placeChips(); };
      const leave = () => { if (hovered === c) hovered = null; gsap.to(spin, { v: 1, duration: 1, overwrite: true }); tip.hidden = true; placeChips(); };
      c.el.addEventListener('pointerenter', enter); c.el.addEventListener('pointerleave', leave);
      c.el.addEventListener('focus', enter); c.el.addEventListener('blur', leave);
      c.el.addEventListener('click', () => { userTouched = true; tip.hidden = true; select(c.id, true); });
    });

    const SAY = { run: 'langsung dijalankan, tanpa kompilasi.', compile: 'dikompilasi dulu, baru dijalankan.', web: 'langsung tampil di pratinjau.', query: 'bertanya ke tabel data.' };
    let current = null, userTouched = false;
    const hcBody = $('#hcBody'), hcOut = $('#hcOut'), hcRun = $('#hcRun');
    const resetOut = () => (hcOut.innerHTML = '<span class="out-label">Keluaran</span><span class="faint-out">Tekan Jalankan untuk mencoba.</span>');
    function select(id, user) {
      current = id; const L = UI.byId[id];
      chips.forEach(c => c.el.setAttribute('aria-pressed', String(c.id === id)));
      $('#hcLang').innerHTML = UI.langChip(id); $('#hcRt').textContent = L.rt;
      const swap = () => { hcBody.innerHTML = UI.codeHTML(L.hello, id); resetOut(); };
      if (lv() !== 'off' && hcBody.innerHTML) gsap.timeline().to(hcBody, { y: -8, opacity: 0, duration: .14 }).add(swap).fromTo(hcBody, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: .3 });
      else swap();
      heroOrvi.tint(id);
      placeChips && geo && placeChips();
      if (user) {
        heroOrvi.react('happy', 900);
        heroOrvi.say(`${L.name} ${SAY[L.kind]}`, { ms: 2600 });
        setTimeout(() => heroOrvi.point(hcRun), 380);
      }
    }
    async function typeOut(el, text) {
      if (lv() === 'off') { el.textContent = text; return; }
      for (let i = 1; i <= text.length; i++) { el.textContent = text.slice(0, i); await wait(text.length > 40 ? 8 : 22); }
    }
    hcRun.addEventListener('click', async () => {
      userTouched = true;
      const L = UI.byId[current];
      hcRun.disabled = true;
      hcOut.innerHTML = '<span class="out-label">Keluaran</span>';
      const line = (html = '', cls = '') => { const s = document.createElement('span'); s.style.display = 'block'; if (cls) s.className = cls; s.innerHTML = html; hcOut.appendChild(s); return s; };
      heroOrvi.react('focus', 1400);
      if (L.kind === 'compile') {
        const l = line(`<span class="dim">$ kompilasi dengan ${L.rt}…</span>`);
        await wait(lv() === 'off' ? 0 : 700);
        l.innerHTML = `<span class="dim">✓ kompilasi selesai dalam 0,${40 + Math.floor(Math.random() * 30)} detik</span>`;
      }
      if (L.kind === 'web') { await wait(200); line(`<span class="web-mini${L.id === 'css' ? ' is-css' : ''}">Halo, Orvella!</span>`); }
      else await typeOut(line(), L.out);
      heroOrvi.react('happy', 1300);
      FX.burstAt(hcOut, { count: 12, speed: 4 });
      sound('ok');
      hcRun.disabled = false;
    });
    every(() => {
      if (userTouched || !heroInView || document.hidden || lv() !== 'full' || hovered) return;
      select(ORDER[(ORDER.indexOf(current) + 1) % ORDER.length], false);
    }, 5200);
    measure(); select('python', false);
    requestAnimationFrame(frame);
    if (document.fonts) document.fonts.ready.then(() => { if (!dead) measure(); });

    /* ============================== COBA SEKARANG ============================== */
    const PROG = {
      python: {
        lang: 'python', file: 'variabel.py', zones: ['Label', 'Objek'],
        lines: () => ['skor = 10', 'nilai = skor', 'skor = 25', 'print(skor, nilai)'],
        explain: () => [
          'Di Python, variabel itu <b>label</b>, bukan kotak. Tekan <b>Baris berikutnya</b> untuk menjalankan baris 1.',
          '<code>skor = 10</code> membuat objek bernilai <b>10</b>, lalu menempelkan label <b>skor</b> padanya.',
          '<code>nilai = skor</code> tidak menyalin angka. Label <b>nilai</b> ikut menempel ke objek yang sama: dua nama, satu nilai.',
          '<code>skor = 25</code> membuat objek baru. Label <b>skor</b> pindah ke 25, sedangkan <b>nilai</b> tetap di 10.',
          'Keluarannya <code>25 10</code>. Mengganti <b>skor</b> tidak mengubah <b>nilai</b>, karena yang dipindah labelnya, bukan objeknya.',
        ],
        mood: ['idle', 'happy', 'think', 'happy', 'cheer'],
        spec(k) {
          const els = [], links = []; let out = '';
          if (k >= 1) { els.push({ id: 'o10', kind: 'obj', x: 70, y: 34, v: '10', sub: 'int' }, { id: 'tskor', kind: 'tag', x: 21, y: 32, label: 'skor' }); }
          if (k >= 2) { els.push({ id: 'tnilai', kind: 'tag', x: 21, y: 70, label: 'nilai' }); links.push({ id: 'lnilai', from: 'tnilai', to: 'o10', kind: 'string' }); }
          if (k >= 3) els.push({ id: 'o25', kind: 'obj', x: 70, y: 72, v: '25', sub: 'int' });
          if (k >= 1) links.push({ id: 'lskor', from: 'tskor', to: k >= 3 ? 'o25' : 'o10', kind: 'string' });
          if (k >= 4) out = '25 10';
          return { els, links, out };
        },
      },
      cpp: {
        lang: 'cpp', file: 'variabel.cpp', zones: ['Stack · main()', 'Alamat naik →'],
        lines: () => ['int skor = 10;', 'int nilai = skor;', 'skor = 25;', 'int* p = &skor;'],
        explain: () => [
          'Di C++, tiap variabel adalah <b>kotak</b> di memori dengan tipe dan ukuran tetap. Tekan <b>Baris berikutnya</b>.',
          '<code>int skor = 10;</code> menyiapkan kotak 4 byte bernama <b>skor</b> di alamat <code>0x7ffc10</code>, lalu mengisinya dengan 10.',
          '<code>int nilai = skor;</code> membuat kotak baru dan <b>menyalin</b> isinya. Pip membawa salinan 10 ke kotak <b>nilai</b>.',
          '<code>skor = 25;</code> hanya mengubah isi kotak <b>skor</b>. Kotak <b>nilai</b> punya salinannya sendiri, jadi tetap 10.',
          '<code>int* p = &skor;</code> membuat pointer. Isi <b>p</b> adalah <b>alamat</b> kotak skor, bukan angkanya.',
        ],
        mood: ['idle', 'happy', 'think', 'happy', 'cheer'],
        spec(k) {
          const els = [], links = [];
          if (k >= 1) els.push({ id: 'bskor', kind: 'box', x: 20, y: 60, label: 'skor', v: k >= 3 ? '25' : '10', sub: 'int · 4 byte', addr: '0x7ffc10' });
          if (k >= 2) els.push({ id: 'bnilai', kind: 'box', x: 50, y: 60, label: 'nilai', v: '10', sub: 'int · 4 byte', addr: '0x7ffc14', carryFrom: 'bskor' });
          if (k >= 4) { els.push({ id: 'bp', kind: 'box', ptr: true, x: 80, y: 60, label: 'p', v: '0x7ffc10', sub: 'int* · 8 byte', addr: '0x7ffc18' }); links.push({ id: 'lp', from: 'bp', to: 'bskor', kind: 'arrow', side: 'top', bend: -120 }); }
          return { els, links, out: '', note: k ? 'Belum ada keluaran. Program ini hanya mengubah memori.' : '' };
        },
      },
      rust: {
        lang: 'rust', file: 'main.rs', zones: ['Stack', 'Heap'],
        lines: f => ['let s1 = String::from("halo");', f ? 'let s2 = s1.clone();' : 'let s2 = s1;', 'println!("{}", s2);', 'println!("{}", s1);'],
        explain: f => [
          'Di Rust, setiap data di heap punya tepat <b>satu pemilik</b>. Jalankan baris per baris dan perhatikan panahnya.',
          '<b>s1</b> ada di stack dan <b>memiliki</b> teks "halo" yang disimpan di heap.',
          f ? '<code>s1.clone()</code> membuat <b>salinan</b> data di heap. Sekarang s1 dan s2 punya teksnya masing-masing.'
            : '<code>let s2 = s1;</code> <b>memindahkan</b> kepemilikan ke s2. Datanya tidak disalin, dan <b>s1</b> tidak boleh dipakai lagi.',
          '<b>s2</b> memiliki data yang sah, jadi baris ini mencetak <code>halo</code>.',
          f ? 'Baris 4 aman sekarang, karena <b>s1</b> masih memiliki datanya. Keluarannya <code>halo</code> dua kali.'
            : 'Compiler menolak baris 4 karena <b>s1</b> sudah dipindahkan. Program ini sebenarnya tidak akan pernah jalan: Rust menangkap bug-nya sebelum dieksekusi.',
        ],
        mood: ['idle', 'happy', 'think', 'happy', 'cheer'],
        spec(k, f) {
          const els = [], links = []; let out = '', err = '', bad = [];
          const moved = k >= 2 && !f;
          if (k >= 1) {
            els.push({ id: 's1', kind: 'box', x: 20, y: 34, label: 's1', v: 'ptr · len 4', sub: 'String', moved });
            els.push({ id: 'h1', kind: 'heap', x: 70, y: 34, cells: 'halo', sub: 'heap' });
            links.push({ id: 'own', from: moved ? 's2' : 's1', to: 'h1', kind: 'arrow' });
          }
          if (k >= 2) {
            els.push({ id: 's2', kind: 'box', x: 20, y: 74, label: 's2', v: 'ptr · len 4', sub: 'String' });
            if (f) { els.push({ id: 'h2', kind: 'heap', x: 70, y: 76, cells: 'halo', sub: 'heap · salinan' }); links.push({ id: 'own2', from: 's2', to: 'h2', kind: 'arrow' }); }
          }
          if (k >= 3) out = 'halo';
          if (k >= 4) {
            if (f) out = 'halo\nhalo';
            else { bad = [4]; err = 'error[E0382]: borrow of moved value: `s1`\n --> main.rs:4:20\n  |\n2 |     let s2 = s1;\n  |              -- value moved here\n4 |     println!("{}", s1);\n  |                    ^^ value borrowed here after move'; }
          }
          return { els, links, out, err, bad };
        },
      },
    };

    const stage = $('#memStage'), linksSvg = $('#memLinks');
    const cbOrvi = mount($('#cbOrvi'), { size: 76, follow: true });
    const nodes = {}, lnodes = {};
    let P = 'python', K = 0, FIXED = false;

    function makeNode(e) {
      const n = document.createElement('div'); n.dataset.id = e.id;
      if (e.kind === 'obj') { n.className = 'mem mem-obj'; n.innerHTML = `<b class="v"></b><small>${e.sub}</small>`; }
      else if (e.kind === 'tag') { n.className = 'mem mem-tag'; n.textContent = e.label; }
      else if (e.kind === 'box') { n.className = 'mem mem-box' + (e.ptr ? ' is-ptr' : ''); n.innerHTML = `<span class="mb-label">${e.label}</span><b class="v"></b><small class="mb-sub">${e.sub}</small><small class="mb-addr">${e.addr || ''}</small>`; }
      else { n.className = 'mem mem-heap'; n.innerHTML = `<small></small><div class="cells">${[...e.cells].map(c => `<span>${c}</span>`).join('')}</div>`; }
      stage.appendChild(n); return n;
    }
    function render(spec, anim, fwd) {
      const moving = anim && lv() !== 'off';
      $('#memEmpty').hidden = spec.els.length > 0;
      const seen = new Set(), later = [];
      spec.els.forEach(e => {
        seen.add(e.id);
        let n = nodes[e.id]; const isNew = !n;
        if (isNew) n = nodes[e.id] = makeNode(e);
        if (isNew || !moving) { n.style.left = e.x + '%'; n.style.top = e.y + '%'; }
        else gsap.to(n, { left: e.x + '%', top: e.y + '%', duration: .6, ease: 'power3.inOut' });
        n.classList.toggle('is-moved', !!e.moved);
        n.classList.toggle('is-long', !!(e.v && e.v.length > 6 && !e.ptr));
        if (e.kind === 'heap') n.querySelector('small').textContent = e.sub;
        const v = n.querySelector('.v');
        if (v) {
          if (isNew && e.carryFrom && moving && fwd && nodes[e.carryFrom]) {
            v.textContent = '';
            later.push(() => cbOrvi.carry(nodes[e.carryFrom].querySelector('.v'), v, { label: e.v, onDrop: () => (v.textContent = e.v) }));
          } else if (v.textContent !== e.v) { const had = v.textContent; v.textContent = e.v; if (!isNew && had && moving) FX.pop(v, 1.35); }
        }
        if (isNew && moving) gsap.from(n, { scale: .3, opacity: 0, duration: .55, ease: 'back.out(2)', delay: .05 });
      });
      Object.keys(nodes).forEach(id => {
        if (seen.has(id)) return;
        const n = nodes[id]; delete nodes[id];
        if (moving) gsap.to(n, { scale: .4, opacity: 0, duration: .3, onComplete: () => n.remove() }); else n.remove();
      });
      const lseen = new Set();
      spec.links.forEach(l => {
        lseen.add(l.id);
        let L = lnodes[l.id];
        if (!L) {
          const p = document.createElementNS(SVGNS, 'path');
          p.setAttribute('class', 'ln-' + l.kind);
          if (l.kind !== 'string') p.setAttribute('marker-end', 'url(#arrowHead)');
          linksSvg.appendChild(p); L = lnodes[l.id] = { p, cur: null, fresh: true };
        }
        L.spec = l;
      });
      Object.keys(lnodes).forEach(id => {
        if (lseen.has(id)) return;
        const L = lnodes[id]; delete lnodes[id];
        if (moving) gsap.to(L.p, { opacity: 0, duration: .25, onComplete: () => L.p.remove() }); else L.p.remove();
      });
      tickLinks.until = performance.now() + (moving ? 1500 : 0);
      if (!tickLinks.raf) tickLinks.raf = requestAnimationFrame(tickLinks);
      later.forEach(f => setTimeout(f, 450));
    }
    const relRect = (r, s) => ({ cx: r.left - s.left + r.width / 2, cy: r.top - s.top + r.height / 2, w: r.width, h: r.height, top: r.top - s.top });
    function edge(r, tx, ty, side) {
      if (side === 'top') return [r.cx, r.top - 6];
      const dx = tx - r.cx, dy = ty - r.cy, hw = r.w / 2 + 6, hh = r.h / 2 + 6;
      const s = Math.min(hw / Math.max(Math.abs(dx), 1e-6), hh / Math.max(Math.abs(dy), 1e-6));
      return [r.cx + dx * s, r.cy + dy * s];
    }
    function tickLinks(now) {
      tickLinks.raf = 0;
      const s = stage.getBoundingClientRect();
      for (const id in lnodes) {
        const L = lnodes[id], a = nodes[L.spec.from], b = nodes[L.spec.to];
        if (!a || !b) continue;
        const ra = relRect(a.getBoundingClientRect(), s), rb = relRect(b.getBoundingClientRect(), s);
        const [sx, sy] = edge(ra, rb.cx, rb.cy, L.spec.side), [ex, ey] = edge(rb, ra.cx, ra.cy, L.spec.side);
        const tgt = [sx, sy, ex, ey];
        if (!L.cur) L.cur = tgt.slice();
        else { const k = now < tickLinks.until ? .16 : 1; for (let i = 0; i < 4; i++) L.cur[i] += (tgt[i] - L.cur[i]) * k; }
        const [x1, y1, x2, y2] = L.cur, mx = (x1 + x2) / 2, my = (y1 + y2) / 2, len = Math.hypot(x2 - x1, y2 - y1);
        const bend = L.spec.bend ?? (L.spec.kind === 'string' ? len * .16 : len * .08);
        L.p.setAttribute('d', `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${mx.toFixed(1)} ${(my + bend).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`);
        if (L.fresh) { L.fresh = false; if (lv() !== 'off') gsap.fromTo(L.p, { opacity: 0 }, { opacity: 1, duration: .45, delay: .25 }); }
      }
      if (now < tickLinks.until) tickLinks.raf = requestAnimationFrame(tickLinks);
    }
    on('resize', () => { tickLinks.until = performance.now() + 60; if (!tickLinks.raf) tickLinks.raf = requestAnimationFrame(tickLinks); });

    const scrub = $('#cbScrub'), nextB = $('#cbNext'), prevB = $('#cbPrev'), fixB = $('#cbFix');
    function go(n, anim = true) {
      n = clamp(n, 0, 4);
      const fwd = n === K + 1, prog = PROG[P];
      K = n;
      const spec = prog.spec(K, FIXED);
      $('#cbCode').innerHTML = UI.codeHTML(prog.lines(FIXED).join('\n'), prog.lang, { hot: K && !spec.bad?.includes(K) ? [K] : [], bad: spec.bad || [] });
      const out = $('#cbOut');
      out.innerHTML = '<span class="out-label">Keluaran</span>' + (spec.err ? `<span class="err">${UI.esc(spec.err)}</span>` : spec.out ? `<span class="ok">${UI.esc(spec.out)}</span>` : `<span class="dim">${spec.note || 'Belum ada keluaran.'}</span>`);
      $('#cbExplain').innerHTML = prog.explain(FIXED)[K];
      $('#cbStepBadge').textContent = `baris ${K}/4`;
      scrub.value = K;
      prevB.disabled = K === 0;
      nextB.disabled = K === 4;
      nextB.innerHTML = K === 4 ? 'Selesai <i data-lucide="check"></i>' : K === 0 ? 'Jalankan baris 1 <i data-lucide="chevron-right"></i>' : 'Baris berikutnya <i data-lucide="chevron-right"></i>';
      FX.icons(nextB);
      fixB.hidden = !(P === 'rust' && K === 4 && !FIXED);
      render(spec, anim, fwd);
      if (spec.err) { cbOrvi.oops(); if (anim) { FX.shake($('#cbCode').closest('.code-card')); sound('no'); } }
      else if (K === 4) { cbOrvi.react('cheer', 1800); if (anim) sound('ok'); }
      else cbOrvi.mood(prog.mood[K]);
    }
    function loadProg(p) {
      P = p; K = 0; FIXED = false;
      Object.keys(nodes).forEach(id => { nodes[id].remove(); delete nodes[id]; });
      Object.keys(lnodes).forEach(id => { lnodes[id].p.remove(); delete lnodes[id]; });
      const prog = PROG[p];
      stage.dataset.lang = p;
      $('#cbLang').innerHTML = UI.langChip(prog.lang);
      $('#cbFile').textContent = prog.file;
      $('#zoneA').textContent = prog.zones[0]; $('#zoneB').textContent = prog.zones[1];
      cbOrvi.tint(prog.lang);
      go(0, false);
    }
    nextB.addEventListener('click', () => go(K + 1));
    prevB.addEventListener('click', () => go(K - 1));
    $('#cbReset').addEventListener('click', () => { FIXED = false; go(0); });
    scrub.addEventListener('input', () => go(+scrub.value, Math.abs(+scrub.value - K) <= 1));
    fixB.addEventListener('click', () => {
      FIXED = true; go(4);
      const l2 = $('#cbCode .lc[data-line="2"]'); l2 && l2.classList.add('is-hot');
      cbOrvi.celebrate();
    });
    UI.segmented($('#cobaTabs'), b => loadProg(b.dataset.p));
    loadProg('python');

    /* ============================== 4 FASE ============================== */
    const arcs = $$('.ph-arc'), lbls = $$('.ph-ring-lbl'), steps = $$('.ph-step');
    const R = 170, GAP = 16;
    arcs.forEach((p, i) => { const a0 = -90 + i * 90 + GAP / 2; p.setAttribute('d', UI.arc(R, a0, a0 + 90 - GAP)); });
    lbls.forEach((t2, i) => { const a = (-90 + i * 90 + 45) * Math.PI / 180; t2.setAttribute('x', ((R + 30) * Math.cos(a)).toFixed(1)); t2.setAttribute('y', ((R + 30) * Math.sin(a)).toFixed(1)); });
    const ringWrap = $('#phRing'), walkerEl = $('#phWalker');
    const walker = mount(walkerEl, { size: 84, follow: false, tint: FX.cssVar('--pahami-fill') });

    function demoHTML(ph, done) {
      if (ph === 'pahami') return `<div class="demo"><span class="code-line">skor = 10</span><div class="demo-box"><small>skor</small><span class="demo-val">10</span></div></div>`;
      if (ph === 'perkuat') return `<div class="demo"><div class="demo-fill"><span class="demo-slot${done ? ' is-done' : ''}">${done ? 'let' : ''}</span><span>skor = 10;</span></div><div class="demo-tokens"><span class="demo-tok">const</span><span class="demo-tok${done ? ' is-ok' : ''}" data-ok>let</span><span class="demo-tok">==</span></div></div>`;
      if (ph === 'kuis') return `<div class="demo"><div class="demo-timer"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" stroke="var(--line)"/><circle class="tm" cx="18" cy="18" r="15" stroke="var(--kuis-fill)" stroke-dasharray="94.25" stroke-dashoffset="${done ? 30 : 0}" transform="rotate(-90 18 18)"/></svg><b class="num">0:08</b><span class="demo-combo">combo ×3</span></div><div class="demo-quiz"><span class="q">Keluaran <code>print(2 ** 3)</code>?</span><div class="opts"><span>6</span><span data-ok class="${done ? 'is-ok' : ''}">8</span><span>9</span></div></div></div>`;
      const tests = ['contoh dari soal', 'daftar kosong', 'tersembunyi', 'tersembunyi'];
      return `<div class="demo"><div class="demo-tests">${tests.map((n, i) => `<div class="demo-test${done ? ' is-pass' : ''}"><span class="dt">✓</span>Tes ${i + 1} · ${n}</div>`).join('')}</div><span class="demo-sum">${done ? '4/4 lulus' : '0/4 lulus'}</span></div>`;
    }
    $$('.ph-mini').forEach(m => (m.innerHTML = demoHTML(m.dataset.demo, true)));
    const slot = $('#phDemo');
    let demoTl = null, curPh = -1;
    function showDemo(i) {
      const ph = UI.PHASES[i];
      demoTl && demoTl.kill();
      slot.innerHTML = demoHTML(ph, lv() !== 'full');
      if (lv() !== 'full') return;
      gsap.from(slot.firstElementChild, { scale: .85, opacity: 0, duration: .5, ease: 'back.out(2)' });
      const tl = demoTl = gsap.timeline({ repeat: -1, repeatDelay: .6, delay: .4 });
      if (ph === 'pahami') {
        tl.fromTo(slot.querySelector('.demo-val'), { y: -80, opacity: 0, scale: .6 }, { y: 0, opacity: 1, scale: 1, duration: .7, ease: 'bounce.out' })
          .to(slot.querySelector('.demo-box'), { borderStyle: 'solid', duration: .01 })
          .to({}, { duration: 1.4 }).to(slot.querySelector('.demo-val'), { opacity: 0, duration: .3 }).set(slot.querySelector('.demo-box'), { borderStyle: 'dashed' });
      } else if (ph === 'perkuat') {
        const tok = slot.querySelector('[data-ok]'), s = slot.querySelector('.demo-slot');
        tl.add(() => { const a = tok.getBoundingClientRect(), b = s.getBoundingClientRect(); tok.__dx = b.left - a.left + (b.width - a.width) / 2; tok.__dy = b.top - a.top + (b.height - a.height) / 2; })
          .to(tok, { x: () => tok.__dx, y: () => tok.__dy, duration: .6, ease: 'power3.inOut' }, '+=.5')
          .add(() => { s.textContent = 'let'; s.classList.add('is-done'); tok.style.visibility = 'hidden'; s.style.background = 'var(--perkuat-fill)'; s.style.color = '#fff'; FX.pop(s, 1.2); })
          .to({}, { duration: 1.4 })
          .add(() => { s.textContent = ''; s.style.background = ''; s.style.color = ''; tok.style.visibility = ''; gsap.set(tok, { x: 0, y: 0 }); });
      } else if (ph === 'kuis') {
        const tm = slot.querySelector('.tm'), ok = slot.querySelector('[data-ok]'), combo = slot.querySelector('.demo-combo');
        tl.fromTo(tm, { strokeDashoffset: 0 }, { strokeDashoffset: 30, duration: 1.4, ease: 'none' })
          .add(() => { ok.classList.add('is-ok'); FX.pop(ok, 1.2); FX.pop(combo, 1.3); })
          .to({}, { duration: 1.5 }).add(() => ok.classList.remove('is-ok'));
      } else {
        const rows = slot.querySelectorAll('.demo-test'), sum = slot.querySelector('.demo-sum');
        rows.forEach((r, j) => tl.add(() => { r.classList.add('is-pass'); sum.textContent = `${j + 1}/4 lulus`; FX.pop(r.querySelector('.dt'), 1.4); }, j ? '+=.45' : '+=.3'));
        tl.to({}, { duration: 1.6 }).add(() => { rows.forEach(r => r.classList.remove('is-pass')); sum.textContent = '0/4 lulus'; });
      }
    }
    function placeWalker(deg) {
      const W = ringWrap.clientWidth, a = deg * Math.PI / 180;
      walkerEl.style.transform = `translate(${(Math.cos(a) * R / 400 * W).toFixed(1)}px, ${(Math.sin(a) * R / 400 * W).toFixed(1)}px)`;
    }
    function setPhase(p) {
      const full = lv() === 'full';
      const act = Math.min(3, Math.floor(p * 4));
      arcs.forEach((a, i) => { const local = full ? clamp(p * 4 - i, 0, 1) : (i <= act ? 1 : 0); gsap.set(a, { drawSVG: `0% ${(local * 100).toFixed(2)}%` }); });
      placeWalker(full ? -90 + p * 360 : -90 + act * 90 + 45);
      if (act !== curPh) {
        curPh = act;
        steps.forEach((s, j) => s.classList.toggle('is-active', j === act));
        lbls.forEach((l, j) => l.classList.toggle('is-on', j <= act));
        walker.tint(FX.cssVar(`--${UI.PHASES[act]}-fill`));
        walker.react(act === 3 ? 'cheer' : 'happy', 900);
        showDemo(act);
      }
    }
    if (ScrollTrigger) {
      ScrollTrigger.create({ trigger: '#phSteps', start: 'top 55%', end: 'bottom 60%', onUpdate: s => setPhase(s.progress), onRefresh: s => setPhase(s.progress) });
    }
    setPhase(0);
    on('resize', () => setPhase(curPh >= 0 ? curPh / 4 : 0));

    /* ============================== EDITOR ============================== */
    const ED = {
      cpp: {
        lang: 'cpp', cmd: 'g++ -std=c++20 main.cpp -o main', link: 'ld · pustaka standar C++',
        bug: '#include <iostream>\n\nint main() {\n    int harga[] = {12000, 8000, 5000};\n    for (int h : harga) total += h;\n    std::cout << "Total: " << total << "\\n";\n}',
        ok: '#include <iostream>\n\nint main() {\n    int harga[] = {12000, 8000, 5000};\n    int total = 0;\n    for (int h : harga) total += h;\n    std::cout << "Total: " << total << "\\n";\n}',
        err: "main.cpp:5:25: error: 'total' was not declared in this scope\n    5 |     for (int h : harga) total += h;\n      |                         ^~~~~",
        bad: 5, explain: 'Baris 5 memakai <code>total</code> sebelum variabelnya dibuat. Tambahkan <code>int total = 0;</code> di atas perulangan.',
        out: 'Total: 25000',
      },
      rust: {
        lang: 'rust', cmd: 'rustc main.rs', link: 'ditautkan otomatis oleh rustc',
        bug: 'fn main() {\n    let harga = vec![12000, 8000, 5000];\n    let total = 0;\n    for h in &harga {\n        total += h;\n    }\n    println!("Total: {}", total);\n}',
        ok: 'fn main() {\n    let harga = vec![12000, 8000, 5000];\n    let mut total = 0;\n    for h in &harga {\n        total += h;\n    }\n    println!("Total: {}", total);\n}',
        err: "error[E0384]: cannot assign twice to immutable variable `total`\n --> main.rs:5:9\n  |\n3 |     let total = 0;\n  |         ----- first assignment to `total`\n5 |         total += h;\n  |         ^^^^^^^^^^ cannot assign twice",
        bad: 5, explain: 'Di Rust, variabel tidak bisa diubah kecuali ditandai <code>mut</code>. Ganti baris 3 menjadi <code>let mut total = 0;</code>.',
        out: 'Total: 25000',
      },
    };
    let edLang = 'cpp', edVer = 'bug', edBusy = false;
    const edOrvi = mount($('#edOrvi'), { size: 52, follow: true, tint: 'cpp' });
    const edOut = $('#edOut'), edRun = $('#edRun');
    function edRender() {
      const d = ED[edLang];
      $('#edCode').innerHTML = UI.codeHTML(d[edVer], d.lang);
      $('#edCmd').textContent = d.cmd;
      $$('.pipe-step small')[1].textContent = d.link;
      $$('.pipe-step').forEach(s => (s.className = 'pipe-step'));
      $$('.ps-bar i').forEach(i => (i.style.width = '0'));
      edOut.innerHTML = '<span class="out-label">Terminal</span><span class="dim">Tekan Jalankan untuk mengompilasi.</span>';
      $('#edExplain').hidden = true;
      edOrvi.tint(d.lang);
    }
    async function stepRun(i, dur, ok) {
      const s = $$('.pipe-step')[i], bar = s.querySelector('.ps-bar i');
      s.className = 'pipe-step is-run';
      if (lv() !== 'off') await gsap.fromTo(bar, { width: '0%' }, { width: '100%', duration: dur, ease: 'power1.inOut' }).then(); else bar.style.width = '100%';
      s.className = 'pipe-step ' + (ok ? 'is-ok' : 'is-bad');
    }
    edRun.addEventListener('click', async () => {
      if (edBusy) return; edBusy = true; edRun.disabled = true;
      const d = ED[edLang];
      edRender();
      edOut.innerHTML = `<span class="out-label">Terminal</span><span class="dim">$ ${d.cmd}</span>\n`;
      edOrvi.react('focus', 3000);
      if (edVer === 'bug') {
        await stepRun(0, .9, false);
        $$('.pipe-step')[1].classList.add('is-skip'); $$('.pipe-step')[2].classList.add('is-skip');
        edOut.insertAdjacentHTML('beforeend', `<span class="err">${UI.esc(d.err)}</span>`);
        $('#edCode').innerHTML = UI.codeHTML(d[edVer], d.lang, { bad: [d.bad] });
        FX.shake($('#edCode')); sound('no');
        $('#edExplainText').innerHTML = d.explain; $('#edExplain').hidden = false;
        if (lv() !== 'off') gsap.from('#edExplain', { y: 12, opacity: 0, duration: .4 });
        edOrvi.oops();
      } else {
        await stepRun(0, .9, true);
        edOut.insertAdjacentHTML('beforeend', `<span class="dim">✓ kompilasi selesai · 0,${60 + Math.floor(Math.random() * 25)} detik</span>\n`);
        await stepRun(1, .35, true);
        await stepRun(2, .45, true);
        const s = document.createElement('span'); s.className = 'ok'; edOut.appendChild(s);
        await typeOut(s, d.out);
        edOut.insertAdjacentHTML('beforeend', '\n<span class="dim">program selesai · kode keluar 0 · 1,2 MB</span>');
        edOrvi.celebrate(); sound('ok');
      }
      edRun.disabled = false; edBusy = false;
    });
    $$('.ed-seg button').forEach(b => b.addEventListener('click', () => {
      edVer = b.dataset.v; $$('.ed-seg button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); edRender();
    }));

    const WEB = {
      html: '<div class="kartu">\n  <h1>Halo, Orvella!</h1>\n  <p>Ubah warnanya di gaya.css,\n     lalu lihat pratinjaunya.</p>\n  <button>Mulai</button>\n</div>',
      css: 'body {\n  font-family: system-ui, sans-serif;\n  background: #FDF4E3;\n  display: grid;\n  place-items: center;\n  height: 100vh;\n  margin: 0;\n}\n.kartu {\n  background: white;\n  padding: 24px 28px;\n  border-radius: 20px;\n  box-shadow: 0 10px 30px #0002;\n}\nh1 { color: #1E1C45; margin: 0 0 6px; }\nbutton {\n  background: #FFB224;\n  border: 0;\n  padding: 10px 18px;\n  border-radius: 12px;\n  font-weight: 700;\n}',
    };
    let webFile = 'html';
    const webSrc = $('#webSrc'), webFrame = $('#webFrame');
    const paint = () => (webFrame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>${WEB.css}</style></head><body>${WEB.html}</body></html>`);
    webSrc.value = WEB.html; paint();
    let webT;
    webSrc.addEventListener('input', () => { WEB[webFile] = webSrc.value; clearTimeout(webT); webT = setTimeout(paint, 140); });
    $$('.web-files button').forEach(b => b.addEventListener('click', () => {
      webFile = b.dataset.f; webSrc.value = WEB[webFile];
      $$('.web-files button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    }));
    $$('.ed-tabs button').forEach(b => b.addEventListener('click', () => {
      $$('.ed-tabs button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
      const web = b.dataset.ed === 'web';
      $('#edWeb').hidden = !web; $('#edCompiled').hidden = web;
      $('#edActions').style.visibility = web ? 'hidden' : '';
      if (!web) { edLang = b.dataset.ed; edRender(); }
      if (lv() !== 'off') gsap.from(web ? '#edWeb' : '#edCompiled', { opacity: 0, y: 10, duration: .35 });
    }));
    edRender();
    const KIND = { run: 'langsung jalan', compile: 'dikompilasi', web: 'pratinjau langsung', query: 'kueri ke tabel' };
    $('#rtGrid').innerHTML = UI.LANGS.map(l => `<div class="rt"><span class="rt-ico">${UI.iconImg(l.id, 30)}</span><span><b>${l.name}</b><small>${l.rt}</small><small class="rt-kind">${KIND[l.kind]}</small></span></div>`).join('');

    /* ============================== STUDIO ============================== */
    const BLOCKS = {
      teks: { icon: 'text', title: 'Penjelasan', sub: 'teks', pv: '<b>Apa itu perulangan?</b>Perulangan menjalankan baris yang sama berkali-kali tanpa menulisnya ulang.' },
      animasi: { icon: 'box', title: 'Animasi memori', sub: '3 langkah', pv: '<b>Lihat i bertambah</b><div class="pv-boxes"><span>i = 0</span><span>i = 1</span><span>i = 2</span></div>' },
      kode: { icon: 'code-xml', title: 'Kode interaktif', sub: 'Python', pv: '<b>Coba jalankan</b><div class="pv-code">for i in range(3):\n    print("Halo", i)</div>' },
      soal: { icon: 'list-checks', title: 'Soal: tebak output', sub: 'pilihan ganda', pv: '<b>Berapa kali "Halo" dicetak?</b><div class="pv-opts"><span>A. 2</span><span>B. 3</span><span>C. 4</span></div>' },
      tantangan: { icon: 'flag', title: 'Tantangan: total belanja', sub: '5 tes', pv: '<b>Tantangan</b>Jumlahkan semua harga di daftar belanja.<div class="pv-code">def total(harga):\n    ...</div>' },
    };
    let seq = 0;
    const list = [{ id: 'b' + (++seq), t: 'teks' }, { id: 'b' + (++seq), t: 'animasi' }, { id: 'b' + (++seq), t: 'kode' }];
    const stList = $('#stList'), stFeed = $('#stFeed'), stOutline = $('#stOutline');
    const stOrvi = mount($('#stOrvi'), { size: 56, tint: 'python', side: 'left' });
    function stRender(newId) {
      const state = Flip && lv() === 'full' ? Flip.getState('.st-item, .pv') : null;
      stList.innerHTML = list.map(b => { const B = BLOCKS[b.t]; return `<li class="st-item${b.id === newId ? ' is-new' : ''}" data-flip-id="${b.id}"><i data-lucide="${B.icon}"></i><b>${B.title}</b><small>${B.sub}</small><button class="btn btn-ghost btn-sm btn-icon" type="button" data-rm="${b.id}" aria-label="Hapus blok ${B.title}"><i data-lucide="x"></i></button></li>`; }).join('');
      stFeed.innerHTML = list.map(b => `<div class="pv${b.id === newId ? ' is-new' : ''}" data-flip-id="pv-${b.id}">${BLOCKS[b.t].pv}</div>`).join('');
      FX.icons(stList);
      if (state) Flip.from(state, { duration: .5, ease: 'power2.inOut', onEnter: els => gsap.fromTo(els, { scale: .7, opacity: 0 }, { scale: 1, opacity: 1, duration: .45, ease: 'back.out(2)' }), onLeave: els => gsap.to(els, { opacity: 0, scale: .8, duration: .25 }) });
      if (newId) {
        const card = stFeed.querySelector('.is-new');
        card && stFeed.scrollTo({ top: card.offsetTop - 8, behavior: lv() === 'off' ? 'auto' : 'smooth' });
        setTimeout(() => $$('.is-new').forEach(e => e.classList.remove('is-new')), 1600);
      }
    }
    function addBlock(t, idx = list.length) {
      if (list.length >= 8) { UI.toast('Satu fase paling banyak 8 blok di contoh ini.', { tone: 'bad' }); return; }
      const id = 'b' + (++seq);
      list.splice(idx, 0, { id, t });
      stRender(id);
      stOrvi.react('happy', 1000);
      stOrvi.say(`${BLOCKS[t].title} ditambahkan.`, { ms: 1800 });
      sound('pop');
    }
    stList.addEventListener('click', e => {
      const b = e.target.closest('[data-rm]'); if (!b) return;
      const i = list.findIndex(x => x.id === b.dataset.rm);
      if (i >= 0) { list.splice(i, 1); stRender(); }
    });
    function dropIndex(y) {
      const items = $$('.st-item', stList);
      for (let i = 0; i < items.length; i++) { const r = items[i].getBoundingClientRect(); if (y < r.top + r.height / 2) return i; }
      return items.length;
    }
    $$('.st-block').forEach(el => {
      el.addEventListener('click', e => { if (e.detail === 0) addBlock(el.dataset.b); });
      if (!Draggable) { el.addEventListener('click', () => addBlock(el.dataset.b)); return; }
      Draggable.create(el, {
        type: 'x,y', minimumMovement: 6, zIndexBoost: true,
        onPress() { el.classList.add('is-dragging'); },
        onDrag() { stOutline.classList.toggle('is-over', this.hitTest(stOutline, '20%')); },
        onRelease(e) {
          el.classList.remove('is-dragging');
          const over = this.hitTest(stOutline, '20%'); stOutline.classList.remove('is-over');
          if (over && this.isDragging !== undefined) addBlock(el.dataset.b, dropIndex((e.changedTouches ? e.changedTouches[0] : e).clientY));
          gsap.to(el, { x: 0, y: 0, duration: lv() === 'off' ? 0 : .6, ease: 'elastic.out(1, .6)' });
        },
        onClick() { addBlock(el.dataset.b); },
      });
    });
    $('#stPublish').addEventListener('click', e => {
      UI.toast('Terbit untuk XII RPL 1. 32 siswa sekarang bisa membuka Bab 3.', { tone: 'ok', icon: 'send' });
      stOrvi.celebrate(); FX.burstAt(e.currentTarget, { count: 18 });
    });
    stRender();

    /* ============================== KENALAN ORVI ============================== */
    const meetEl = $('#meetOrvi');
    const meet = mount(meetEl, { size: innerWidth < 600 ? 190 : 250, follow: true, idle: true, idleMs: 30000, side: 'top' });
    $$('.mood-row [data-mood]').forEach(b => b.addEventListener('click', () => {
      const m = b.dataset.mood;
      if (m === 'cheer') meet.celebrate();
      else if (m === 'oops') meet.oops();
      else if (m === 'sleep') { meet.sleep(); meet.say('Zzz… colek aku buat bangunin.', { ms: 2200 }); }
      else { meet.mood(m); meet.react(m, 60000); }
    }));
    $('#meetPoint').addEventListener('click', () => { meet.wake(); meet.point($('.nav .btn-primary')); });
    if (Draggable) Draggable.create(meetEl, {
      type: 'x,y', minimumMovement: 4,
      onDragStart() { meet.react('oops', 4000); sound('whoosh'); },
      onRelease() {
        if (!this.isDragging && Math.hypot(this.x, this.y) < 2) return;
        gsap.to(meetEl, { x: 0, y: 0, duration: lv() === 'off' ? 0 : 1.2, ease: 'elastic.out(1, .32)' });
        meet.react('happy', 1400); meet.say('Wuih! Balik lagi ke orbit.', { ms: 1800 });
      },
    });

    /* ============================== CTA ============================== */
    const cta = mount($('#ctaOrvi'), { size: 130, tint: '#1E1C45' });
    if (ScrollTrigger) ScrollTrigger.create({ trigger: '.cta', start: 'top 75%', once: true, onEnter: () => setTimeout(() => cta.celebrate(), 300) });

    FX.reveal('.role, .stepper, .st-shell, .ed-shell, .explain');


    FX.icons(document.querySelector('.lp-root'));
  });
  return () => {
    dead = true;
    disposers.forEach(f => f());
    orvis.forEach(o => o.destroy());
    ctx.revert();
    ScrollTrigger.refresh();
  };
}
