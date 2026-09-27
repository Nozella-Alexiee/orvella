import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import { CodeEditor } from '../code/CodeEditor';
import { Icon } from '../design/Icon';
import { LangIcon } from '../design/LangIcon';
import { Orvi } from '../design/Orvi';
import { toast } from '../design/toast';
import { cx } from '../design/ui';
import { pop, sound } from '../fx';
import { MiniBrowser } from './MiniBrowser';
import { langOfPath, STACKS } from './stacks';
import type { Notebook } from './types';

type SessState = 'stopped' | 'starting' | 'running' | 'exited';
type Status = { state: SessState; exit?: number | null; oom?: boolean; since?: number; idle_limit?: number };
type Resp = { status: Status; stack: string; preview?: string; preview_origin?: string; logs?: { lines: { t: number; text: string }[]; cursor: number } };
type DbInfo = { engine: 'mysql' | 'sqlite'; files: string[]; file: string; tables: { name: string; rows: number | null }[]; error: string };
type QueryRes = { ok: boolean; columns?: string[]; rows?: unknown[][]; affected?: number | null; error?: string };

const css = `
.ws { display: grid; gap: 14px; margin-top: 16px; grid-template-columns: 210px minmax(0, 1fr) minmax(0, 1fr); grid-template-areas: "bar bar bar" "tree edit view" "tree panel panel"; }
.ws-bar { grid-area: bar; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ws-tree { grid-area: tree; align-self: start; position: sticky; top: 88px; }
.ws-edit { grid-area: edit; min-width: 0; }
.ws-view { grid-area: view; min-width: 0; }
.ws-panel { grid-area: panel; min-width: 0; }
.ws-pill { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 14px; border-radius: 999px; background: var(--surface-sunken); font-weight: 700; font-size: 13px; }
.ws-pill i { width: 9px; height: 9px; border-radius: 50%; background: var(--text-faint); }
.ws-pill.is-running { background: var(--success-soft); color: var(--success); } .ws-pill.is-running i { background: var(--success); animation: ws-beat 1.6s ease-in-out infinite; }
.ws-pill.is-starting { background: var(--marigold-soft); color: var(--marigold-ink); } .ws-pill.is-starting i { background: var(--marigold); animation: ws-beat .7s ease-in-out infinite; }
.ws-pill.is-exited { background: var(--danger-soft); color: var(--danger); } .ws-pill.is-exited i { background: var(--danger); }
@keyframes ws-beat { 50% { transform: scale(1.6); opacity: .6; } }
.ftree { background: var(--surface); border: 1px solid var(--border); border-radius: 18px; padding: 8px; box-shadow: var(--shadow-1); }
.ftree-head { display: flex; align-items: center; justify-content: space-between; padding: 4px 6px 8px; }
.fnode { display: flex; align-items: center; gap: 8px; width: 100%; height: 32px; padding: 0 8px; border-radius: 10px; font-size: 13px; color: var(--text-muted); text-align: left; }
.fnode:hover { background: var(--surface-hover); color: var(--text); }
.fnode[aria-current] { background: var(--marigold-soft); color: var(--marigold-ink); font-weight: 700; }
.fnode .del { margin-left: auto; opacity: 0; } .fnode:hover .del { opacity: .7; }
.fdir { display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 8px; font-size: 12px; font-weight: 800; color: var(--text-faint); letter-spacing: .02em; }
.fnew { display: flex; gap: 6px; padding: 6px; }
.fnew input { flex: 1; min-width: 0; height: 32px; border-radius: 10px; border: 1px solid var(--border-strong); padding: 0 10px; font-family: var(--font-mono); font-size: 12px; background: var(--surface); color: var(--text); }
.etabs { display: flex; gap: 2px; overflow-x: auto; padding: 6px 6px 0; background: var(--editor-bg-2); border-bottom: 1px solid var(--editor-line); }
.etab { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 10px 0 12px; border-radius: 10px 10px 0 0; font-family: var(--font-mono); font-size: 12px; color: var(--editor-dim); white-space: nowrap; }
.etab[aria-selected="true"] { background: var(--editor-bg); color: #F4EEFF; }
.etab .x { width: 18px; height: 18px; display: grid; place-items: center; border-radius: 5px; opacity: .6; } .etab .x:hover { background: rgb(255 255 255 / .1); opacity: 1; }
.ws-edit .cm-host { min-height: 460px; }
.ptabs { display: flex; gap: 4px; padding: 6px; border-bottom: 1px solid var(--editor-line); background: var(--editor-bg-2); }
.ptabs button { height: 30px; padding: 0 12px; border-radius: 9px; color: var(--editor-dim); font-size: 12.5px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; }
.ptabs button[aria-selected="true"] { background: var(--editor-bg); color: #F4EEFF; }
.logs { height: 230px; overflow: auto; padding: 10px 14px; font-family: var(--font-mono); font-size: 12.5px; line-height: 1.6; }
.logs .l { white-space: pre-wrap; word-break: break-word; }
.logs .l.is-err { color: #FFB4C0; } .logs .l.is-dim { color: var(--editor-dim); }
.dbw { display: grid; grid-template-columns: 180px minmax(0, 1fr); min-height: 230px; }
.dbw aside { border-right: 1px solid var(--editor-line); padding: 8px; display: flex; flex-direction: column; gap: 2px; }
.dbw aside button { text-align: left; padding: 6px 8px; border-radius: 8px; color: #E6E1FF; font-family: var(--font-mono); font-size: 12px; display: flex; justify-content: space-between; }
.dbw aside button:hover { background: rgb(255 255 255 / .06); }
.dbw textarea { width: 100%; min-height: 70px; resize: vertical; border: 1px solid var(--editor-line); border-radius: 10px; background: var(--editor-bg-2); color: #F4EEFF; font-family: var(--font-mono); font-size: 12.5px; padding: 8px 10px; outline: none; }
.dgrid { overflow: auto; max-height: 220px; margin-top: 8px; border-radius: 10px; border: 1px solid var(--editor-line); }
.dgrid table { border-collapse: collapse; width: 100%; font-family: var(--font-mono); font-size: 12px; }
.dgrid th, .dgrid td { padding: 5px 10px; border-bottom: 1px solid var(--editor-line); text-align: left; white-space: nowrap; }
.dgrid th { position: sticky; top: 0; background: var(--editor-bg-2); color: var(--marigold); }
@media (max-width: 1280px) { .ws { grid-template-columns: 200px minmax(0, 1fr); grid-template-areas: "bar bar" "tree edit" "view view" "panel panel"; } }
@media (max-width: 900px) { .ws { grid-template-columns: 1fr; grid-template-areas: "bar" "tree" "edit" "view" "panel"; } .ws-tree { position: static; } .dbw { grid-template-columns: 1fr; } .dbw aside { border-right: 0; flex-direction: row; flex-wrap: wrap; } }
`;

