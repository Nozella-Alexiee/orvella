/* Terbitkan ke Galeri: judul, deskripsi, siapa yang bisa melihat, dan apakah replay ikut dibagikan. */
import { useState } from 'react';
import { api, ApiError } from '../api/client';
import { useApi } from '../api/hooks';
import { Icon } from '../design/Icon';
import { toast } from '../design/toast';
import { confetti, sound } from '../fx';
import { emit } from '../os/bus';
import type { Project } from './types';

export function PublishSheet({ project, close, done }: { project: Project; close: () => void; done: (p: Project) => void }) {
  const list = useApi<{ gallery_public: boolean }>('/api/sandbox');
  const [title, setTitle] = useState(project.title);
  const [desc, setDesc] = useState(project.description);
  const [vis, setVis] = useState<'class' | 'public'>(project.visibility === 'public' ? 'public' : 'class');
  const [replay, setReplay] = useState(project.share_replay);
  const [busy, setBusy] = useState(false);
  const pub = list.data?.gallery_public ?? false;
  const published = project.visibility !== 'private' && !!project.published;

  const go = async () => {
    setBusy(true);
    try {
      const p = await api.post<Project>(`/api/sandbox/${project.id}/publish`, { visibility: vis, title: title.trim() || project.title, description: desc, share_replay: replay });
      done(p); sound('level'); confetti(); emit('publish', { project: p.id });
      toast({ kind: 'success', icon: 'rocket', title: published ? 'Galeri diperbarui' : 'Terbit di Galeri!', body: vis === 'public' ? 'Semua pengguna Orvella bisa melihat dan me-remix proyekmu.' : 'Teman sekelasmu sekarang bisa melihat, memberi bintang, dan me-remix.' });
      close();
    } catch (e) { toast({ kind: 'danger', icon: 'rocket', title: 'Belum bisa terbit', body: e instanceof ApiError ? e.message : 'Coba lagi.' }); }
    finally { setBusy(false); }
  };
  const unpublish = async () => {
    setBusy(true);
    try { done(await api.post<Project>(`/api/sandbox/${project.id}/unpublish`)); toast({ icon: 'eye-off', title: 'Ditarik dari Galeri', body: 'Proyek kembali pribadi.' }); close(); }
    finally { setBusy(false); }
  };
  return (
    <div className="ide-sheet-scrim" onPointerDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="ide-sheet" role="dialog" aria-label="Terbitkan ke Galeri">
        <div className="ide-sheet-head"><Icon name="rocket" /><h3>{published ? 'Atur terbitan' : 'Terbitkan ke Galeri'}</h3>
          <button className="btn btn-ghost btn-sm" aria-label="Tutup" onClick={close}><Icon name="x" /></button></div>
        <div className="ide-sheet-body">
          <label className="os-field"><span>Judul</span><input className="input" value={title} maxLength={160} onChange={e => setTitle(e.target.value)} /></label>
          <label className="os-field"><span>Ceritakan proyekmu</span>
            <textarea className="input" rows={3} maxLength={600} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Apa yang dibuat, apa yang kamu pelajari, apa yang ingin dicoba teman." /></label>
          <div className="os-field"><span>Siapa yang bisa melihat</span>
            <div className="os-seg">
              <button type="button" aria-pressed={vis === 'class'} onClick={() => setVis('class')}><Icon name="users" size={14} />Teman sekelas</button>
              <button type="button" aria-pressed={vis === 'public'} disabled={!pub} title={pub ? '' : 'Galeri publik belum dibuka admin'} onClick={() => setVis('public')}><Icon name="globe" size={14} />Semua orang</button>
            </div>
            {!pub && <small className="t-faint">Galeri publik belum dibuka admin sekolah.</small>}
          </div>
          <div className="ide-sheet-row">
            <div><b>Bagikan replay</b><small>Orang lain bisa menonton cara kodenya ditulis.</small></div>
            <button type="button" className="os-switch" role="switch" aria-checked={replay} aria-label="Bagikan replay" onClick={() => setReplay(r => !r)} />
          </div>
        </div>
        <div className="ide-sheet-foot">
          {published && <button className="btn btn-ghost" disabled={busy} onClick={() => void unpublish()}><Icon name="eye-off" />Tarik dari Galeri</button>}
          <span className="grow" />
          <button className="btn" onClick={close}>Batal</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => void go()}><Icon name="rocket" />{published ? 'Simpan' : 'Terbitkan'}</button>
        </div>
      </div>
    </div>
  );
}
