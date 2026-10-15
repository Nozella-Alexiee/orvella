/* Sandbox tanpa proyek terbuka: daftar proyekku dan pemilih template "Mau bikin apa hari ini?".
   Berkas .zip bisa diseret ke sini (atau lewat tombol Impor) untuk jadi proyek baru. */
import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import { useApi } from '../api/hooks';
import { Icon } from '../design/Icon';
import { LangIcon } from '../design/LangIcon';
import { Orvi } from '../design/Orvi';
import { toast } from '../design/toast';
import { sound } from '../fx';
import { useWin, useWinTitle } from '../os/Window';
import { useWM } from '../os/wm';
import { CATS, TEMPLATES, type Template } from './templates';
import { importProject } from './zip';
import { projectLang, type Project, type ProjectCard } from './types';

export function SandboxHome() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const win = useWin();
  const [params, setParams] = useSearchParams();
  const picking = params.get('baru') === '1';
  const list = useApi<{ items: ProjectCard[] }>('/api/sandbox');
  const [cat, setCat] = useState<(typeof CATS)[number]['id']>('semua');
  const [busy, setBusy] = useState<string | null>(null);
  const [drop, setDrop] = useState(false);
  const fileIn = useRef<HTMLInputElement>(null);
  useWinTitle(picking ? 'Proyek baru' : 'Sandbox', picking ? 'pilih template' : 'proyek saya');

  // proyek baru/impor dibuka di jendelanya sendiri; jendela pemilih template baru ditutup SETELAH jendela proyeknya
  // terbuka dan aktif. Kalau ditutup duluan, OS tidak punya jendela aktif lalu kembali ke desktop, dan proyeknya tidak terbuka.
  const opened = (p: Project) => {
    void qc.invalidateQueries({ queryKey: ['/api/sandbox'] });
    nav(`/sandbox/${p.id}`);
    if (!win || !picking) return;
    const key = String(p.id);
    const ready = () => {
      const st = useWM.getState(), w = st.wins.find(x => x.app === 'sandbox' && x.key === key);
      if (!w || st.active !== w.id) return false;
      dispatchEvent(new CustomEvent('os:winctl', { detail: { id: win.id, do: 'close' } }));
      return true;
    };
    if (ready()) return;
    const stop = useWM.subscribe(() => { if (ready()) stop(); });
    window.setTimeout(stop, 4000);
  };
  const create = async (t: Template) => {
    setBusy(t.id);
    try { const p = await api.post<Project>('/api/sandbox', t.body); sound('whoosh'); opened(p); }
    catch (e) { toast({ kind: 'danger', icon: 'file-x', title: 'Proyek belum bisa dibuat', body: e instanceof ApiError ? e.message : 'Coba lagi.' }); }
    finally { setBusy(null); }
  };
  const importZip = async (f?: File | null) => { if (!f) return; setBusy('zip'); const p = await importProject(f); setBusy(null); if (p) opened(p); if (fileIn.current) fileIn.current.value = ''; };
  const remove = async (p: ProjectCard) => {
    if (!confirm(`Hapus proyek "${p.title}"? Snapshot dan replay-nya ikut terhapus.`)) return;
    await api.del(`/api/sandbox/${p.id}`); void list.refetch();
    toast({ icon: 'trash-2', title: 'Proyek dihapus', body: p.title });
  };
  const shown = TEMPLATES.filter(t => cat === 'semua' || t.cat === cat);

  return (
    <div className={`sbh${drop ? ' is-drop' : ''}`} onDragOver={e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setDrop(true); } }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDrop(false); }} onDrop={e => { e.preventDefault(); setDrop(false); void importZip(e.dataTransfer.files[0]); }}>
      <aside className="sbh-side">
        <button aria-pressed={!picking} onClick={() => { params.delete('baru'); setParams(params); }}><Icon name="folder-open" />Proyek saya</button>
        <span className="sbh-label">Proyek baru</span>
        {CATS.map(c => <button key={c.id} aria-pressed={picking && cat === c.id} onClick={() => { setCat(c.id); setParams({ baru: '1' }); }}><Icon name={c.icon} />{c.label}</button>)}
        <span className="grow" />
        <button onClick={() => fileIn.current?.click()} disabled={busy === 'zip'}><Icon name={busy === 'zip' ? 'loader-circle' : 'import'} />Impor .zip</button>
        <input ref={fileIn} type="file" accept=".zip,application/zip" hidden onChange={e => void importZip(e.target.files?.[0])} />
      </aside>
      <main className="sbh-main">
        {!win && <button className="btn btn-sm btn-ghost" onClick={() => nav('/beranda')}><Icon name="arrow-left" />Beranda</button>}
        {picking ? (
          <>
            <h2>Mau bikin apa hari ini?</h2>
            <p>Sandbox milikmu sendiri: bikin proyek apa saja tanpa menunggu tugas dari mentor. Pilih template, lalu ubah sesukamu.</p>
            <div className="sbh-grid">
              {shown.map(t => (
                <button key={t.id} className="sbh-tpl" style={{ ['--tc' as string]: t.color }} disabled={!!busy} onClick={() => void create(t)}>
                  <span className="icons">{t.icons.map(i => <LangIcon key={i} id={i} size={30} />)}</span>
                  <b>{busy === t.id ? 'Membuat…' : t.title}</b><small>{t.hint}</small>
                  <span className="files">{t.files.map(f => <span key={f}>{f}</span>)}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="sbh-head"><div><h2>Proyek saya</h2><p>Semua proyek Sandbox-mu. Seret berkas .zip ke sini untuk mengimpor.</p></div>
              <button className="btn btn-primary" onClick={() => setParams({ baru: '1' })}><Icon name="plus" />Proyek baru</button></div>
            {list.isLoading && <div className="sbh-grid">{[0, 1, 2].map(i => <div key={i} className="sbh-card os-skel" style={{ height: 120 }} />)}</div>}
            {list.data && !list.data.items.length && (
              <div className="sbh-empty"><Orvi size={96} mood="happy" force /><div><b>Belum ada proyek.</b><p>Mulai dari template: web statis, Python, Node, sampai PHP + MySQL.</p>
                <button className="btn btn-primary" onClick={() => setParams({ baru: '1' })}><Icon name="plus" />Buat proyek pertama</button></div></div>
            )}
            <div className="sbh-grid">
              {list.data?.items.map(p => (
                <div key={p.id} className="sbh-card" role="button" tabIndex={0} onClick={() => nav(`/sandbox/${p.id}`)} onKeyDown={e => { if (e.key === 'Enter') nav(`/sandbox/${p.id}`); }}>
                  <div className="top"><LangIcon id={projectLang(p)} size={26} />{p.visibility !== 'private' && <span className="os-chip os-chip-mint">terbit{p.stars ? ` · ★ ${p.stars}` : ''}</span>}
                    <button className="btn btn-ghost btn-sm del" aria-label={`Hapus ${p.title}`} onClick={e => { e.stopPropagation(); void remove(p); }}><Icon name="trash-2" /></button></div>
                  <b>{p.title}</b><small>{p.kind === 'web' ? `Web · ${p.stack}` : p.lang} · {p.updated}</small>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
      <div className="sbh-dropover" aria-hidden="true"><Icon name="import" /><b>Lepas untuk mengimpor proyek</b><small>Berkas .zip sampai 2 MB</small></div>
    </div>
  );
}
