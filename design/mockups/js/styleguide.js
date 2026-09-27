/* =====================================================================
   ORVELLA · styleguide.js — komponen hidup
   ===================================================================== */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const wait = ms => new Promise(r => setTimeout(r, ms));

  /* tema + daftar isi */
  const themeBtn = $('#themeBtn');
  const syncTheme = () => { themeBtn.innerHTML = `<i data-lucide="${FX.isDark() ? 'sun' : 'moon'}"></i>`; FX.icons(themeBtn); };
  themeBtn.addEventListener('click', () => { FX.setTheme(FX.isDark() ? 'light' : 'dark'); syncTheme(); });
  syncTheme();
  const toc = $$('.toc a');
  const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && toc.forEach(a => a.classList.toggle('is-on', a.getAttribute('href') === '#' + e.target.id))), { rootMargin: '-30% 0px -60% 0px' });
  toc.forEach(a => { const s = $(a.getAttribute('href')); s && io.observe(s); });

  /* XP global */
  const xpN = $('#xpN');
  const giveXp = (from, n = 10) => FX.xpFly(from, $('#xpTarget'), `+${n} XP`, () => FX.ticker(xpN, parseInt(xpN.textContent.replace(/\./g, ''), 10) + n, { dur: .7 }));

  /* tombol memuat */
  const lb = $('#loadBtn');
  lb.addEventListener('click', async () => {
    const html = lb.innerHTML; lb.setAttribute('aria-disabled', 'true'); lb.innerHTML = '<span class="spin"></span> Mengirim…';
    await wait(1100); lb.innerHTML = '<i data-lucide="check"></i> Terkirim'; FX.icons(lb); UI.toast('Jawaban terkirim ke mentor.', { tone: 'ok' });
    await wait(1400); lb.innerHTML = html; FX.icons(lb); lb.removeAttribute('aria-disabled');
  });

  /* pilih bahasa */
  let curLang = 'python';
  const lpBtn = $('#lpBtn'), lpPop = $('#lpPop');
  const paintLp = () => { lpBtn.innerHTML = `${UI.langChip(curLang)}<small>${UI.byId[curLang].rt}</small>`; };
  lpPop.innerHTML = UI.LANGS.map(l => `<button type="button" role="option" data-id="${l.id}" aria-selected="${l.id === curLang}">${UI.langChip(l.id)}<small>${l.rt}</small></button>`).join('');
  const openLp = on => {
    lpPop.hidden = !on; lpBtn.setAttribute('aria-expanded', String(on));
    if (on && FX.level() !== 'off') gsap.fromTo(lpPop, { y: -6, opacity: 0, scale: .98 }, { y: 0, opacity: 1, scale: 1, duration: .25 });
    if (on) (lpPop.querySelector('[aria-selected="true"]') || lpPop.firstElementChild).focus();
  };
  lpBtn.addEventListener('click', () => openLp(lpPop.hidden));
  lpPop.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    curLang = b.dataset.id; $$('button', lpPop).forEach(x => x.setAttribute('aria-selected', String(x === b)));
    paintLp(); openLp(false); lpBtn.focus(); FX.pop(lpBtn, 1.03);
  });
  lpPop.addEventListener('keydown', e => {
    const items = $$('button', lpPop), i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(items.length - 1, i + 1)].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[Math.max(0, i - 1)].focus(); }
    if (e.key === 'Escape') { openLp(false); lpBtn.focus(); }
  });
  document.addEventListener('pointerdown', e => { if (!lpPop.hidden && !e.target.closest('#langPick')) openLp(false); });
  paintLp();

  /* sakelar, segmented, knob */
  $$('.switch').forEach(s => s.addEventListener('click', () => {
    const on = s.getAttribute('aria-checked') !== 'true'; s.setAttribute('aria-checked', String(on));
    if (s.id === 'swSound') SFX.toggle(on);
  }));
  $('#swSound').setAttribute('aria-checked', String(SFX.enabled));
  UI.segmented($('#goalSeg'), b => UI.toast(`Target harian: ${b.textContent}`, { icon: 'target' }));
  const knob = $('#knob');
  knob.addEventListener('input', () => ($('#knobO').textContent = FX.fmt(+knob.value)));

  /* kartu jalur */
  const PATHS = [['python', 'Python Dasar', 'Dari print pertama sampai fungsi dan berkas.', 45, 'Bab 2 · Variabel'], ['cpp', 'C++ untuk Pemula', 'Kotak memori, pointer, dan cara kerja compiler.', 12, 'Bab 1 · Halo, C++'], ['html', 'Web: HTML & CSS', 'Susun halaman, atur tata letak, buat responsif.', 80, 'Bab 6 · Flexbox']];
  $('#pathCards').innerHTML = PATHS.map(([id, t, d, p, now]) => `<article class="pcard" data-tilt="5" style="--lc:var(--lang-${id});${id === 'javascript' ? '--lc-ink:#3A2E00' : ''}">
      <div class="pcard-cover"><span class="pcard-orvi" data-t="${id}"></span></div><span class="pcard-mono">${UI.esc(UI.byId[id].mono)}</span>
      <h3>${t}</h3><p>${d}</p>
      <div class="pcard-foot"><span class="pbar"><i style="width:${p}%"></i></span><small>${p}%</small></div>
      <button class="btn btn-primary btn-sm" type="button">Lanjut ${now} <i data-lucide="arrow-right"></i></button></article>`).join('');
  $$('.pcard-orvi').forEach(el => Orvi.mount(el, { size: 72, tint: el.dataset.t, poke: true }));
  FX.icons($('#pathCards')); FX.wire($('#pathCards'));
  UI.phaseRing($('#ndRing'), { size: 50, stroke: 6, gap: 16, states: ['done', 'now', 'lock', 'lock'], progress: .5 });
  $('#lockNode').addEventListener('click', e => { FX.shake(e.currentTarget); SFX.play('nope'); UI.toast('Bab 3 masih terkunci. Selesaikan Uji di Bab 2 dulu.', { icon: 'lock' }); });

  /* chip bahasa */
  $('#langChips').innerHTML = UI.LANGS.map(l => UI.langChip(l.id)).join('');

  /* cincin */
  UI.phaseRing($('#r1'), { size: 110, states: ['now', 'lock', 'lock', 'lock'], progress: 0, label: '0/4', sub: 'fase' });
  UI.phaseRing($('#r2'), { size: 110, states: ['now', 'lock', 'lock', 'lock'], progress: .6, label: '0/4', sub: 'fase' });
  UI.phaseRing($('#r3'), { size: 110, states: ['done', 'done', 'now', 'lock'], progress: .4, label: '2/4', sub: 'fase' });
  UI.phaseRing($('#r4'), { size: 110, states: ['done', 'done', 'done', 'done'], label: '4/4', sub: 'selesai' });

  /* kuis */
  const qOrvi = Orvi.mount($('#quizOrvi'), { size: 56, tint: 'python', side: 'left' });
  $('#quizCode').innerHTML = UI.codeHTML('a = 10\na = a + 2\nprint(a)', 'python');
  const choices = $$('#choices .choice'), check = $('#checkBtn'), fb = $('#fb');
  let picked = null, locked = false;
  choices.forEach(c => c.addEventListener('click', () => {
    if (locked) return;
    picked = c; choices.forEach(x => x.setAttribute('aria-pressed', String(x === c))); check.disabled = false; SFX.play('tap');
  }));
  function resetQuiz() {
    locked = false; picked = null; check.disabled = true; fb.hidden = true; $('#quizFoot').hidden = false;
    choices.forEach(c => { c.className = 'choice'; c.setAttribute('aria-pressed', 'false'); c.querySelector('.mark')?.remove(); });
    qOrvi.mood('idle');
  }
  check.addEventListener('click', () => {
    if (!picked) return;
    locked = true; const ok = picked.dataset.ok === '1';
    picked.classList.add(ok ? 'is-right' : 'is-wrong');
    picked.insertAdjacentHTML('beforeend', `<span class="mark">${ok ? '✓ Benar' : '× Belum'}</span>`);
    $('#quizFoot').hidden = true; fb.hidden = false;
    fb.className = 'feedback ' + (ok ? 'is-ok' : 'is-bad');
    fb.querySelector('.fb-icon').innerHTML = `<i data-lucide="${ok ? 'check' : 'x'}"></i>`;
    $('#fbTitle').textContent = ok ? 'Mantap!' : 'Belum tepat, tidak apa-apa.';
    $('#fbText').innerHTML = ok ? 'Baris 2 mengganti <code>a</code> dengan 10 + 2, jadi yang dicetak 12.' : 'Lihat baris 2: nilai <code>a</code> diubah dulu sebelum dicetak.';
    const b = $('#fbBtn'); b.className = 'btn ' + (ok ? 'btn-ok' : 'btn-bad'); b.textContent = ok ? 'Lanjut' : 'Coba lagi';
    FX.icons(fb);
    if (FX.level() !== 'off') gsap.from(fb, { y: 18, opacity: 0, duration: .4, ease: 'back.out(2)' });
    if (ok) { FX.burstAt(picked); giveXp(picked, 10); qOrvi.react('cheer', 1500); SFX.play('ok'); }
    else {
      FX.shake(picked); qOrvi.oops(); SFX.play('nope');
      setTimeout(() => qOrvi.point($('#quizCode .lc[data-line="2"]'), { at: 'left' }), 500);
      setTimeout(() => UI.toast('Soal serupa ditambahkan. Satu latihan ekstra untuk konsep ini.', { tone: 'sun', icon: 'plus' }), 900);
    }
  });
  $('#fbBtn').addEventListener('click', resetQuiz);
  $('#hintBtn').addEventListener('click', () => { qOrvi.say('Lihat baris 2: nilai a berubah dulu.', { ms: 2600 }); qOrvi.point($('#quizCode .lc[data-line="2"]'), { at: 'left' }); });

  /* toast */
  $$('[data-toast]').forEach(b => b.addEventListener('click', () => {
    const t = b.dataset.toast;
    if (t === 'ok') UI.toast('Tersimpan otomatis.', { tone: 'ok' });
    if (t === 'bad') UI.toast('Gagal memuat. Periksa koneksi, lalu coba lagi.', { tone: 'bad', icon: 'wifi-off' });
    if (t === 'sun') UI.toast('Soal serupa ditambahkan.', { tone: 'sun', icon: 'plus' });
  }));

  /* dialog fase selesai */
  const modal = $('#doneModal');
  let doneOrvi;
  function openDone() {
    modal.hidden = false;
    if (!doneOrvi) doneOrvi = Orvi.mount($('#doneOrvi'), { size: 150, tint: FX.cssVar('--perkuat-fill') });
    UI.phaseRing($('#mdRing'), { size: 84, stroke: 9, states: ['done', 'done', 'lock', 'lock'], label: '2/4', delay: .3 });
    $('#mdAcc').textContent = '0'; $('#mdXp').textContent = '0';
    if (FX.level() !== 'off') {
      gsap.fromTo('.modal-scrim', { opacity: 0 }, { opacity: 1, duration: .3 });
      gsap.fromTo('.modal-card', { y: 40, scale: .85, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: .6, ease: 'back.out(1.8)' });
    }
    setTimeout(() => { doneOrvi.celebrate(); FX.ticker($('#mdAcc'), 88, { from: 0, suffix: '%' }); FX.ticker($('#mdXp'), 75, { from: 0, prefix: '+' }); }, 350);
    $('.modal-card .btn-primary').focus();
  }
  const closeDone = () => { if (modal.hidden) return; if (FX.level() !== 'off') gsap.to('.modal-card', { y: 20, opacity: 0, duration: .2, onComplete: () => (modal.hidden = true) }); else modal.hidden = true; };
  $('#openDone').addEventListener('click', openDone);
  modal.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeDone(); });
  addEventListener('keydown', e => { if (e.key === 'Escape') closeDone(); });

  /* kode */
  $('#kodeLang').innerHTML = UI.langChip('python'); $('#kodeLang2').innerHTML = UI.langChip('cpp');
  $('#kodeOk').innerHTML = UI.codeHTML('skor = 10\nskor = skor + 5\nprint("Skor:", skor)', 'python');
  $('#kodeBad').innerHTML = UI.codeHTML('#include <iostream>\nint main() {\n    const int skor = 10;\n    skor = 25;\n}', 'cpp', { bad: [4] });
  $('#kodeRun').addEventListener('click', async e => {
    const out = $('#kodeOut'); out.innerHTML = '<span class="out-label">Keluaran</span><span class="ok"></span>';
    const s = out.querySelector('.ok'), txt = 'Skor: 15';
    for (let i = 1; i <= txt.length; i++) { s.textContent = txt.slice(0, i); if (FX.level() !== 'off') await wait(35); }
    FX.burstAt(out, { count: 10, speed: 4 }); SFX.play('ok');
  });

  /* Orvi di UI */
  const hOrvi = Orvi.mount($('#hintOrvi'), { size: 64, mood: 'think', tint: 'python' });
  const HINTS = ['Perhatikan baris 2: nilai <code>a</code> diubah sebelum dicetak.', 'Baris 2 menghitung <code>a + 2</code> saat <code>a</code> masih 10.', 'Jawabannya 12, karena <code>a</code> sudah menjadi 12 saat dicetak.'];
  let hl = 0;
  $('#hintNext').addEventListener('click', e => {
    hl = (hl + 1) % HINTS.length;
    $('#hintText').innerHTML = HINTS[hl]; $('#hintLv').textContent = `Petunjuk ${hl + 1} dari 3`;
    e.currentTarget.textContent = hl === 2 ? 'Ulang dari petunjuk 1' : 'Petunjuk berikutnya';
    hOrvi.react(hl === 2 ? 'happy' : 'think', 900); FX.pop($('.hint-body'), 1.02);
  });
  Orvi.mount($('#diagOrvi'), { size: 44, mood: 'think', tint: 'cpp' });
  Orvi.mount($('#emptyOrvi'), { size: 120, mood: 'happy', idle: true, idleMs: 20000 });

  /* gerak & suara */
  const lvl = UI.segmented($('#lvlSeg'), b => FX.setLevel(b.dataset.l));
  const syncLvl = () => { const b = $(`#lvlSeg [data-l="${FX.level()}"]`); b && b.getAttribute('aria-pressed') !== 'true' && lvl.set(b); };
  addEventListener('orv:motion', syncLvl); syncLvl();
  const snd = $('#sndBtn');
  const syncSnd = () => { snd.querySelector('span').textContent = SFX.enabled ? 'Matikan suara' : 'Nyalakan suara'; $('#swSound').setAttribute('aria-checked', String(SFX.enabled)); };
  snd.addEventListener('click', () => { SFX.toggle(); syncSnd(); });
  addEventListener('orv:sound', syncSnd); syncSnd();
  const tOrvi = Orvi.mount($('#tryOrvi'), { size: 64, side: 'left' });
  $('#tryOk').addEventListener('click', e => { FX.burstAt(e.currentTarget); tOrvi.react('happy', 1200); SFX.play('ok'); giveXp(e.currentTarget, 5); });
  $('#tryBad').addEventListener('click', e => { FX.shake(e.currentTarget); tOrvi.oops(); SFX.play('nope'); });
  $('#tryDone').addEventListener('click', openDone);

  window.MOCK = {
    states: [{ id: 'default', label: 'Awal' }, { id: 'done', label: 'Dialog fase selesai' }, { id: 'wrong', label: 'Kuis · jawaban salah' }, { id: 'right', label: 'Kuis · jawaban benar' }],
    onState(id) {
      if (id === 'done') openDone();
      if (id === 'wrong' || id === 'right') { $('#umpan').scrollIntoView(); choices[id === 'right' ? 1 : 0].click(); check.click(); }
      if (id === 'default') location.search = '';
    },
  };
})();
