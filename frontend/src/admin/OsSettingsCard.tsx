/* Setelan Orvella OS untuk admin sekolah: galeri publik, app Musik, dan playlist pilihan sekolah. */
import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useApi } from '../api/hooks';
import { Icon } from '../design/Icon';
import { toast } from '../design/toast';
import { Switch } from '../design/ui';

type Curated = { provider: string; title: string; url: string };
type OsSettings = { gallery_public: boolean; music_enabled: boolean; curated: Curated[] };

export function OsSettingsCard() {
  const q = useApi<OsSettings>('/api/admin/os');
  const [s, setS] = useState<OsSettings | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data) setS(q.data); }, [q.data]);
  if (!s) return null;
  const save = async (patch: Partial<OsSettings>) => {
    const next = { ...s, ...patch };
    setS(next); setBusy(true);
    try { setS(await api.put<OsSettings>('/api/admin/os', patch)); toast({ kind: 'success', icon: 'check', title: 'Setelan Orvella OS disimpan', ms: 1800 }); }
    catch (e) { setS(s); toast({ kind: 'danger', icon: 'settings', title: 'Belum tersimpan', body: e instanceof ApiError ? e.message : 'Coba lagi.' }); }
    finally { setBusy(false); }
  };
  const setItem = (i: number, k: keyof Curated, v: string) => setS({ ...s, curated: s.curated.map((c, j) => (j === i ? { ...c, [k]: v } : c)) });
  return (
    <section className="card card-pad mt-4">
      <div className="row between"><h2 className="t-h3">Orvella OS</h2><span className="t-xs t-faint">berlaku untuk semua siswa</span></div>
      <div className="stack gap-3 mt-4">
        <div className="row between gap-4"><div><b>Galeri publik</b><p className="t-sm t-muted">Siswa bisa menerbitkan proyek Sandbox untuk semua pengguna, bukan hanya teman sekelas.</p></div>
          <Switch checked={s.gallery_public} label="Galeri publik" onChange={v => void save({ gallery_public: v })} /></div>
        <div className="row between gap-4"><div><b>App Musik</b><p className="t-sm t-muted">Pemutar Spotify dan Apple Music resmi di desktop. Orvella tidak melihat akun siswa.</p></div>
          <Switch checked={s.music_enabled} label="App Musik" onChange={v => void save({ music_enabled: v })} /></div>
        <div>
          <b>Playlist pilihan sekolah</b>
          <div className="stack gap-2 mt-2">
            {s.curated.map((c, i) => (
              <div key={i} className="row gap-2">
                <select className="input" style={{ width: 130 }} value={c.provider} onChange={e => setItem(i, 'provider', e.target.value)} aria-label="Layanan">
                  <option value="spotify">Spotify</option><option value="apple">Apple Music</option></select>
                <input className="input" style={{ width: 180 }} value={c.title} onChange={e => setItem(i, 'title', e.target.value)} placeholder="Judul" aria-label="Judul playlist" />
                <input className="input grow" value={c.url} onChange={e => setItem(i, 'url', e.target.value)} placeholder="https://open.spotify.com/playlist/…" aria-label="Link playlist" />
                <button className="btn btn-ghost btn-icon" aria-label="Hapus playlist" onClick={() => setS({ ...s, curated: s.curated.filter((_, j) => j !== i) })}><Icon name="trash-2" /></button>
              </div>
            ))}
            <div className="row gap-2">
              <button className="btn btn-secondary btn-sm" disabled={s.curated.length >= 24} onClick={() => setS({ ...s, curated: [...s.curated, { provider: 'spotify', title: '', url: '' }] })}><Icon name="plus" />Tambah</button>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void save({ curated: s.curated.filter(c => c.url.trim()) })}><Icon name="check" />Simpan playlist</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
