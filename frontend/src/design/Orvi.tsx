import { forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties } from 'react';
import { Orvi as Engine } from '../orv/orvi';
import { cssVar } from '../fx';
import { usePrefs } from '../state/prefs';

/* Orvi, maskot Orvella (spesifikasi: design/ORVI.md). Pengganti Nosi.
   - mood: suasana dasar. 'cheer' merayakan sekali lalu tetap senang; 'oops' kaget lalu tetap cemas.
   - bump: angka baru memutar ulang reaksi mood yang sama.
   - ref: say(), point(), carry(), celebrate(), oops(), react() untuk koreografi halaman. */
export type Mood = 'idle' | 'happy' | 'think' | 'focus' | 'oops' | 'sleep' | 'cheer' | '';
export type OrviSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
type Side = 'right' | 'left' | 'top' | 'bottom';
export type OrviHandle = {
  say: (text: string, o?: { ms?: number; side?: Side }) => Promise<void>;
  point: (el: Element | null, o?: { at?: 'tr' | 'left' | 'top' | 'center'; hold?: number }) => Promise<void>;
  carry: (from: Element | null, to: Element | null, o?: { label?: string; onDrop?: () => void }) => Promise<void>;
  celebrate: () => void; oops: () => void; react: (m: Mood, ms?: number) => void; wake: () => void;
};
const SIZES = { xs: 32, sm: 60, md: 96, lg: 150, xl: 220 };
const PHASE_TINT: Record<string, string> = { pahami: '--pahami-fill', perkuat: '--perkuat-fill', kuis: '--kuis-fill', uji: '--uji-fill' };

type Props = { mood?: Mood; size?: OrviSize; bump?: number; tint?: string | null; follow?: boolean; idle?: boolean; side?: Side;
  style?: CSSProperties; className?: string; force?: boolean; label?: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Inst = any;

export const Orvi = forwardRef<OrviHandle, Props>(function Orvi(
  { mood = 'idle', size = 'md', bump = 0, tint, follow = true, idle = false, side = 'right', style, className, force, label }, ref) {
  const host = useRef<HTMLSpanElement>(null);
  const inst = useRef<Inst>(null);
  const show = usePrefs(s => s.orvi) || !!force;
  const px = typeof size === 'number' ? size : SIZES[size];
  const tintValue = tint && PHASE_TINT[tint] ? cssVar(PHASE_TINT[tint]) : tint || null;

  useEffect(() => {
    if (!show || !host.current) return;
    inst.current = Engine.mount(host.current, { size: px, mood: 'idle', tint: tintValue, follow, idle, side });
    return () => { inst.current?.destroy(); inst.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);
  useEffect(() => { inst.current?.size(px); }, [px]);
  useEffect(() => { inst.current?.tint(tintValue); }, [tintValue]);
  useEffect(() => { if (inst.current) inst.current.opts.follow = follow; }, [follow]);
  useEffect(() => {
    const o = inst.current;
    if (!o) return;
    if (mood === 'cheer') { o.mood('happy'); o.celebrate(); }
    else if (mood === 'oops') { o.mood('oops'); o.oops(); }
    else if (mood === 'sleep') o.sleep();
    else o.mood(mood || 'idle');
  }, [mood, bump, show]);

  useImperativeHandle(ref, () => ({
    say: (t, o) => inst.current?.say(t, o) ?? Promise.resolve(),
    point: (el, o) => inst.current?.point(el, o) ?? Promise.resolve(),
    carry: (a, b, o) => inst.current?.carry(a, b, o) ?? Promise.resolve(),
    celebrate: () => inst.current?.celebrate(),
    oops: () => inst.current?.oops(),
    react: (m, ms) => inst.current?.react(m || 'idle', ms),
    wake: () => inst.current?.wake(),
  }), []);

  if (!show) return null;
  return <span ref={host} className={`orvi-host ${className || ''}`} style={{ width: px, height: px, ...style }}
    role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
});
