import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Icon } from './Icon';
import { Html } from '../lib/html';

export type ToastKind = 'accent' | 'success' | 'warning' | 'danger';
export type ToastAction = { label: string; run: () => void; primary?: boolean };
type Toast = { id: number; kind: ToastKind; icon: string; title: string; body?: string; ms: number; actions?: ToastAction[] };

const useToasts = create<{ items: Toast[]; push: (t: Omit<Toast, 'id' | 'ms'> & { ms?: number }) => void; remove: (id: number) => void }>(set => ({
  items: [],
  // toast yang sama persis tidak ditumpuk (mis. efek yang jalan dua kali di StrictMode)
  push: t => set(s => s.items.some(x => x.title === t.title && x.body === t.body) ? s : { items: [...s.items, { ...t, ms: t.ms ?? 4200, id: Date.now() + Math.random() }] }),
  remove: id => set(s => ({ items: s.items.filter(x => x.id !== id) })),
}));

/** toast({ kind, icon, title, body }) — bottom-right stack, auto-dismiss after 4.2 s. */
export const toast = (t: { kind?: ToastKind; icon?: string; title: string; body?: string; ms?: number; actions?: ToastAction[] }) =>
  useToasts.getState().push({ kind: t.kind || 'accent', icon: t.icon || 'info', title: t.title, body: t.body, ms: t.ms ?? (t.actions?.length ? 9000 : undefined), actions: t.actions });

function ToastItem({ t }: { t: Toast }) {
  const remove = useToasts(s => s.remove);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<number>(0);
  const kill = () => { setLeaving(true); window.setTimeout(() => remove(t.id), 160); };
  useEffect(() => { timer.current = window.setTimeout(kill, t.ms); return () => clearTimeout(timer.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`toast is-${t.kind}${leaving ? ' is-leaving' : ''}`} role="status">
      <Icon name={t.icon} className="toast-icon" />
      <div className="grow"><div className="t-medium">{t.title}</div>{t.body && <Html as="div" className="t-muted t-sm mt-1" html={t.body} />}
        {t.actions?.length ? <div className="toast-acts">{t.actions.map(a => <button key={a.label} className={`btn btn-sm${a.primary ? ' btn-primary' : ''}`} onClick={() => { kill(); a.run(); }}>{a.label}</button>)}</div> : null}</div>
      <button className="btn btn-ghost btn-icon btn-sm" aria-label="Tutup" onClick={kill}><Icon name="x" /></button>
    </div>
  );
}

export function ToastStack() {
  const items = useToasts(s => s.items);
  if (!items.length) return null;
  return <div className="toast-stack" aria-live="polite">{items.map(t => <ToastItem key={t.id} t={t} />)}</div>;
}
