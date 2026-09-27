import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useApi } from '../api/hooks';
import { Icon } from '../design/Icon';
import { LangIcon } from '../design/LangIcon';
import { toast } from '../design/toast';
import { cx, LoadError, Skel, Switch } from '../design/ui';

type Lang = { id: string; name: string; enabled: boolean; available: boolean; version: string; compiled: boolean; timeout: number | null; memory: number | null;
  default_timeout: number | null; default_memory: number | null };
type Runtime = { runner: boolean; configured: boolean; queue: { active: number; waiting: number; slots: number; done: number } | null;
  sessions: { active: number; max: number; idle_minutes: number; items: { sid: string; owner: number; stack: string; since: number; idle: number }[] } | null;
  limits: { max_run_timeout: number; max_memory_mb: number; max_concurrency: number } | null; langs: Lang[] };

const css = `
.rt-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.rt-kpi { padding: 18px 20px; border-radius: 18px; background: var(--surface); border: 1px solid var(--border); }
.rt-table td, .rt-table th { vertical-align: middle; }
.rt-table input { width: 84px; height: 34px; }
.rt-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; background: var(--danger); }
.rt-dot.is-ok { background: var(--success); box-shadow: 0 0 0 4px var(--success-soft); }
@media (max-width: 1100px) { .rt-kpis { grid-template-columns: 1fr 1fr; } }
`;

