/* Panel "Ngoding bareng" di Sandbox: siapa saja di proyek ini (warna kursornya, berkas yang dibuka, tombol Ikuti),
   undang teman sekelas yang online, tautan undangan, izin edit/lihat, siaran ke kelas, dan chat tim. */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { api, ApiError } from '../api/client';
import { useApi, useMe } from '../api/hooks';
import { Icon } from '../design/Icon';
import { toast } from '../design/toast';
import { sound } from '../fx';
import { usePresence } from '../os/presence';
import type { KAware, KolabState } from './kolab';
import type { Project } from './types';

type Member = { id: number; name: string; initials: string; role: 'edit' | 'view'; online: boolean };
type Info = { members: Member[]; links: { code: string; role: string; expires_at: string }[]; live: boolean; access: string };

const ROLE = { owner: 'pemilik', edit: 'bisa edit', view: 'lihat saja' } as const;

export function KolabPanel({ proj, kol, aware, follow, setFollow }: {
  proj: Project; kol: KolabState; aware: KAware[]; follow: number | null; setFollow: (id: number | null) => void;
}) {
  const { data: me } = useMe();
  const nav = useNavigate();
  const owner = kol.role === 'owner' || proj.access === 'owner';
  const info = useApi<Info>(`/api/sandbox/${proj.id}/kolab`, { enabled: owner });
  const online = usePresence(s => s.people);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [kol.chat.length]);

  const call = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try { const r = await fn(); if (r && typeof r === 'object' && 'members' in r) info.refetch(); if (ok) { sound('ok'); toast({ kind: 'success', icon: 'users', title: ok }); } return r; }
    catch (e) { toast({ kind: 'danger', icon: 'circle-alert', title: 'Belum berhasil', body: e instanceof ApiError ? e.message : 'Coba lagi.' }); return null; }
    finally { setBusy(false); }
  };
  const invite = (uid: number, name: string) => call(() => api.post(`/api/sandbox/${proj.id}/members`, { user_id: uid, role: 'edit' }), `${name.split(' ')[0]} diundang`);
  const link = async () => {
    const r = await call(() => api.post<Info & { code: string }>(`/api/sandbox/${proj.id}/links`, { role: 'edit' })) as (Info & { code: string }) | null;
    if (r?.code) copy(`${location.origin}/s/${r.code}`);
  };
  const copy = (url: string) => { void navigator.clipboard?.writeText(url).then(() => toast({ icon: 'link', title: 'Tautan disalin', body: `${url}<br>Berlaku 24 jam, untuk teman satu sekolah.` })); };
  const live = async (on: boolean) => {
    const r = await call(() => api.post<{ live: boolean }>(`/api/sandbox/${proj.id}/siaran`, { on })) as { live: boolean } | null;
    if (r) { info.refetch(); toast({ kind: on ? 'success' : 'accent', icon: 'radio', title: on ? 'Siaran live dimulai' : 'Siaran berhenti', body: on ? 'Teman sekelas melihat lencana LIVE di avatarmu dan bisa menonton.' : undefined }); }
  };
  const leave = async () => { if (me && await call(() => api.del(`/api/sandbox/${proj.id}/members/${me.id}`))) nav('/sandbox'); };
  const send = (e: React.FormEvent) => { e.preventDefault(); const t = text.trim(); if (!t) return; kol.client?.json({ t: 'chat', text: t }); setText(''); };

  const members = info.data?.members || [];
  const invitable = online.filter(p => !members.some(m => m.id === p.id) && p.id !== me?.id);
  const where = (uid: number) => aware.find(a => a.user?.id === uid)?.file;
  const isLive = kol.live || !!info.data?.live;

  return (
    <div className="kb">
      <div className={`kb-status is-${kol.status}`}>
        <i />{kol.status === 'online' ? `Tersambung · ${kol.peers.length} orang` : kol.status === 'connecting' ? 'Menyambung…' : kol.status === 'offline' ? 'Koneksi putus, menyambung ulang…' : 'Ngoding bareng tidak tersedia'}
        {isLive && <span className="kb-live">LIVE{kol.viewers ? ` · ${kol.viewers} nonton` : ''}</span>}
      </div>

      <div className="kb-sec"><b>Di proyek ini</b>
        {kol.peers.map(p => (
          <div key={p.id} className="kb-peer">
            <span className="kb-av" style={{ background: p.color }}>{p.initials}</span>
            <span className="kb-who"><b>{p.id === me?.id ? `${p.name.split(' ')[0]} (kamu)` : p.name}</b><small>{ROLE[p.role]}{where(p.id) ? ` · ${where(p.id)}` : ''}</small></span>
            {p.id !== me?.id && <button className={`btn btn-sm${follow === p.id ? ' btn-primary' : ''}`} onClick={() => setFollow(follow === p.id ? null : p.id)}>{follow === p.id ? 'Berhenti' : 'Ikuti'}</button>}
          </div>
        ))}
      </div>

      {owner && <>
        <div className="kb-sec"><b>Undang teman sekelas</b>
          {invitable.length ? invitable.slice(0, 6).map(p => (
            <div key={p.id} className="kb-peer"><span className="kb-av">{p.initials}</span><span className="kb-who"><b>{p.name}</b><small>online</small></span>
              <button className="btn btn-sm" disabled={busy} onClick={() => void invite(p.id, p.name)}><Icon name="user-plus" />Undang</button></div>
          )) : <p className="ide-note">Belum ada teman sekelas lain yang online. Pakai tautan di bawah.</p>}
          <button className="btn btn-sm" disabled={busy} onClick={() => void link()}><Icon name="link" />Buat tautan undangan</button>
          {info.data?.links.map(l => (
            <div key={l.code} className="kb-link"><code>/s/{l.code}</code>
              <button className="btn btn-sm btn-ghost" onClick={() => copy(`${location.origin}/s/${l.code}`)} aria-label="Salin tautan"><Icon name="copy" /></button>
              <button className="btn btn-sm btn-ghost" onClick={() => void call(() => api.del(`/api/sandbox/${proj.id}/links/${l.code}`))} aria-label="Cabut tautan"><Icon name="x" /></button></div>
          ))}
        </div>
        {members.length > 0 && <div className="kb-sec"><b>Anggota</b>
          {members.map(m => (
            <div key={m.id} className="kb-peer"><span className="kb-av">{m.initials}</span><span className="kb-who"><b>{m.name}</b><small>{m.online ? 'sedang di sini' : 'tidak di sini'}</small></span>
              <select className="kb-role" value={m.role} aria-label={`Izin ${m.name}`} onChange={e => void call(() => api.patch(`/api/sandbox/${proj.id}/members/${m.id}`, { role: e.target.value }))}>
                <option value="edit">bisa edit</option><option value="view">lihat saja</option></select>
              <button className="btn btn-sm btn-ghost" aria-label={`Keluarkan ${m.name}`} onClick={() => void call(() => api.del(`/api/sandbox/${proj.id}/members/${m.id}`))}><Icon name="x" /></button></div>
          ))}</div>}
        <div className="kb-sec"><b>Siarkan ke kelas</b>
          <p className="ide-note">Teman sekelas bisa menonton kamu ngoding (hanya lihat). Cocok buat demo.</p>
          <button className={`btn btn-sm${isLive ? '' : ' btn-primary'}`} disabled={busy || kol.status !== 'online'} onClick={() => void live(!isLive)}><Icon name="radio" />{isLive ? 'Hentikan siaran' : 'Mulai siaran live'}</button>
        </div>
      </>}
      {!owner && proj.access !== 'view' && kol.role !== 'view' && <button className="btn btn-sm btn-ghost" onClick={() => void leave()}><Icon name="log-out" />Keluar dari proyek ini</button>}

      <div className="kb-sec kb-chat"><b>Chat tim</b>
        <div ref={list} className="kb-msgs">{kol.chat.length ? kol.chat.map((c, i) => (
          <div key={i} className={`kb-msg${c.from.id === me?.id ? ' me' : ''}`}><span style={{ color: c.from.color }}>{c.from.name.split(' ')[0]}</span>{c.text}</div>
        )) : <p className="ide-note">Chat hanya tersimpan selama ada yang membuka proyek ini.</p>}</div>
        <form onSubmit={send} className="kb-send"><input value={text} onChange={e => setText(e.target.value)} maxLength={500} placeholder="Tulis pesan…" aria-label="Pesan chat tim" disabled={kol.status !== 'online'} />
          <button className="btn btn-sm btn-primary" aria-label="Kirim" disabled={!text.trim()}><Icon name="send" /></button></form>
      </div>
    </div>
  );
}
