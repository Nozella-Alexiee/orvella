/* Teman sekelas: avatar di menu bar, kartu teman, widget "Online sekarang", dan hujan
   sorakan saat teman menyorakimu. Datanya dari presence.ts (WebSocket per kelas). */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import { Icon } from '../design/Icon';
import { burst, motion, pop, sound } from '../fx';
import { toast } from '../design/toast';
import { api, ApiError } from '../api/client';
import { appLabel, CHEERS, goTo, presence, usePresence, type Friend } from './presence';

const APP_COLOR: Record<string, string> = { sandbox: 'var(--os-mint)', belajar: 'var(--os-violet)', fokus: 'var(--os-violet)', galeri: 'var(--os-pink)',
  musik: 'var(--os-musik)', beranda: 'var(--os-sun)', progres: 'var(--os-sky)', pomodoro: 'var(--os-coral)', duel: 'var(--os-coral)' };
const hue = (id: number) => `hsl(${(id * 67) % 360} 62% 46%)`;

export function Av({ f, size = 30 }: { f: Pick<Friend, 'id' | 'initials' | 'name'>; size?: number }) {
  return <span className="os-av" style={{ width: size, height: size, fontSize: size * .36, background: hue(f.id) }} title={f.name}>{f.initials}</span>;
}

function flyEmoji(emoji: string, from: Element, to: Element, done?: () => void) {
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  if (motion() === 'off') { done?.(); return; }
  const e = document.createElement('span'); e.className = 'os-fly-emoji'; e.textContent = emoji; document.body.appendChild(e);
  const p0 = [a.left + a.width / 2, a.top + a.height / 2], p1 = [b.left + b.width / 2, b.top + b.height / 2];
  gsap.set(e, { xPercent: -50, yPercent: -50, x: p0[0], y: p0[1] });
  const o = { p: 0 };
  gsap.timeline().from(e, { scale: .2, duration: .25, ease: 'back.out(3)' })
    .to(o, { p: 1, duration: .75, ease: 'power2.in', onUpdate: () => {
      const p = o.p, q = 1 - p, cx = (p0[0] + p1[0]) / 2, cy = Math.min(p0[1], p1[1]) - 140;
      gsap.set(e, { x: q * q * p0[0] + 2 * q * p * cx + p * p * p1[0], y: q * q * p0[1] + 2 * q * p * cy + p * p * p1[1], rotation: p * 360, scale: 1 - p * .4 });
    } }).add(() => { e.remove(); done?.(); });
}

export function cheer(f: Friend, emoji: string, fromEl: Element) {
  presence.cheer(f.id, emoji); sound('cheer');
  const to = document.querySelector(`[data-friend="${f.id}"]`) || document.querySelector('.os-mb-friends') || document.body;
  flyEmoji(emoji, fromEl, to, () => { burst(to, { count: 12 }); pop(to); });
  toast({ icon: 'sparkles', title: `Sorakan ${emoji} terkirim`, body: `${f.name.split(' ')[0]} melihatnya di layarnya sekarang.`, ms: 2400 });
}

export function FriendRow({ f, compact }: { f: Friend; compact?: boolean }) {
  const [card, setCard] = useState<DOMRect | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <div className="os-frow" data-friend={f.id}>
      <button ref={btn} className="os-frow-main" onClick={() => setCard(btn.current!.getBoundingClientRect())} aria-label={`${f.name}, ${f.what || appLabel(f.app)}`}>
        <span className="os-fav" style={{ ['--ring' as string]: APP_COLOR[f.app] || 'var(--os-line-2)' }}><Av f={f} size={compact ? 26 : 30} /><i className="os-fdot" /></span>
        <span className="os-fwho"><b>{f.name}{f.live && <span className="os-flive">LIVE</span>}</b><small>{f.live ? `Siaran: ${f.live.title}` : f.what || appLabel(f.app)}</small></span>
      </button>
      {f.live && <button className="os-fwatch" aria-label={`Tonton siaran ${f.name}`} title="Tonton siaran" onClick={() => goTo(`/sandbox/${f.live!.project}?tonton=1`)}><Icon name="tv" /></button>}
      <button className="os-fcheer" aria-label={`Sorak untuk ${f.name}`} title="Sorak" onClick={e => cheer(f, '👏', e.currentTarget)}>👏</button>
      {card && <FriendCard f={f} at={card} close={() => setCard(null)} />}
    </div>
  );
}

async function duel(f: Friend) {
  try { const r = await api.post<{ id: number }>('/api/duel', { lawan: f.id }); sound('whoosh'); goTo(`/duel/${r.id}`); }
  catch (e) {
    const id = e instanceof ApiError && typeof e.detail === 'object' ? (e.detail as { id?: number }).id : undefined;
    if (id) goTo(`/duel/${id}`); else toast({ kind: 'danger', icon: 'swords', title: 'Belum bisa menantang', body: e instanceof ApiError ? e.message : 'Coba lagi.' });
  }
}

