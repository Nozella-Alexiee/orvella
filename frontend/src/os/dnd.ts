/* Seret-lepas di Orvella OS (pointer events, bukan drag bawaan browser):
   draggable(el, () => data)  ·  target(el, ['proyek'], fn, {hint})
   Dipakai untuk ikon proyek → dock (buka/terbitkan), chip widget → Beranda, tab → bagi editor.
   Berkas sungguhan dari komputer memakai drag-and-drop HTML5 di Sandbox. */
import { gsap } from 'gsap';
import { motion, ring, sound } from '../fx';
import { emit } from './bus';

export type DragData = { type: string; label: string; [k: string]: unknown };
type Target = { types: string[]; fn: (d: DragData, e: PointerEvent) => void; hint?: string | ((d: DragData) => string) };
const targets = new Map<Element, Target>();
let active: { src: Element } | null = null;

export function target(el: Element, types: string[], fn: Target['fn'], o: { hint?: Target['hint'] } = {}): () => void {
  targets.set(el, { types, fn, hint: o.hint });
  (el as HTMLElement).dataset.drop = types.join(' ');
  return () => { targets.delete(el); delete (el as HTMLElement).dataset.drop; };
}

function find(x: number, y: number, type: string): Element | null {
  for (const n of document.elementsFromPoint(x, y)) {
    const t = n.closest('[data-drop]');
    if (t && t !== active?.src && targets.get(t)?.types.includes(type)) return t;
  }
  return null;
}

let hintEl: HTMLDivElement | null = null;
function hint(text: string | null, e?: PointerEvent) {
  if (!text) { hintEl?.remove(); hintEl = null; return; }
  if (!hintEl) { hintEl = document.createElement('div'); hintEl.className = 'os-dnd-hint'; document.body.appendChild(hintEl); }
  hintEl.textContent = text;
  if (e) { hintEl.style.left = e.clientX + 16 + 'px'; hintEl.style.top = e.clientY + 18 + 'px'; }
}

/** Jadikan elemen bisa diseret. onNoTarget: dilepas di tempat kosong (return true = sudah ditangani). */
export function draggable(el: HTMLElement, getData: () => DragData | null, o: { onNoTarget?: (d: DragData, e: PointerEvent, ghost: HTMLElement) => boolean } = {}): () => void {
  const onDragStart = (e: Event) => e.preventDefault(); // gambar di dalamnya jangan memicu seret bawaan
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || matchMedia('(max-width: 760px)').matches) return;
    const sx = e.clientX, sy = e.clientY;
    let started = false, over: Element | null = null, ghost: HTMLElement | null = null, data: DragData | null = null, ox = 0, oy = 0;
    const move = (ev: PointerEvent) => {
      if (!started) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 7) return;
        data = getData(); if (!data) return cleanup();
        started = true;
        const r = el.getBoundingClientRect(); ox = sx - r.left; oy = sy - r.top;
        ghost = el.cloneNode(true) as HTMLElement;
        ghost.classList.add('os-dnd-ghost'); ghost.removeAttribute('id');
        Object.assign(ghost.style, { width: r.width + 'px', height: r.height + 'px' });
        document.body.appendChild(ghost);
        active = { src: el };
        el.classList.add('os-dnd-src');
        document.documentElement.classList.add('os-dnd', `os-dragging-${data.type}`);
        emit('dnd:start', { type: data.type });
        sound('tap');
        if (motion() !== 'off') gsap.fromTo(ghost, { scale: 1 }, { scale: 1.06, rotate: -3, duration: .2, ease: 'back.out(2)' });
      }
      if (!ghost || !data) return;
      ghost.style.left = ev.clientX - ox + 'px'; ghost.style.top = ev.clientY - oy + 'px';
      const t = find(ev.clientX, ev.clientY, data.type);
      if (t !== over) {
        over?.classList.remove('is-drop-hover');
        over = t;
        if (over) {
          over.classList.add('is-drop-hover'); sound('tick');
          const h = targets.get(over)?.hint;
          hint(h ? (typeof h === 'function' ? h(data) : h) : null, ev);
        } else hint(null);
      } else if (over) hint(hintEl?.textContent || null, ev);
    };
    const up = (ev: PointerEvent) => {
      cleanup();
      if (!started || !ghost || !data) return;
      const g = ghost, d = data, t = over;
      t?.classList.remove('is-drop-hover'); hint(null);
      const done = () => { g.remove(); el.classList.remove('os-dnd-src'); };
      if (t) {
        sound('drop');
        const r = t.getBoundingClientRect();
        if (motion() !== 'off') gsap.to(g, { left: r.left + r.width / 2 - g.offsetWidth / 2, top: r.top + r.height / 2 - g.offsetHeight / 2, scale: .2, opacity: 0, duration: .3, ease: 'power2.in', onComplete: done });
        else done();
        ring(ev.clientX, ev.clientY);
        targets.get(t)!.fn(d, ev);
      } else if (o.onNoTarget?.(d, ev, g)) done();
      else {
        const r = el.getBoundingClientRect();
        if (motion() !== 'off') gsap.to(g, { left: r.left, top: r.top, rotate: 0, scale: 1, duration: .45, ease: 'elastic.out(1, .6)', onComplete: done }); else done();
      }
      document.documentElement.classList.remove('os-dnd', `os-dragging-${d.type}`);
      emit('dnd:end', { type: d.type, dropped: !!t });
      active = null;
      // klik setelah menyeret tidak boleh ikut membuka
      const block = (ce: Event) => { ce.stopPropagation(); ce.preventDefault(); };
      el.addEventListener('click', block, { capture: true, once: true });
      window.setTimeout(() => el.removeEventListener('click', block, { capture: true }), 60);
    };
    const cleanup = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  };
  el.addEventListener('dragstart', onDragStart);
  el.addEventListener('pointerdown', onDown);
  return () => { el.removeEventListener('dragstart', onDragStart); el.removeEventListener('pointerdown', onDown); };
}
