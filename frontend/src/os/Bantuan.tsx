/* Angkat tangan: tombol untuk siswa (Sandbox, Perkuat, Uji) dan antrian bantuan untuk mentor.
   Status berubah realtime lewat kanal presence (pesan 'help'). */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { api, ApiError } from '../api/client';
import { useApi, useMe } from '../api/hooks';
import { Icon } from '../design/Icon';
import { toast } from '../design/toast';
import { pop, sound } from '../fx';
import { presence } from './presence';

export type HelpReq = {
  id: number; state: 'open' | 'taken' | 'done'; context: string; context_label: string; ref: string; message: string; ago: string;
  learner: { id: number; name: string; initials: string } | null; mentor: { id: number; name: string } | null;
};
const first = (n?: string) => (n || 'Mentor').split(' ')[0];

function useHelpEvents(fn: (m: { ev: string; request: HelpReq }) => void) {
  const ref = useRef(fn); ref.current = fn;
  useEffect(() => {
    const f = (e: Event) => { const m = (e as CustomEvent<{ t: string; ev: string; request: HelpReq }>).detail; if (m?.t === 'help') ref.current(m); };
    addEventListener('orvella:rt', f);
    return () => removeEventListener('orvella:rt', f);
  }, []);
}

/** Tombol siswa. refPath = halaman yang sedang dibuka (mentor diarahkan ke sana). */
export function HelpButton({ context, refPath, className = '' }: { context: 'sandbox' | 'perkuat' | 'uji'; refPath: string; className?: string }) {
  const { data: me } = useMe();
  const q = useApi<{ request: HelpReq | null }>(me?.role === 'learner' ? '/api/bantuan/saya' : null);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const btn = useRef<HTMLButtonElement>(null), box = useRef<HTMLDivElement>(null);
  useHelpEvents(m => {
    void q.refetch();
    if (m.ev === 'taken') { sound('pop'); toast({ kind: 'success', icon: 'hand', title: `${first(m.request.mentor?.name)} sedang melihat`, body: 'Mentormu membuka pekerjaanmu sekarang.' }); }
    if (m.ev === 'done') toast({ icon: 'hand', title: 'Bantuan selesai', body: `${first(m.request.mentor?.name)} menandai permintaanmu selesai.` });
  });
  useEffect(() => {
    if (!open) return;
    const k = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', k); return () => document.removeEventListener('mousedown', k);
  }, [open]);
  if (me?.role !== 'learner') return null;
  const r = q.data?.request;
  const send = async () => {
    setBusy(true);
    try { await api.post('/api/bantuan', { context, ref: refPath, message: msg }); setOpen(false); setMsg(''); sound('ok'); pop(btn.current); void q.refetch(); }
    catch (e) { toast({ kind: 'danger', icon: 'hand', title: 'Belum terkirim', body: e instanceof ApiError ? e.message : 'Coba lagi.' }); void q.refetch(); }
    finally { setBusy(false); }
  };
  const lower = async () => { if (r) await api.del(`/api/bantuan/${r.id}`).catch(() => {}); setOpen(false); void q.refetch(); };
  const label = !r ? 'Angkat tangan' : r.state === 'taken' ? `${first(r.mentor?.name)} sedang melihat` : `Menunggu ${first(r.mentor?.name)}…`;
  return (
    <span className={`hb ${className}`}>
      <button ref={btn} className={`btn btn-sm hb-btn${r ? ` is-${r.state}` : ''}`} onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <Icon name="hand" /><span>{label}</span></button>
      {open && (
        <div ref={box} className="hb-pop" role="dialog" aria-label="Angkat tangan">
          {!r ? <>
            <b>Minta bantuan mentor</b>
            <p>Mentormu dapat pemberitahuan dan bisa langsung membuka {context === 'sandbox' ? 'kodemu' : 'soal ini'}.</p>
            <textarea value={msg} onChange={e => setMsg(e.target.value)} maxLength={300} rows={3} placeholder="Opsional: kamu macet di mana?" autoFocus />
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void send()}><Icon name="hand" />Angkat tangan</button>
          </> : <>
            <b>{r.state === 'taken' ? `${first(r.mentor?.name)} sedang membantu` : 'Tanganmu terangkat'}</b>
            <p>{r.context_label} · {r.ago}{r.message ? ` · "${r.message}"` : ''}</p>
            <button className="btn btn-sm" onClick={() => void lower()}>{r.state === 'taken' ? 'Sudah beres, makasih' : 'Turunkan tangan'}</button>
          </>}
        </div>
      )}
    </span>
  );
}

/** Kartu "Kelas live" untuk mentor: antrian angkat tangan realtime. */
export function HelpQueue() {
  const nav = useNavigate();
  const q = useApi<{ open: HelpReq[]; done: HelpReq[] }>('/api/bantuan', { refetchInterval: 20_000 });
  useEffect(() => { presence.start(false); }, []);  // halaman mentor tidak memakai Orvella OS: sambungkan presence di sini
  useHelpEvents(m => { void q.refetch(); if (m.ev === 'new') { sound('pop'); toast({ icon: 'hand', title: `${first(m.request.learner?.name)} angkat tangan`, body: `${m.request.context_label}${m.request.message ? `: ${m.request.message}` : ''}` }); } });
  const go = (r: HelpReq) => nav(r.context === 'sandbox' ? r.ref : `/mentor/siswa/${r.learner?.id}`);
  const take = async (r: HelpReq) => { try { await api.post(`/api/bantuan/${r.id}/ambil`); go(r); } catch { void q.refetch(); } };
  const done = async (r: HelpReq) => { await api.post(`/api/bantuan/${r.id}/selesai`).catch(() => {}); void q.refetch(); };
  const list = q.data?.open || [];
  return (
    <section className="hq card">
      <div className="hq-head"><Icon name="hand" /><b>Kelas live · angkat tangan</b><span className={`hq-n${list.length ? ' on' : ''}`}>{list.length}</span></div>
      {list.length ? list.map(r => (
        <div key={r.id} className={`hq-row is-${r.state}`}>
          <span className="hq-av">{r.learner?.initials}</span>
          <div className="grow"><b>{r.learner?.name}</b><small>{r.context_label} · {r.ago}{r.state === 'taken' ? ` · dibantu ${first(r.mentor?.name)}` : ''}</small>{r.message && <p>"{r.message}"</p>}</div>
          {r.state === 'open' ? <button className="btn btn-primary btn-sm" onClick={() => void take(r)}><Icon name="hand" />Bantu</button>
            : <><button className="btn btn-sm" onClick={() => go(r)}>Buka</button><button className="btn btn-sm btn-ghost" onClick={() => void done(r)}>Selesai</button></>}
        </div>
      )) : <p className="hq-empty">Belum ada yang angkat tangan. Siswa bisa minta bantuan dari Sandbox, Perkuat, dan Uji.</p>}
    </section>
  );
}
