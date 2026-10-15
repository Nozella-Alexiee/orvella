/* Orvi sebagai pemandu hidup:
   - tur pertama (sorotan + Pip mengetuk target), bisa diulang dari menu Bantuan/Spotlight
   - tip saat sebuah app dibuka pertama kali
   - reaksi saat program jalan, error, snapshot, terbit, dan sorakan teman */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import { api } from '../api/client';
import { useMe, useRefreshMe } from '../api/hooks';
import { Orvi } from '../design/Orvi';
import { motion, sound } from '../fx';
import { usePrefs } from '../state/prefs';
import { on } from './bus';
import { dockOrvi } from './Dock';
import { toast } from '../design/toast';

const STEPS = [
  { sel: '[data-tour="dock"]', title: 'Dock', text: 'Semua app ada di sini: Belajar, Sandbox, Galeri, dan Musik. Aku tinggal di tengahnya. Klik aku kapan saja untuk tips.' },
  { sel: '[data-tour="cari"]', title: 'Spotlight', text: 'Tekan Ctrl+K untuk mencari apa saja: app, proyek, bab, teman, bahkan hitungan.' },
  { sel: '[data-tour="widgets"]', title: 'Widget', text: 'Beranda ini milikmu. Klik kanan desktop buat nambah catatan tempel, timer fokus, atau atur widget. Soal Tebak output ganti tiap hari!', pad: 6 },
  { sel: '[data-tour="dock-sandbox"]', title: 'Mode Sandbox', text: 'Bikin proyek bebas di sini tanpa menunggu tugas mentor. Seret ikon proyek dari desktop ke sini untuk membukanya.' },
  { sel: '[data-tour="teman"]', title: 'Teman sekelas', text: 'Teman sekelas yang sedang online. Klik untuk menyoraki mereka.' },
  { sel: '[data-tour="dock-musik"]', title: 'Musik', text: 'Ngoding sambil dengar musik? Sambungkan Spotify atau Apple Music. Lagunya tetap jalan saat kamu pindah jendela.' },
];
const TIPS: Record<string, [string, string | null]> = {
  sandbox: ['Tip: seret berkas dari komputermu ke jendela Sandbox untuk mengimpornya. Ctrl+Enter menjalankan, Ctrl+S menyimpan snapshot.', '.ide-act'],
  belajar: ['Klik bab di peta untuk membukanya. Fase yang sedang kamu kerjakan ditandai cincin warna.', null],
  fokus: ['Mode Fokus: dock dan menu disembunyikan supaya kamu fokus. Tekan Esc kalau mau jadi jendela biasa.', null],
  musik: ['Pilih playlist, lalu masuk di pemutarnya. Mini-player muncul di menu bar.', null],
  galeri: ['Galeri memamerkan proyek teman sekelas. Beri bintang, atau remix untuk menyalinnya ke Sandbox-mu.', null],
};
const visible = (el: Element | null) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* */ } };

