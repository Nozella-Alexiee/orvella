/* Log aktivitas (cuma superadmin): siapa mengubah peran, kelas, batas Orvi AI, setelan, plus kejadian keamanan. */
import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Icon } from '../design/Icon';
import { LoadError, Skel } from '../design/ui';

type Item = { id: number; at: string | null; action: string; actor: string; text: string };
type Page = { items: Item[]; more: boolean };

const ICON: Record<string, string> = {
  'user.create': 'user-plus', 'user.role': 'shield-alert', 'user.class': 'users', 'user.ai_limit': 'bot', 'ai.settings': 'bot',
  'class.create': 'users', 'runtime.update': 'cpu', 'os.settings': 'settings', 'server.role': 'server', 'login.locked': 'lock',
  'password.reset': 'lock', 'password.change': 'lock',
};
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–');

export default function LogPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async (before?: number) => {
    setBusy(true);
    try {
      const p = await api.get<Page>(`/api/admin/log${before ? `?sebelum=${before}` : ''}`);
      setItems(prev => (before && prev ? [...prev, ...p.items] : p.items)); setMore(p.more); setErr('');
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Gagal memuat log.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, []);
  if (err && !items) return <div className="page page-wide"><LoadError onRetry={() => void load()} /></div>;
  return (
    <div className="page page-wide">
      <div className="page-head"><div><div className="eyebrow">Sistem</div><h1 className="big-serif mt-2" style={{ fontSize: 40 }}>Log <em>aktivitas</em></h1>
        <p className="t-muted mt-2">Perubahan peran, kelas, batas Orvi AI, setelan, dan kejadian keamanan. Cuma superadmin yang bisa lihat.</p></div></div>
      {!items ? <Skel h={320} r={16} /> : (
        <section className="card" style={{ overflow: 'hidden' }}>
          {items.length === 0 ? <p className="p-5 t-muted">Belum ada aktivitas.</p> : (
            <table className="table"><thead><tr><th style={{ width: 150 }}>Waktu</th><th style={{ width: 160 }}>Oleh</th><th>Kejadian</th></tr></thead><tbody>
              {items.map(i => (
                <tr key={i.id}><td className="t-sm t-muted">{when(i.at)}</td><td className="t-sm">{i.actor}</td>
                  <td><span className="row gap-2"><Icon name={ICON[i.action] || 'history'} size={14} />{i.text}</span></td></tr>
              ))}
            </tbody></table>
          )}
          {more && <div className="p-5"><button className={`btn btn-secondary btn-sm${busy ? ' is-loading' : ''}`} onClick={() => void load(items[items.length - 1]?.id)}>Muat lagi</button></div>}
        </section>
      )}
    </div>
  );
}
