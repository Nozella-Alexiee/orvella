/* Batas Orvi AI untuk semua orang: N pertanyaan per jendela waktu bergulir. Cuma superadmin yang bisa ubah;
   batas per orang diatur di halaman Pengguna. Superadmin sendiri selalu tanpa batas. */
import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useApi } from '../api/hooks';
import { Icon } from '../design/Icon';
import { toast } from '../design/toast';

type Ai = { limit: number; window_hours: number; editable: boolean; max_limit: number; max_window: number };

export function AiLimitCard() {
  const q = useApi<Ai>('/api/admin/ai');
  const [f, setF] = useState({ limit: '', window_hours: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data) setF({ limit: String(q.data.limit), window_hours: String(q.data.window_hours) }); }, [q.data]);
  const d = q.data;
  if (!d) return null;
  const dirty = f.limit !== String(d.limit) || f.window_hours !== String(d.window_hours);
  const save = async () => {
    setBusy(true);
    try {
      await api.put<Ai>('/api/admin/ai', { limit: Number(f.limit), window_hours: Number(f.window_hours) });
      await q.refetch();
      toast({ kind: 'success', icon: 'check', title: 'Batas Orvi AI disimpan', ms: 1800 });
    } catch (e) { toast({ kind: 'danger', icon: 'circle-alert', title: 'Belum tersimpan', body: e instanceof ApiError ? e.message : 'Coba lagi.' }); }
    finally { setBusy(false); }
  };
  return (
    <section className="card card-pad mt-4">
      <div className="row between"><h2 className="t-h3 row gap-2"><Icon name="orvi-ai" />Orvi AI</h2><span className="t-xs t-faint">berlaku begitu Orvi AI aktif</span></div>
      <div className="row between gap-4 mt-4 wrap">
        <div style={{ maxWidth: '60ch' }}><b>Batas pertanyaan</b>
          <p className="t-sm t-muted">Tiap orang dapat sejumlah pertanyaan per jendela waktu. Hitungannya mulai dari pertanyaan pertama, lalu balik penuh setelah jendelanya lewat. Batas per orang bisa diatur di halaman Pengguna. Superadmin selalu tanpa batas.</p></div>
        {d.editable ? (
          <form className="row gap-2" onSubmit={e => { e.preventDefault(); void save(); }}>
            <input className="input" style={{ width: 84 }} type="number" min={0} max={d.max_limit} value={f.limit} onChange={e => setF({ ...f, limit: e.target.value })} aria-label="Jumlah pertanyaan" />
            <span className="t-sm t-muted">pertanyaan tiap</span>
            <input className="input" style={{ width: 70 }} type="number" min={1} max={d.max_window} value={f.window_hours} onChange={e => setF({ ...f, window_hours: e.target.value })} aria-label="Jendela waktu (jam)" />
            <span className="t-sm t-muted">jam</span>
            <button className="btn btn-primary btn-sm" type="submit" disabled={busy || !dirty}><Icon name="check" />Simpan</button>
          </form>
        ) : (
          <div className="stack gap-1" style={{ alignItems: 'flex-end' }}><b className="num">{d.limit} pertanyaan / {d.window_hours} jam</b>
            <span className="t-xs t-faint row gap-1"><Icon name="lock" size={14} />Cuma superadmin yang bisa ubah</span></div>
        )}
      </div>
    </section>
  );
}
