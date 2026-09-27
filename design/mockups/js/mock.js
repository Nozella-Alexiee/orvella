/* =====================================================================
   ORVELLA · mock.js — kontrol KHUSUS MOCKUP (jangan dibangun di produk)
   Dok melayang: pindah halaman, tema, intensitas gerak, suara, state.
   URL: ?theme=light|dark  ?motion=full|calm|off  ?state=…  ?clean=1
   Halaman bisa mendaftarkan state: window.MOCK = { states:[{id,label}], onState(id) }
   ===================================================================== */
(function () {
  'use strict';
  const qs = new URLSearchParams(location.search);
  const PAGES = [
    ['index.html', 'Galeri'], ['brand.html', 'Identitas & Orvi'], ['styleguide.html', 'Komponen'], ['landing.html', 'Landing'],
  ];
  const here = (location.pathname.split('/').pop() || 'index.html');

  function build() {
    const M = window.MOCK || {};
    if (qs.get('state') && M.onState) setTimeout(() => M.onState(qs.get('state')), 60);
    if (qs.get('clean') === '1') return;
    const dock = document.createElement('aside');
    dock.className = 'mock-dock'; dock.setAttribute('aria-label', 'Kontrol mockup');
    let collapsed = false;
    try { collapsed = localStorage.getItem('orv-dock') === '0' || (localStorage.getItem('orv-dock') == null && innerWidth < 720); } catch (e) { collapsed = innerWidth < 720; }
    const seg = (name, opts, cur) => `<div class="md-seg" role="group" aria-label="${name}">${opts.map(([v, l]) => `<button type="button" data-${name}="${v}" aria-pressed="${v === cur}">${l}</button>`).join('')}</div>`;
    const states = (M.states || []).length ? `<label class="md-row"><span>State</span><select id="md-state">${M.states.map(s => `<option value="${s.id}"${qs.get('state') === s.id ? ' selected' : ''}>${s.label}</option>`).join('')}</select></label>` : '';
    dock.innerHTML = `
      <button type="button" class="md-toggle" aria-expanded="${!collapsed}"><span class="md-dot"></span><b>Mockup</b><span class="md-phase">Fase 1</span></button>
      <div class="md-body">
        <nav class="md-pages">${PAGES.map(([h, l]) => `<a href="${h}"${h === here ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
        <div class="md-row"><span>Tema</span>${seg('theme', [['system', 'Sistem'], ['light', 'Terang'], ['dark', 'Malam']], FX.theme())}</div>
        <div class="md-row"><span>Gerak</span>${seg('motion', [['full', 'Penuh'], ['calm', 'Kalem'], ['off', 'Mati']], FX.level())}</div>
        <div class="md-row"><span>Suara</span><button type="button" class="md-sound" aria-pressed="${!!(window.SFX && SFX.enabled)}">${window.SFX && SFX.enabled ? 'Nyala' : 'Mati'}</button></div>
        ${states}
      </div>`;
    dock.classList.toggle('is-collapsed', collapsed);
    document.body.appendChild(dock);
    dock.querySelector('.md-toggle').addEventListener('click', e => {
      collapsed = !collapsed; dock.classList.toggle('is-collapsed', collapsed); e.currentTarget.setAttribute('aria-expanded', String(!collapsed));
      try { localStorage.setItem('orv-dock', collapsed ? '0' : '1'); } catch (err) { /* diabaikan */ }
    });
    dock.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.theme) { FX.setTheme(t.dataset.theme); mark('theme', t.dataset.theme); }
      if (t.dataset.motion) { FX.setLevel(t.dataset.motion); mark('motion', t.dataset.motion); }
      if (t.classList.contains('md-sound') && window.SFX) { const on = SFX.toggle(); t.setAttribute('aria-pressed', String(on)); t.textContent = on ? 'Nyala' : 'Mati'; }
    });
    const sel = dock.querySelector('#md-state');
    if (sel) sel.addEventListener('change', () => { M.onState && M.onState(sel.value); const u = new URL(location.href); u.searchParams.set('state', sel.value); history.replaceState(null, '', u); });
    function mark(k, v) { dock.querySelectorAll(`[data-${k}]`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[k] === v))); }
    addEventListener('orv:theme', e => mark('theme', e.detail));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
