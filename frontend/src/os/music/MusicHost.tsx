/* Tempat pemutar embed tinggal. Iframe tidak pernah dipindah di DOM (dipindah = dimuat
   ulang), jadi host ini diletakkan tepat di atas "slot" pada jendela Musik; saat jendela
   dikecilkan atau ditutup, host digeser keluar layar dan lagu tetap berjalan. */
import { useEffect, useRef } from 'react';
import { controller, spotifyApi, useMusic } from './store';
import { useWM } from '../wm';

export const slot: { el: HTMLElement | null } = { el: null };

export function MusicHost() {
  const cur = useMusic(s => s.current);
  const reload = useMusic(s => s.reload);
  const host = useRef<HTMLDivElement>(null);
  const mount = useRef<HTMLDivElement>(null);
  const win = useWM(s => s.wins.find(w => w.app === 'musik'));

  // ikuti posisi slot (jendela bisa diseret tanpa render ulang, jadi diperiksa tiap frame saat terlihat)
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const h = host.current; if (!h) return;
      const s = slot.el, r = s && s.isConnected ? s.getBoundingClientRect() : null;
      const visible = !!(r && r.width > 40 && win && !win.min);
      if (visible && r) {
        // pemutar melayang di atas jendela: potong bagian yang keluar dari isi jendela (waktu isinya digulir)
        const b = s!.closest('.os-win-body')?.getBoundingClientRect();
        const ct = b ? Math.max(0, b.top - r.top) : 0, cb = b ? Math.max(0, r.bottom - b.bottom) : 0;
        const hidden = ct + cb >= r.height - 4;
        Object.assign(h.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', visibility: hidden ? 'hidden' : 'visible',
          clipPath: ct || cb ? `inset(${ct}px 0 ${cb}px 0)` : '' });
      }
      else Object.assign(h.style, { left: '-10000px', top: '0px', width: '320px', height: '380px', visibility: 'hidden' });
      h.style.zIndex = String(win ? (win.focusMode ? 9000 : win.z) : 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [win]);

  // buat pemutar untuk lagu/playlist terpilih
  useEffect(() => {
    const m = mount.current; if (!m) return;
    m.innerHTML = ''; controller.c?.destroy?.(); controller.c = null;
    useMusic.setState({ ready: false, playing: false });
    if (!cur) return;
    let dead = false;
    const plain = () => {
      const f = document.createElement('iframe');
      f.src = cur.embed_url; f.title = `Pemutar ${cur.provider === 'spotify' ? 'Spotify' : 'Apple Music'}`;
      f.allow = 'autoplay *; encrypted-media *; clipboard-write; fullscreen; picture-in-picture';
      if (cur.provider === 'apple') f.setAttribute('sandbox', 'allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation');
      f.style.cssText = 'width:100%;height:100%;border:0;border-radius:14px';
      m.appendChild(f); useMusic.setState({ ready: true });
    };
    if (cur.provider === 'spotify' && cur.uri) {
      spotifyApi().then(api => {
        if (dead) return;
        if (!api) return plain();
        const box = document.createElement('div'); m.appendChild(box);
        api.createController(box, { uri: cur.uri!, width: '100%', height: '100%' }, c => {
          if (dead) { c.destroy(); return; }
          controller.c = c;
          const f = m.querySelector('iframe'); if (f) { f.style.borderRadius = '14px'; f.setAttribute('allow', 'autoplay *; encrypted-media *; clipboard-write; fullscreen; picture-in-picture'); }
          c.addListener('ready', () => useMusic.setState({ ready: true }));
          c.addListener('playback_update', e => {
            const d = e.data.duration;
            // cuplikan Spotify panjangnya 30 detik; lagu penuh hampir selalu lebih panjang
            useMusic.setState(s => ({ playing: !e.data.isPaused, progress: d ? e.data.position / d : 0, preview: d > 0 ? d <= 30500 : s.preview }));
          });
        });
      });
    } else plain();
    return () => { dead = true; };
  }, [cur?.embed_url, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={host} className="os-music-host" aria-hidden={!win || win.min}><div ref={mount} className="os-music-mount" /></div>;
}
