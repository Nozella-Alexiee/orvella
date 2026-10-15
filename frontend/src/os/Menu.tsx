/* Menu tarik-turun Orvella OS: dipakai menu bar dan klik kanan. Posisinya dijaga tetap di dalam layar
   (di atas titik kalau di bawah tidak muat), bisa dipakai dengan panah atas/bawah, Esc menutup. */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../design/Icon';

export type MenuItem = [icon: string, label: string, run: () => void, kbd?: string] | ['sep'] | ['label', string];

export function Menu({ items, at, close, label }: { items: MenuItem[]; at: DOMRect; close: () => void; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight, pad = 8, cursor = at.height === 0;
    let top = cursor ? at.top : at.bottom + 6;
    if (top + h > innerHeight - pad) top = cursor ? Math.max(pad, innerHeight - h - pad) : Math.max(pad, at.top - h - 6);
    let left = at.left;
    if (left + w > innerWidth - pad) left = Math.max(pad, cursor ? at.left - w : innerWidth - w - pad);
    Object.assign(el.style, { left: left + 'px', top: top + 'px', visibility: 'visible' });
  }, [at]);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    const k = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node) && !(e.target as Element).closest('[data-menu]')) close(); };
    const key = (e: KeyboardEvent) => {
      const bs = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') || [])], i = bs.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'Escape') { close(); e.stopPropagation(); }
      if (e.key === 'ArrowDown') { bs[(i + 1) % bs.length]?.focus(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { bs[(i - 1 + bs.length) % bs.length]?.focus(); e.preventDefault(); }
    };
    const away = () => close();
    document.addEventListener('mousedown', k); addEventListener('keydown', key, true); addEventListener('blur', away); addEventListener('resize', away);
    return () => { document.removeEventListener('mousedown', k); removeEventListener('keydown', key, true); removeEventListener('blur', away); removeEventListener('resize', away); };
  }, [close]);
  return createPortal(
    <div ref={ref} className="os-dropdown" role="menu" aria-label={label} style={{ left: at.left, top: at.bottom, visibility: 'hidden' }} onContextMenu={e => e.preventDefault()}>
      {items.map((it, i) => it[0] === 'sep' ? <div key={i} className="os-dd-sep" /> : it[0] === 'label' ? <div key={i} className="os-dd-label">{it[1]}</div>
        : <button key={i} className="os-dd-item" role="menuitem" onClick={() => { close(); (it[2] as () => void)(); }}><Icon name={it[0]} /><span>{it[1]}</span>{it[3] && <kbd>{it[3]}</kbd>}</button>)}
    </div>, document.body);
}