export function Guide() {
  const { data: me } = useMe();
  const refresh = useRefreshMe();
  const enabled = usePrefs(s => s.orvi);
  const [tour, setTour] = useState(false);
  useEffect(() => {
    const f = () => setTour(true);
    addEventListener('os:tour', f);
    const done = (me?.prefs as { tour_done?: boolean } | undefined)?.tour_done || read('orvella-tour') === '1';
    const t = !done && me ? window.setTimeout(() => setTour(true), 1600) : 0;
    return () => { removeEventListener('os:tour', f); clearTimeout(t); };
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // tip pertama kali + reaksi
  useEffect(() => {
    if (!enabled) return;
    const offs = [
      on('win:open', ({ app }) => {
        const seen: string[] = JSON.parse(read('orvella-tips') || '[]');
        const tip = TIPS[app];
        if (!tip || seen.includes(app) || tour) return;
        write('orvella-tips', JSON.stringify([...seen, app]));
        window.setTimeout(() => {
          dockOrvi.current?.say(tip[0], { side: 'top', ms: Math.max(3600, tip[0].length * 55) });
          const el = tip[1] && document.querySelector(tip[1]);
          if (el) window.setTimeout(() => dockOrvi.current?.point(el, { at: 'top' }), 900);
        }, motion() === 'off' ? 0 : 800);
      }),
      on('run:ok', () => dockOrvi.current?.react('cheer', 1100)),
      on('run:error', () => dockOrvi.current?.oops()),
      on('snapshot', () => dockOrvi.current?.react('happy', 900)),
      on('publish', () => dockOrvi.current?.celebrate()),
      on('cheer', () => dockOrvi.current?.react('happy', 900)),
    ];
    return () => offs.forEach(f => f());
  }, [enabled, tour]);

  const finish = (done: boolean) => {
    setTour(false); write('orvella-tour', '1');
    void api.patch('/api/me', { prefs: { tour_done: true } }).then(refresh).catch(() => {});
    if (done) { dockOrvi.current?.celebrate(); toast({ icon: 'sparkles', title: 'Tur selesai!', body: 'Coba seret ikon proyek dari desktop ke Sandbox di dock, atau buka Belajar.' }); }
  };
  return tour ? createPortal(<Tour finish={finish} />, document.body) : null;
}

function Tour({ finish }: { finish: (done: boolean) => void }) {
  const steps = STEPS.filter(s => visible(document.querySelector(s.sel)));
  const [i, setI] = useState(0);
  const hole = useRef<HTMLDivElement>(null), card = useRef<HTMLDivElement>(null), next = useRef<HTMLButtonElement>(null);
  const s = steps[i];
  useEffect(() => {
    if (!s) { finish(false); return; }
    const tgt = document.querySelector(s.sel)!, r = tgt.getBoundingClientRect(), pad = s.pad ?? 8;
    const box = { left: r.left - pad, top: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2 };
    const cw = Math.min(380, innerWidth - 24), ch = card.current?.offsetHeight || 180, below = r.top < innerHeight / 2;
    const pos = { left: Math.max(12, Math.min(r.left + r.width / 2 - cw / 2, innerWidth - cw - 12)), top: below ? Math.min(innerHeight - ch - 12, box.top + box.height + 18) : Math.max(12, box.top - ch - 18) };
    if (motion() !== 'off') { gsap.to(hole.current, { ...box, duration: .55, ease: 'power3.inOut' }); gsap.to(card.current, { ...pos, width: cw, duration: .55, ease: 'power3.inOut' }); }
    else { Object.assign(hole.current!.style, { left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px' }); Object.assign(card.current!.style, { left: pos.left + 'px', top: pos.top + 'px', width: cw + 'px' }); }
    sound('tap'); next.current?.focus({ preventScroll: true });
    const t = window.setTimeout(() => dockOrvi.current?.point(tgt, { at: 'top', hold: 500 }), motion() === 'off' ? 0 : 650);
    return () => clearTimeout(t);
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { finish(false); e.preventDefault(); e.stopPropagation(); }
      else if (e.key === 'ArrowRight') { setI(x => (x + 1 >= steps.length ? (finish(true), x) : x + 1)); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { setI(x => Math.max(0, x - 1)); e.preventDefault(); }
    };
    addEventListener('keydown', k, true); return () => removeEventListener('keydown', k, true);
  }, [steps.length, finish]);
  if (!s) return null;
  return (
    <div className="os-tour">
      <div ref={hole} className="os-tour-hole" />
      <div ref={card} className="os-tour-card" role="dialog" aria-label="Tur Orvella" aria-live="polite">
        <span className="os-tour-orvi"><Orvi size={72} mood="happy" follow={false} force /></span>
        <div className="os-tour-txt"><span className="os-eyebrow">Langkah {i + 1} dari {steps.length}</span><b>{s.title}</b><p>{s.text}</p></div>
        <div className="os-tour-foot">
          <div className="os-tour-dots">{steps.map((_, k) => <i key={k} className={k <= i ? 'on' : ''} />)}</div>
          <button className="btn btn-ghost btn-sm" onClick={() => finish(false)}>Lewati</button>
          <button className="btn btn-sm" aria-label="Kembali" disabled={i === 0} onClick={() => setI(x => x - 1)}>Kembali</button>
          <button ref={next} className="btn btn-primary btn-sm" onClick={() => (i + 1 >= steps.length ? finish(true) : setI(i + 1))}>{i + 1 >= steps.length ? 'Selesai' : 'Lanjut'}</button>
        </div>
      </div>
    </div>
  );
}
