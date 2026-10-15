/* Panel database proyek web (SQLite untuk Node/Flask/FastAPI, MySQL untuk PHP): daftar tabel,
   lihat isi, konsol SQL, serta unduh/impor isi database sebagai berkas .sql. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Icon } from '../design/Icon';
import { toast } from '../design/toast';

type DbInfo = { engine: 'mysql' | 'sqlite'; files: string[]; file: string; tables: { name: string; rows: number | null }[]; error: string };
type QueryRes = { ok: boolean; columns?: string[]; rows?: unknown[][]; affected?: number | null; error?: string };

export function download(name: string, body: BlobPart, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function DbPanel({ nid, engine, running, title, onStart }: { nid: number; engine: 'mysql' | 'sqlite'; running: boolean; title: string; onStart: () => void }) {
  const [info, setInfo] = useState<DbInfo | null>(null);
  const [sql, setSql] = useState('');
  const [res, setRes] = useState<QueryRes | null>(null);
  const [busy, setBusy] = useState<'' | 'run' | 'dump' | 'load'>('');
  const fileIn = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!running) return;
    try { setInfo(await api.get<DbInfo>(`/api/web/${nid}/db`)); } catch { setInfo(null); }
  }, [nid, running]);
  useEffect(() => { void load(); }, [load]);

  const run = async (q = sql) => {
    if (!q.trim()) return;
    setSql(q); setBusy('run');
    try { setRes(await api.post<QueryRes>(`/api/web/${nid}/db`, { sql: q, file: info?.file || '' })); void load(); }
    catch (e) { setRes({ ok: false, error: e instanceof ApiError ? e.message : 'Gagal menjalankan kueri.' }); }
    finally { setBusy(''); }
  };
  const dump = async () => {
    setBusy('dump');
    try {
      const r = await api.get<{ sql: string; tables: number }>(`/api/web/${nid}/db/dump${info?.file ? `?file=${encodeURIComponent(info.file)}` : ''}`);
      download(`${title.replace(/[^\w.-]+/g, '-').toLowerCase() || 'database'}.sql`, r.sql, 'application/sql');
      toast({ kind: 'success', icon: 'download', title: 'Database diunduh', body: `${r.tables} tabel dalam satu berkas .sql. Impor di proyek lain atau simpan sebagai cadangan.` });
    } catch (e) { toast({ kind: 'danger', icon: 'database', title: 'Belum bisa diunduh', body: e instanceof ApiError ? e.message : 'Coba lagi sebentar.' }); }
    finally { setBusy(''); }
  };
  const importSql = async (f: File) => {
    if (f.size > 2_000_000) { toast({ kind: 'danger', icon: 'file-x', title: 'Berkas terlalu besar', body: 'Maksimal 2 MB.' }); return; }
    setBusy('load');
    try {
      const r = await api.post<{ ok: boolean; statements: number }>(`/api/web/${nid}/db/load`, { sql: await f.text(), file: info?.file || '' });
      toast({ kind: 'success', icon: 'import', title: 'Database diimpor', body: `${r.statements} perintah SQL dijalankan.` });
      void load();
    } catch (e) { toast({ kind: 'danger', icon: 'database', title: 'Impor gagal', body: e instanceof ApiError ? e.message : 'Periksa isi berkas .sql-nya.' }); }
    finally { setBusy(''); if (fileIn.current) fileIn.current.value = ''; }
  };

  if (!running) return (
    <div className="ide-db-off"><Icon name="database" /><div><b>Database {engine === 'mysql' ? 'MySQL' : 'SQLite'}</b><p>Nyalakan server proyek dulu untuk melihat dan mengubah isinya.</p></div>
      <button className="btn btn-sm btn-primary" onClick={onStart}><Icon name="play" />Jalankan server</button></div>
  );
  return (
    <div className="ide-db">
      <aside>
        <div className="ide-db-head"><span>{engine === 'mysql' ? 'MySQL' : info?.file || 'SQLite'}</span>
          <button title="Muat ulang" aria-label="Muat ulang daftar tabel" onClick={() => void load()}><Icon name="refresh-cw" /></button></div>
        {!info ? <small>memuat…</small>
          : engine === 'sqlite' && !info.file ? <small>Belum ada berkas .db. Buka aplikasimu sekali supaya tabelnya dibuat, atau impor .sql.</small>
          : info.tables.length ? info.tables.map(t => (
              <button key={t.name} className="ide-db-t" onClick={() => void run(`SELECT * FROM ${t.name} LIMIT 100;`)}><Icon name="table" /><span>{t.name}</span><em>{t.rows ?? ''}</em></button>
            ))
          : <small>{info.error || 'Belum ada tabel.'}</small>}
        <div className="ide-db-io">
          <button className="btn btn-sm" disabled={!!busy} onClick={() => void dump()}><Icon name={busy === 'dump' ? 'loader-circle' : 'download'} />Unduh .sql</button>
          <button className="btn btn-sm" disabled={!!busy} onClick={() => fileIn.current?.click()}><Icon name={busy === 'load' ? 'loader-circle' : 'import'} />Impor .sql</button>
          <input ref={fileIn} type="file" accept=".sql,text/plain" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void importSql(f); }} />
        </div>
      </aside>
      <div className="ide-db-main">
        <form onSubmit={e => { e.preventDefault(); void run(); }}>
          <textarea value={sql} onChange={e => setSql(e.target.value)} placeholder="SELECT * FROM …;" spellCheck={false} aria-label="Kueri SQL"
            onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void run(); } }} />
          <div className="ide-db-bar"><button className="btn btn-sm btn-primary" disabled={busy === 'run'}><Icon name="play" />Jalankan SQL</button><small>Ctrl+↵ · maksimal 200 baris</small></div>
        </form>
        {res && (res.ok ? (res.columns?.length
          ? <div className="ide-db-grid"><table><thead><tr>{res.columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{res.rows!.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{v === null ? <i>NULL</i> : String(v)}</td>)}</tr>)}</tbody></table></div>
          : <p className="ide-ok">✓ berhasil{res.affected != null && res.affected >= 0 ? ` · ${res.affected} baris berubah` : ''}</p>)
          : <p className="ide-err">✗ {res.error}</p>)}
      </div>
    </div>
  );
}