/** Admin → Runtime: runner health, queue, workspace sessions, and per-language switches and limits. */
export default function RuntimePage() {
  const [versions, setVersions] = useState(false);
  const q = useApi<Runtime>(`/api/admin/runtime${versions ? '?versions=true' : ''}`, { refetchInterval: 5000 });
  const [draft, setDraft] = useState<Record<string, { enabled: boolean; timeout: string; memory: string }>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!q.data || Object.keys(draft).length) return;
    setDraft(Object.fromEntries(q.data.langs.map(l => [l.id, { enabled: l.enabled, timeout: l.timeout ? String(l.timeout) : '', memory: l.memory ? String(l.memory) : '' }])));
  }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/api/admin/runtime', {
        disabled: Object.entries(draft).filter(([, v]) => !v.enabled).map(([k]) => k),
        timeout: Object.fromEntries(Object.entries(draft).filter(([, v]) => v.timeout).map(([k, v]) => [k, Number(v.timeout)])),
        memory: Object.fromEntries(Object.entries(draft).filter(([, v]) => v.memory).map(([k, v]) => [k, Number(v.memory)])),
      });
      toast({ kind: 'success', icon: 'check', title: 'Pengaturan runtime disimpan' });
      q.refetch();
    } catch (e) { toast({ kind: 'danger', icon: 'circle-alert', title: 'Gagal menyimpan', body: e instanceof ApiError ? e.message : '' }); }
    finally { setSaving(false); }
  };

  if (q.error) return <div className="page page-wide"><LoadError onRetry={() => q.refetch()} /></div>;
  if (!q.data) return <div className="page page-wide"><Skel h={44} w={380} /><Skel h={110} r={18} className="mt-6" /><Skel h={420} r={16} className="mt-4" /></div>;
  const d = q.data;
  const set = (id: string, patch: Partial<{ enabled: boolean; timeout: string; memory: string }>) => setDraft(x => ({ ...x, [id]: { ...x[id], ...patch } }));
  return (
    <div className="page page-wide">
      <style>{css}</style>
      <div className="page-head"><div><div className="eyebrow">Admin · Sistem</div><h1 className="big-serif mt-2" style={{ fontSize: 40 }}>Runtime <em>kode</em></h1>
        <p className="t-muted mt-2">Semua kode siswa berjalan di container sandbox tanpa internet, dengan batas waktu, memori, dan jumlah proses.</p></div>
        <div className="row gap-2"><button className="btn btn-secondary btn-press" onClick={() => setVersions(true)} disabled={versions}><Icon name="refresh-cw" />Cek versi</button>
          <button className={cx('btn btn-primary btn-press', saving && 'is-loading')} onClick={save}><Icon name="save" />Simpan</button></div></div>

      <div className="rt-kpis">
        <div className="rt-kpi"><span className="eyebrow">Runner</span><div className="row gap-2 mt-3" style={{ alignItems: 'center' }}><span className={cx('rt-dot', d.runner && 'is-ok')} /><b>{d.runner ? 'Tersambung' : d.configured ? 'Tidak menjawab' : 'Belum diatur'}</b></div>
          <div className="t-xs t-faint mt-2">{d.limits ? `maks ${d.limits.max_run_timeout} dtk · ${d.limits.max_memory_mb} MB` : 'JavaScript tetap jalan di server lokal'}</div></div>
        <div className="rt-kpi"><span className="eyebrow">Antrean</span><div className="stat-value mt-2">{d.queue ? d.queue.active : '–'}<small>/ {d.queue?.slots ?? '–'} jalan</small></div><div className="t-xs t-faint mt-2">{d.queue ? `${d.queue.waiting} menunggu` : ''}</div></div>
        <div className="rt-kpi"><span className="eyebrow">Program dijalankan</span><div className="stat-value mt-2">{d.queue?.done ?? '–'}</div><div className="t-xs t-faint mt-2">sejak runner menyala</div></div>
        <div className="rt-kpi"><span className="eyebrow">Proyek web aktif</span><div className="stat-value mt-2">{d.sessions?.active ?? '–'}<small>/ {d.sessions?.max ?? '–'}</small></div><div className="t-xs t-faint mt-2">{d.sessions ? `mati otomatis setelah ${d.sessions.idle_minutes} menit diam` : ''}</div></div>
      </div>

      <section className="card mt-4" style={{ overflow: 'hidden' }}>
        <div className="p-5 row between"><h2 className="t-h3">Bahasa</h2><span className="t-xs t-faint">kosongkan batas untuk memakai bawaan</span></div>
        <div style={{ overflowX: 'auto' }}><table className="table rt-table"><thead><tr><th>Bahasa</th><th>Image</th><th>Versi</th><th>Aktif</th><th>Batas waktu (dtk)</th><th>Memori (MB)</th></tr></thead><tbody>
          {d.langs.map(l => (
            <tr key={l.id}>
              <td><span className="row gap-2" style={{ alignItems: 'center' }}><LangIcon id={l.id} size={22} /><b>{l.name}</b>{l.compiled && <span className="badge">kompilasi</span>}</span></td>
              <td>{l.available ? <span className="badge badge-success">siap</span> : <span className="badge badge-danger">belum dibangun</span>}</td>
              <td className="t-sm t-mono t-muted">{l.version || (versions ? '…' : '–')}</td>
              <td><Switch checked={draft[l.id]?.enabled ?? l.enabled} onChange={v => set(l.id, { enabled: v })} label={`${l.name} aktif`} /></td>
              <td><input className="input" inputMode="decimal" placeholder={String(l.default_timeout ?? '')} value={draft[l.id]?.timeout ?? ''} onChange={e => set(l.id, { timeout: e.target.value.replace(/[^\d.]/g, '') })} /></td>
              <td><input className="input" inputMode="numeric" placeholder={String(l.default_memory ?? '')} value={draft[l.id]?.memory ?? ''} onChange={e => set(l.id, { memory: e.target.value.replace(/\D/g, '') })} /></td>
            </tr>
          ))}
        </tbody></table></div>
      </section>

      {d.sessions && d.sessions.items.length > 0 && (
        <section className="card mt-4 card-pad">
          <h2 className="t-h3">Proyek web yang sedang jalan</h2>
          <div className="stack gap-2 mt-3">
            {d.sessions.items.map(s => <div key={s.sid} className="row between t-sm"><span className="t-mono">{s.sid} · {s.stack}</span><span className="t-muted">jalan {Math.round(s.since / 60)} mnt · diam {Math.round(s.idle / 60)} mnt</span></div>)}
          </div>
        </section>
      )}
    </div>
  );
}