const isErr = (s: string) => /error|exception|traceback|fatal|warning:|✗/i.test(s);

/** Workspace fullstack: pohon berkas, editor bertab, server dev di sandbox, browser mini, log, dan database. */
export default function WebWorkspace({ nb, update }: { nb: Notebook; update: (n: Notebook) => void }) {
  const stackId = nb.files.stack || 'static';
  const stack = STACKS[stackId];
  const [files, setFiles] = useState<Record<string, string>>(() => ({ ...(nb.files.files || {}) }));
  const paths = useMemo(() => Object.keys(files).sort((a, b) => (a.split('/').length - b.split('/').length) || a.localeCompare(b)), [files]);
  const first = paths.find(p => /index\.(html|php)$|server\.js$|app\.py$|main\.py$/.test(p)) || paths[0];
  const [open, setOpen] = useState<string[]>(first ? [first] : []);
  const [active, setActive] = useState<string | undefined>(first);
  const [status, setStatus] = useState<Status>({ state: 'stopped' });
  const [preview, setPreview] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ t: number; text: string }[]>([]);
  const [panel, setPanel] = useState<'log' | 'db'>('log');
  const [reloadKey, setReloadKey] = useState(0);
  const [autoReload, setAutoReload] = useState(true);
  const [newName, setNewName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cursor = useRef(0);
  const dirty = useRef<Set<string>>(new Set());
  const deleted = useRef<Set<string>>(new Set());
  const saveTimer = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);
  const live = status.state === 'running' || status.state === 'starting';

  const apply = useCallback((r: Resp) => {
    setStatus(r.status);
    if (r.preview) setPreview(p => p || r.preview!);
    if (r.status.state === 'stopped') setPreview(null);
    if (r.logs?.lines.length) {
      cursor.current = r.logs.cursor;
      setLogs(l => [...l, ...r.logs!.lines].slice(-400));
    }
  }, []);

  // status + new log lines; fast while starting, calmer while running
  const poll = useCallback(async () => {
    try { apply(await api.get<Resp>(`/api/web/${nb.id}/status${cursor.current ? `?since=${cursor.current}` : ''}`)); }
    catch { /* keep the last state; the next poll retries */ }
  }, [nb.id, apply]);
  useEffect(() => { setLogs([]); cursor.current = 0; poll(); }, [nb.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (status.state === 'stopped') return;
    const t = setInterval(poll, status.state === 'running' ? 2000 : 1200);
    return () => clearInterval(t);
  }, [status.state, poll]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [logs, panel]);
  // a freshly started server needs a moment; show "starting" until the first poll says running for 1.5 s
  useEffect(() => {
    if (status.state !== 'running' || (status.since ?? 9) > 2) return;
    const t = setTimeout(() => setReloadKey(k => k + 1), 1500);
    return () => clearTimeout(t);
  }, [status.state, status.since]);

  const flush = useCallback(async () => {
    const write: Record<string, string> = {};
    dirty.current.forEach(p => { if (p in filesRef.current) write[p] = filesRef.current[p]; });
    const del = [...deleted.current];
    dirty.current.clear(); deleted.current.clear();
    if (!Object.keys(write).length && !del.length) return;
    try {
      const r = await api.put<{ synced: boolean }>(`/api/web/${nb.id}/files`, { write, delete: del, running: statusRef.current === 'running' });
      if (r.synced && autoReloadRef.current) setTimeout(() => setReloadKey(k => k + 1), stackId === 'fastapi' || stackId === 'flask' ? 1300 : 700);
    } catch (e) {
      Object.keys(write).forEach(p => dirty.current.add(p));
      toast({ kind: 'danger', icon: 'cloud-check', title: 'Belum tersimpan', body: e instanceof ApiError ? e.message : 'Koneksi terputus.' });
    }
  }, [nb.id, stackId]);
  const filesRef = useRef(files); filesRef.current = files;
  const statusRef = useRef(status.state); statusRef.current = status.state;
  const autoReloadRef = useRef(autoReload); autoReloadRef.current = autoReload;
  const schedule = () => { clearTimeout(saveTimer.current); saveTimer.current = window.setTimeout(flush, 700); };
  useEffect(() => () => { clearTimeout(saveTimer.current); flush(); }, [flush]);

  const setFile = (path: string, body: string) => {
    setFiles(f => ({ ...f, [path]: body }));
    dirty.current.add(path);
    update({ ...nb, files: { ...nb.files, files: { ...filesRef.current, [path]: body } } });
    schedule();
  };
  const openFile = (p: string) => { setOpen(o => (o.includes(p) ? o : [...o, p])); setActive(p); };
  const closeTab = (p: string) => { setOpen(o => { const n = o.filter(x => x !== p); if (active === p) setActive(n[n.length - 1]); return n; }); };
  const addFile = (name: string) => {
    const p = name.trim().replace(/^\/+/, '');
    if (!p) { setNewName(null); return; }
    if (!/^[A-Za-z0-9_][A-Za-z0-9_./-]{0,119}$/.test(p) || p.includes('..')) { toast({ kind: 'danger', icon: 'file-x', title: 'Nama berkas tidak valid', body: 'Pakai huruf, angka, titik, garis bawah, strip, dan / untuk folder.' }); return; }
    if (files[p] !== undefined) { openFile(p); setNewName(null); return; }
    setFile(p, '');
    openFile(p); setNewName(null);
  };
  const removeFile = (p: string) => {
    if (!confirm(`Hapus ${p}?`)) return;
    setFiles(f => { const n = { ...f }; delete n[p]; return n; });
    deleted.current.add(p); dirty.current.delete(p);
    closeTab(p);
    schedule();
  };

  const act = async (what: 'start' | 'stop' | 'restart', btn?: HTMLElement | null) => {
    if (busy) return;
    pop(btn);
    setBusy(true);
    try {
      await flush();
      if (what === 'stop' || what === 'restart') { await api.post(`/api/web/${nb.id}/stop`, {}); setStatus({ state: 'stopped' }); setPreview(null); }
      if (what === 'start' || what === 'restart') {
        setStatus({ state: 'starting' }); setLogs([]); cursor.current = 0;
        const r = await api.post<Resp>(`/api/web/${nb.id}/start`, {});
        apply({ ...r, status: { ...r.status, state: r.status.state === 'running' ? 'starting' : r.status.state } });
        setPreview(r.preview || null);
        sound('whoosh');
        setTimeout(poll, 900);
      }
    } catch (e) {
      setStatus({ state: 'stopped' });
      toast({ kind: 'danger', icon: 'server', title: 'Server belum bisa dinyalakan', body: e instanceof ApiError ? e.message : 'Coba lagi sebentar.' });
    } finally { setBusy(false); }
  };

  // ---- database
  const [dbInfo, setDbInfo] = useState<DbInfo | null>(null);
  const [sql, setSql] = useState('');
  const [qres, setQres] = useState<QueryRes | null>(null);
  const loadDb = useCallback(async () => {
    if (status.state !== 'running') return;
    try { setDbInfo(await api.get<DbInfo>(`/api/web/${nb.id}/db`)); } catch { setDbInfo(null); }
  }, [nb.id, status.state]);
  useEffect(() => { if (panel === 'db') loadDb(); }, [panel, loadDb]);
  const runSql = async (q = sql) => {
    if (!q.trim()) return;
    setSql(q);
    try { setQres(await api.post<QueryRes>(`/api/web/${nb.id}/db`, { sql: q, file: dbInfo?.file || '' })); loadDb(); }
    catch (e) { setQres({ ok: false, error: e instanceof ApiError ? e.message : 'Gagal menjalankan kueri.' }); }
  };

  const label = { stopped: 'Mati', starting: 'Menyalakan…', running: 'Berjalan', exited: `Berhenti${status.exit != null ? ` · kode ${status.exit}` : ''}` }[status.state];
  const dirs = useMemo(() => {
    const groups: Record<string, string[]> = {};
    for (const p of paths) { const d = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''; (groups[d] ||= []).push(p); }
    return Object.entries(groups).sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
  }, [paths]);

  return (
    <div className="ws">
      <style>{css}</style>
      <div className="ws-bar">
        <span className={cx('ws-pill', `is-${status.state}`)}><i />{label}</span>
        {status.state === 'stopped'
          ? <button className={cx('btn btn-sun btn-press', busy && 'is-loading')} onClick={e => act('start', e.currentTarget)}><Icon name="play" />Jalankan server</button>
          : <>
              <button className="btn btn-secondary btn-press" onClick={e => act('restart', e.currentTarget)} disabled={busy}><Icon name="rotate-ccw" />Mulai ulang</button>
              <button className="btn btn-ghost" onClick={e => act('stop', e.currentTarget)} disabled={busy}><Icon name="power" />Hentikan</button>
            </>}
        <span className="t-xs t-faint hide-sm t-mono">$ {stack?.run}</span>
        <span className="grow" />
        <label className="row gap-2 t-xs t-muted" style={{ alignItems: 'center' }}><input type="checkbox" checked={autoReload} onChange={e => setAutoReload(e.target.checked)} />muat ulang otomatis</label>
        {preview && <a className="btn btn-ghost btn-sm" href={preview} target="_blank" rel="noopener"><Icon name="external-link" />Tab baru</a>}
        <Orvi size={36} mood={status.state === 'running' ? 'happy' : status.state === 'exited' ? 'oops' : status.state === 'starting' ? 'think' : 'idle'} force />
      </div>

      <aside className="ws-tree">
        <div className="ftree">
          <div className="ftree-head"><span className="eyebrow">Berkas</span>
            <button className="btn btn-ghost btn-icon btn-sm" aria-label="Berkas baru" title="Berkas baru" onClick={() => setNewName('')}><Icon name="file-plus" /></button></div>
          {newName !== null && (
            <form className="fnew" onSubmit={e => { e.preventDefault(); addFile(newName); }}>
              <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} placeholder="folder/nama.ext" onBlur={() => !newName && setNewName(null)} />
            </form>
          )}
          {dirs.map(([dir, items]) => (
            <div key={dir || '.'}>
              {dir && <div className="fdir"><Icon name="folder-open" size={14} />{dir}/</div>}
              {items.map(p => {
                const lang = langOfPath(p);
                return (
                  <button key={p} className="fnode" style={{ paddingLeft: dir ? 22 : 8 }} aria-current={active === p ? 'true' : undefined} onClick={() => openFile(p)}>
                    {lang !== 'text' ? <LangIcon id={lang} size={16} /> : <Icon name="file" size={14} />}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.split('/').pop()}</span>
                    <span className="del" role="button" aria-label={`Hapus ${p}`} onClick={e => { e.stopPropagation(); removeFile(p); }}><Icon name="trash-2" size={14} /></span>
                  </button>
                );
              })}
            </div>
          ))}
          <div className="t-xs t-faint" style={{ padding: '10px 8px 4px', lineHeight: 1.5 }}>
            {stack?.icons.map(i => <LangIcon key={i} id={i} size={14} style={{ marginRight: 4, verticalAlign: -2 }} />)}{stack?.name}
          </div>
        </div>
      </aside>

      <section className="ws-edit">
        <div className="codecard">
          <div className="etabs" role="tablist">
            {open.map(p => (
              <span key={p} className="etab" role="tab" aria-selected={active === p} onClick={() => setActive(p)}>
                {p.split('/').pop()}<button className="x" aria-label={`Tutup ${p}`} onClick={e => { e.stopPropagation(); closeTab(p); }}><Icon name="x" size={14} /></button>
              </span>
            ))}
          </div>
          {active && files[active] !== undefined
            ? <CodeEditor key={active} value={files[active]} lang={langOfPath(active)} onChange={v => setFile(active, v)} label={`Editor ${active}`} minHeight={460} maxHeight={560}
                onRun={() => (status.state === 'stopped' ? act('start') : setReloadKey(k => k + 1))} />
            : <div className="console-empty" style={{ minHeight: 420 }}>Pilih berkas di kiri untuk mulai mengedit.</div>}
        </div>
      </section>

      <section className="ws-view">
        {preview && status.state !== 'stopped'
          ? <MiniBrowser src={preview} url={`${new URL(preview).origin}/`} reloadKey={reloadKey} showConsole={false} minHeight={480}
              sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
              onNavigate={path => { const u = new URL(preview); const p = path.replace(/^https?:\/\/[^/]+/, '') || '/'; u.searchParams.set('p', p.startsWith('/') ? p : `/${p}`); setPreview(u.toString()); setReloadKey(k => k + 1); }} />
          : (
            <div className="mini-browser" style={{ minHeight: 480 }}>
              <div className="console-empty" style={{ minHeight: 480, color: 'var(--text-muted)' }}>
                <span className="pick-icons">{stack?.icons.map(i => <LangIcon key={i} id={i} size={40} />)}</span>
                <div><b>Server belum menyala.</b><br /><span className="t-sm">Tekan <b>Jalankan server</b>. Hasil websitemu muncul di sini, lengkap dengan lebar HP, tablet, dan desktop.</span></div>
                <button className={cx('btn btn-sun btn-press', busy && 'is-loading')} onClick={e => act('start', e.currentTarget)}><Icon name="play" />Jalankan server</button>
              </div>
            </div>
          )}
      </section>

      <section className="ws-panel">
        <div className="codecard">
          <div className="ptabs" role="tablist">
            <button role="tab" aria-selected={panel === 'log'} onClick={() => setPanel('log')}><Icon name="terminal" size={14} />Log server</button>
            {stack?.db && <button role="tab" aria-selected={panel === 'db'} onClick={() => setPanel('db')}><Icon name="database" size={14} />Database · {stack.db === 'mysql' ? 'MySQL' : 'SQLite'}</button>}
            <span className="grow" />
            {panel === 'log' && logs.length > 0 && <button onClick={() => setLogs([])}><Icon name="trash-2" size={14} />Bersihkan</button>}
          </div>
          {panel === 'log' ? (
            <div className="logs" ref={logRef} aria-live="polite">
              {!logs.length && <div className="l is-dim">{live ? 'menunggu keluaran server…' : 'Log server muncul di sini setelah server dijalankan.'}</div>}
              {logs.map((l, i) => <div key={i} className={cx('l', isErr(l.text) && 'is-err')}>{l.text}</div>)}
              {status.state === 'exited' && <div className="l is-err">✗ server berhenti{status.oom ? ' karena memori penuh' : ''}. Perbaiki error di atas, lalu Mulai ulang.</div>}
            </div>
          ) : (
            <div className="dbw">
              <aside>
                {status.state !== 'running' ? <span className="t-xs" style={{ color: 'var(--editor-dim)' }}>Jalankan server dulu.</span>
                  : !dbInfo ? <span className="t-xs" style={{ color: 'var(--editor-dim)' }}>memuat…</span>
                  : dbInfo.engine === 'sqlite' && !dbInfo.file ? <span className="t-xs" style={{ color: 'var(--editor-dim)' }}>Belum ada berkas .db. Buka aplikasimu sekali supaya tabelnya dibuat.</span>
                  : <>
                      <span className="t-label" style={{ color: 'var(--editor-dim)', padding: '2px 8px' }}>{dbInfo.engine === 'mysql' ? 'Tabel MySQL' : dbInfo.file}</span>
                      {dbInfo.tables.map(t => <button key={t.name} onClick={() => runSql(`SELECT * FROM ${t.name} LIMIT 100;`)}><span>{t.name}</span><span style={{ opacity: .6 }}>{t.rows ?? ''}</span></button>)}
                      {!dbInfo.tables.length && <span className="t-xs" style={{ color: 'var(--editor-dim)', padding: '2px 8px' }}>{dbInfo.error || 'Belum ada tabel.'}</span>}
                    </>}
              </aside>
              <div style={{ padding: 10 }}>
                <form onSubmit={e => { e.preventDefault(); runSql(); }}>
                  <textarea value={sql} onChange={e => setSql(e.target.value)} placeholder="SELECT * FROM ...;" spellCheck={false}
                    onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runSql(); } }} />
                  <div className="row gap-2 mt-2"><button className="btn btn-sun btn-sm btn-press" disabled={status.state !== 'running'}><Icon name="play" />Jalankan SQL</button>
                    <span className="t-xs" style={{ color: 'var(--editor-dim)' }}>Ctrl+↵ · maksimal 200 baris</span></div>
                </form>
                {qres && (qres.ok ? (
                  qres.columns && qres.columns.length ? (
                    <div className="dgrid"><table><thead><tr>{qres.columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
                      <tbody>{qres.rows!.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{v === null ? 'NULL' : String(v)}</td>)}</tr>)}</tbody></table></div>
                  ) : <div className="t-sm mt-2" style={{ color: '#9BE7B4' }}>✓ berhasil{qres.affected != null && qres.affected >= 0 ? ` · ${qres.affected} baris berubah` : ''}</div>
                ) : <div className="t-sm mt-2" style={{ color: '#FFB4C0' }}>✗ {qres.error}</div>)}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