function FriendCard({ f, at, close }: { f: Friend; at: DOMRect; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    setTimeout(() => document.addEventListener('mousedown', k)); addEventListener('keydown', esc);
    if (ref.current && motion() !== 'off') gsap.from(ref.current, { y: -8, opacity: 0, scale: .97, duration: .22, ease: 'back.out(1.6)' });
    return () => { document.removeEventListener('mousedown', k); removeEventListener('keydown', esc); };
  }, [close]);
  const left = Math.max(8, Math.min(at.left, innerWidth - 330)), top = Math.min(at.bottom + 8, innerHeight - 260);
  return createPortal(
    <div ref={ref} className="os-fpop os-fcard" role="dialog" aria-label={f.name} style={{ left, top }}>
      <div className="os-fcard-top"><Av f={f} size={52} /><div><b>{f.name}</b><span className="os-fstat" style={{ ['--ring' as string]: APP_COLOR[f.app] || 'var(--os-line-2)' }}>{f.what || appLabel(f.app)}</span></div></div>
      {f.live && <button className="btn btn-sm btn-primary" onClick={() => { close(); goTo(`/sandbox/${f.live!.project}?tonton=1`); }}><Icon name="tv" />Tonton siaran: {f.live.title}</button>}
      <button className="btn btn-sm" onClick={() => { close(); void duel(f); }}><Icon name="swords" />Tantang duel</button>
      <span className="os-eyebrow">Sorak</span>
      <div className="os-fcheers">{CHEERS.map(e => <button key={e} aria-label={`Kirim ${e}`} onClick={ev => cheer(f, e, ev.currentTarget)}>{e}</button>)}</div>
    </div>, document.body);
}

export function FriendsButton() {
  const people = usePresence(s => s.people);
  const connected = usePresence(s => s.connected);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} className="os-mb-item os-mb-friends hide-sm" data-tour="teman" aria-label={`Teman sekelas online: ${people.length}`} aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="os-av-stack">{people.slice(0, 3).map(p => <Av key={p.id} f={p} size={22} />)}</span>
        <span className={`os-fcount${connected ? '' : ' is-off'}`}>{people.length}</span>
      </button>
      {open && <FriendsPop anchor={ref.current!} close={() => setOpen(false)} />}
    </>
  );
}

function FriendsPop({ anchor, close }: { anchor: HTMLElement; close: () => void }) {
  const people = usePresence(s => s.people), hidden = usePresence(s => s.hidden);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node) && !(e.target as Element).closest('.os-fcard')) close(); };
    document.addEventListener('mousedown', k); return () => document.removeEventListener('mousedown', k);
  }, [anchor, close]);
  const r = anchor.getBoundingClientRect();
  return createPortal(
    <div ref={ref} className="os-fpop" role="dialog" aria-label="Teman sekelas" style={{ left: Math.max(8, Math.min(r.left - 120, innerWidth - 350)), top: r.bottom + 8 }}>
      <div className="os-fpop-head"><b>Teman sekelas online</b><span className="os-chip os-chip-mint">{people.length}</span></div>
      <div className="os-fme">
        <div><b>Statusmu</b><small>{hidden ? 'Tersembunyi dari teman' : 'Terlihat oleh teman sekelas'}</small></div>
        <button className="os-switch" role="switch" aria-checked={!hidden} aria-label="Tampilkan statusku" onClick={() => presence.hide(!hidden)} />
      </div>
      <div className="os-flist">{people.length ? people.map(p => <FriendRow key={p.id} f={p} />) : <p className="os-empty-s">Belum ada teman sekelas yang online.</p>}</div>
    </div>, document.body);
}

/** Sorakan dari teman: emoji berhamburan dari menu bar ke layar. */
export function CheerRain() {
  const inc = usePresence(s => s.incoming);
  useEffect(() => {
    if (!inc) return;
    sound('cheer');
    toast({ icon: 'sparkles', title: `${inc.from.name.split(' ')[0]} menyorakimu ${inc.emoji}`, body: 'Klik avatarnya di menu bar untuk membalas.', ms: 3600 });
    if (motion() !== 'full') return;
    const src = (document.querySelector('.os-mb-friends') || document.body).getBoundingClientRect();
    for (let i = 0; i < 12; i++) {
      const e = document.createElement('span'); e.className = 'os-fly-emoji'; e.textContent = inc.emoji; document.body.appendChild(e);
      gsap.set(e, { xPercent: -50, yPercent: -50, x: src.left + src.width / 2, y: src.top + src.height / 2, scale: .4 });
      gsap.to(e, { x: `+=${(Math.random() - .5) * innerWidth * .7}`, y: `+=${innerHeight * (.25 + Math.random() * .45)}`, rotation: (Math.random() - .5) * 540, scale: .8 + Math.random() * .8, duration: 1.4 + Math.random() * .8, ease: 'power2.out', delay: i * .04 });
      gsap.to(e, { opacity: 0, duration: .5, delay: 1.3 + i * .04 + Math.random() * .6, onComplete: () => e.remove() });
    }
  }, [inc?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function TemanWidget() {
  const people = usePresence(s => s.people), feed = usePresence(s => s.feed);
  return (
    <>
      <div className="os-wg-head"><span className="os-eyebrow"><Icon name="users" size={14} />Online sekarang</span><span className="os-chip os-chip-mint more"><i className="os-live-dot" />{people.length} teman</span></div>
      <div className="os-flist os-flist-wg">{people.length ? people.slice(0, 4).map(p => <FriendRow key={p.id} f={p} compact />) : <p className="os-empty-s">Belum ada teman sekelas yang online. Ajak mereka buka Orvella!</p>}</div>
      <div className="os-fticker" aria-live="polite">{feed[0] ? <span>{feed[0].text}</span> : <span className="t-faint">Aktivitas kelas akan muncul di sini.</span>}</div>
    </>
  );
}
