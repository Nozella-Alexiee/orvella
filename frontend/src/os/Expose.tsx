/* Semua jendela (ala Mission Control): Ctrl+↑, F3, atau tombol di menu bar. Jendela yang kebuka disusun rapi tanpa
   saling tumpuk (cuma transform), lengkap dengan judulnya. Klik satu: dia maju ke depan. Esc atau klik latar: batal. */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import { Icon } from '../design/Icon';
import { motion, sound } from '../fx';
import { appById } from './registry';
import { useWM } from './wm';
import { isPhone } from './Window';
import { SPRING, holdOff, holdOn, lift, pause } from './motion';

type Label = { id: string; x: number; y: number; title: string; icon: string; color: string };
const dur = (full: number, calm: number) => (motion() === 'full' ? full : calm);

export function Expose() {
  const [labels, setLabels] = useState<Label[] | null>(null);
  const [host, setHost] = useState<Element | null>(null);

  useEffect(() => {
    let on = false, els: HTMLElement[] = [];
    const exit = (pickId?: string) => {
      if (!on) return;
      on = false;
      document.documentElement.classList.remove('os-expose');
      els.forEach(n => {
        if (motion() !== 'off') gsap.to(n, { x: 0, y: 0, scale: 1, duration: dur(.4, .2), ease: SPRING, clearProps: 'transform,transformOrigin', onComplete: () => lift(n, false) });
        else { gsap.set(n, { clearProps: 'transform,transformOrigin' }); lift(n, false); }
      });
      els = []; setLabels(null); holdOff(); pause(dur(.4, .2));
      if (pickId) useWM.getState().focus(pickId);
    };
    const enter = () => {
      if (on || isPhone()) return;
      const wrap = document.querySelector('.os-wins'); if (!wrap) return;
      const st = useWM.getState();
      const vis = st.wins.filter(w => !w.min).sort((a, b) => (a.rect.y - b.rect.y) || (a.rect.x - b.rect.x));
      if (!vis.length) return;
      vis.filter(w => w.focusMode).forEach(w => st.setFocusMode(w.id, false));
      const W = wrap.getBoundingClientRect(), pad = 44, gap = 30, lab = 34, n = vis.length;
      const H = W.height - 96, cols = Math.ceil(Math.sqrt(n * (W.width / H) / 1.6)), rows = Math.ceil(n / cols);
      const cw = (W.width - pad * 2 - gap * (cols - 1)) / cols, ch = (H - pad * 2 - (gap + lab) * (rows - 1) - lab) / rows;
      const out: Label[] = [];
      vis.forEach((w, i) => {
        const node = wrap.querySelector<HTMLElement>(`.os-win[data-win="${w.id}"]`); if (!node) return;
        const r = w.max ? { x: 0, y: 0, w: W.width, h: H } : w.rect;
        const row = Math.floor(i / cols), col = i % cols, inRow = row === rows - 1 ? n - cols * (rows - 1) : cols;
        const cx = pad + (cols - inRow) * (cw + gap) / 2 + col * (cw + gap) + cw / 2, cy = pad + row * (ch + gap + lab) + ch / 2;
        const s = Math.min(cw / r.w, ch / r.h, 1);
        node.classList.remove('is-occluded'); lift(node, true); els.push(node);
        const to = { x: cx - (r.x + r.w / 2), y: cy - (r.y + r.h / 2), scale: s, transformOrigin: '50% 50%' };
        if (motion() !== 'off') gsap.to(node, { ...to, duration: dur(.46, .22), ease: SPRING }); else gsap.set(node, to);
        const app = appById(w.app);
        out.push({ id: w.id, x: cx, y: cy + r.h * s / 2 + 10, title: node.querySelector('.os-win-title b')?.textContent || app?.title || '', icon: app?.icon || 'app-window', color: app?.color || 'var(--os-violet)' });
      });
      on = true; holdOn();
      document.documentElement.classList.add('os-expose');
      setHost(wrap); setLabels(out); sound('whoosh');
    };
    const toggle = () => (on ? exit() : enter());
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && on) { e.preventDefault(); exit(); return; }
      if ((e.ctrlKey && e.key === 'ArrowUp') || e.key === 'F3') {
        if ((e.target as Element | null)?.closest?.('.cm-editor, input, textarea')) return;
        e.preventDefault(); toggle();
      }
    };
    const click = (e: MouseEvent) => {
      if (!on) return;
      const w = (e.target as Element).closest<HTMLElement>('.os-win');
      e.preventDefault(); e.stopPropagation();
      exit(w?.dataset.win);
    };
    addEventListener('keydown', key); addEventListener('os:expose', toggle);
    document.addEventListener('click', click, true);
    return () => { exit(); removeEventListener('keydown', key); removeEventListener('os:expose', toggle); document.removeEventListener('click', click, true); };
  }, []);

  useEffect(() => {
    if (!labels?.length || motion() === 'off') return;
    gsap.from('.os-expose', { opacity: 0, duration: .25 });
    gsap.from('.os-expose-label', { opacity: 0, y: 6, duration: .25, delay: dur(.25, .1), stagger: .03 });
  }, [labels]);

  if (!labels || !host) return null;
  return createPortal(<>
    <div className="os-expose" />
    {labels.map(l => <span key={l.id} className="os-expose-label" style={{ left: l.x, top: l.y, ['--app' as string]: l.color }}><i><Icon name={l.icon} /></i>{l.title}</span>)}
  </>, host);
}
