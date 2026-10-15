/* Mode Sandbox: IDE di dalam jendela Orvella OS.
   activity bar | panel samping (Berkas, Cari, Versi, Replay) | editor + panel bawah | pratinjau
   Tata letak mengikuti lebar JENDELA (data-size), bukan lebar layar. */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ChangeSet, type ChangeSpec, type Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import * as Y from 'yjs';
import { yCollab, ySyncAnnotation } from 'y-codemirror.next';
import { api, ApiError } from '../api/client';
import { Icon } from '../design/Icon';
import { LangIcon } from '../design/LangIcon';
import { Orvi } from '../design/Orvi';
import { toast } from '../design/toast';
import { burst, motion, shake, sound } from '../fx';
import type { EditorDiag } from '../code/CodeEditor';
import { langOfPath, STACKS } from '../playground/stacks';
import type { Diag, RunOut } from '../playground/types';
import { Html } from '../lib/html';
import { emit } from '../os/bus';
import { useWin, useWinTitle } from '../os/Window';
import { useWM } from '../os/wm';
import { DbPanel } from './DbPanel';
import { PublishSheet } from './PublishSheet';
import { ReplayPanel, ReplayPlayer, useReplayRecorder } from './Replay';
import { SandboxEditor, type EditorHandle } from './SandboxEditor';
import { HELP, secretCommand, Terminal, type TermLine } from './Terminal';
import { DiffOverlay, VersionsPanel } from './Versions';
import { SrcDocFrame } from './SrcDocFrame';
import { buildStatic, useWebServer } from './web';
import { exportProject } from './zip';
import type { Project, ReplaySession, Snapshot } from './types';
import { useMe } from '../api/hooks';
import { KolabPanel } from './KolabPanel';
import { askOrviAbout, claimTools, provideTools, useOrviTools, type OrviTools } from '../orvi/ask';
import { HelpButton } from '../os/Bantuan';
import { useAwareness, useKolab, type KRan } from './kolab';

type Side = 'berkas' | 'cari' | 'versi' | 'replay' | 'kolab';
type Bot = 'terminal' | 'masalah' | 'input' | 'log' | 'db';
type Size = 'lebar' | 'sedang' | 'sempit' | 'hp';
type Save = 'saved' | 'saving' | 'error' | 'stale';
/** wait: menunggu room ngoding bareng · kolab: tersambung (server yang menyimpan) · solo: tanpa room (PATCH biasa) */
type Mode = 'wait' | 'kolab' | 'solo';
type Problem = EditorDiag & { file: string; explain?: Diag | null };

const MAX_DROP = 100_000;
const sizeOf = (w: number): Size => (w >= 1150 ? 'lebar' : w >= 960 ? 'sedang' : w >= 640 ? 'sempit' : 'hp');
const sortPaths = (ps: string[]) => [...ps].sort((a, b) => (a.split('/').length - b.split('/').length) || a.localeCompare(b));
const firstFile = (p: Project, files: Record<string, string>) =>
  p.entry && files[p.entry] !== undefined ? p.entry : sortPaths(Object.keys(files)).find(f => /(^|\/)(index\.(html|php)|server\.js|app\.py|main\.py)$/.test(f)) || sortPaths(Object.keys(files))[0] || null;

export function Ide({ project: initial }: { project: Project }) {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const win = useWin();
  const [proj, setProj] = useState(initial);
  const files = useRef<Record<string, string>>({ ...initial.files });
  const [paths, setPaths] = useState(() => sortPaths(Object.keys(initial.files)));
  const [tabs, setTabs] = useState<string[]>(() => { const f = firstFile(initial, initial.files); return f ? [f] : []; });
  const [active, setActive] = useState<string | null>(() => firstFile(initial, initial.files));
  const [side, setSide] = useState<Side | null>('berkas');
  const [bot, setBot] = useState<Bot>('terminal');
  const [term, setTerm] = useState<TermLine[]>([{ k: 'dim', t: `Sandbox ${initial.title} · ketik help untuk daftar perintah` }]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [stdin, setStdin] = useState(initial.stdin || '');
  const [cursor, setCursor] = useState<[number, number]>([1, 1]);
  const [save, setSave] = useState<Save>('saved');
  const [running, setRunning] = useState(false);
  const [size, setSize] = useState<Size>('lebar');
  const [hpView, setHpView] = useState<'berkas' | 'kode' | 'terminal' | 'pratinjau'>('kode');
  const [diffSnap, setDiffSnap] = useState<Snapshot | null>(null);
  const [replay, setReplay] = useState<ReplaySession | null>(null);
  const [publish, setPublish] = useState(params.get('terbit') === '1');
  const [snapBusy, setSnapBusy] = useState(false);
  const [phone, setPhone] = useState(false);
  const [newName, setNewName] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [drop, setDrop] = useState(false);
  const [staticDoc, setStaticDoc] = useState('');
  const [, force] = useState(0);
  const editor = useRef<EditorHandle>(null);
  const root = useRef<HTMLDivElement>(null);
  const runBtn = useRef<HTMLButtonElement>(null);
  const pending = useRef({ write: new Set<string>(), del: new Set<string>(), rename: {} as Record<string, string> });
  const saveTimer = useRef(0);
  const rev = useRef(initial.rev);
  const { data: me } = useMe();
  const [mode, setMode] = useState<Mode>('wait');
  const [follow, setFollow] = useState<number | null>(null);
  const ranRef = useRef<(r: KRan) => void>(() => {});
  const kol = useKolab(initial.id, mode !== 'solo', {
    onRan: r => ranRef.current(r),
    onError: m => toast({ kind: 'danger', icon: 'cloud-check', title: 'Belum tersimpan', body: m }),
    onReset: () => toast({ icon: 'refresh-cw', title: 'Proyek dimuat ulang', body: 'Isi proyek diubah dari luar ruang ngoding bareng, jadi kamu melihat versi terbarunya.' }),
  });
  const aware = useAwareness(mode === 'kolab' ? kol.client : null);
  const awareRef = useRef(aware); awareRef.current = aware;
  const activeRef = useRef(active); activeRef.current = active;
  const stdinDirty = useRef(false);
  const undo = useRef(new Map<string, Y.UndoManager>());

  const isWeb = proj.kind === 'web', stack = isWeb ? proj.stack || 'static' : null;
  const isStatic = stack === 'static';
  const dbEngine: 'mysql' | 'sqlite' | null = stack ? (STACKS[stack]?.db ?? (stack === 'fastapi' ? 'sqlite' : null)) : null;
  const canEdit = mode === 'kolab' && kol.role ? kol.role !== 'view' : proj.can_edit;
  const server = useWebServer(proj.id, isWeb && !isStatic);
  const rec = useReplayRecorder(proj.id, (proj.access ?? (proj.can_edit ? 'owner' : 'view')) === 'owner');
  const say = useCallback((...l: TermLine[]) => setTerm(t => [...t, ...l].slice(-500)), []);

  // ---- ukuran jendela
  useEffect(() => {
    const el = root.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize(sizeOf(e.contentRect.width)));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  useEffect(() => { if (size === 'sempit') setSide(null); }, [size]);
  useEffect(() => { if (params.get('terbit') === '1') { setPublish(true); params.delete('terbit'); setParams(params, { replace: true }); } }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- simpan otomatis (PATCH dengan rev; 409 = diubah di tempat lain)
  const flush = useCallback(async () => {
    clearTimeout(saveTimer.current);
    if (mode === 'kolab') {  // server room yang menyimpan berkas; input program disimpan terpisah
      pending.current = { write: new Set(), del: new Set(), rename: {} };
      if (stdinDirty.current && proj.kind === 'program') { stdinDirty.current = false; await api.patch(`/api/sandbox/${proj.id}/files`, { stdin }).catch(() => {}); }
      return true;
    }
    const p = pending.current;
    if (!p.write.size && !p.del.size && !Object.keys(p.rename).length) return true;
    const write: Record<string, string> = {};
    p.write.forEach(f => { if (files.current[f] !== undefined) write[f] = files.current[f]; });
    const body = { rev: rev.current, write, delete: [...p.del], rename: { ...p.rename }, stdin: proj.kind === 'program' ? stdin : undefined, running: server.status.state === 'running' };
    pending.current = { write: new Set(), del: new Set(), rename: {} };
    setSave('saving');
    try {
      const r = await api.patch<{ rev: number; synced: boolean }>(`/api/sandbox/${proj.id}/files`, body);
      rev.current = r.rev; setSave('saved');
      if (r.synced) setTimeout(server.reload, stack === 'fastapi' || stack === 'flask' ? 1300 : 700);
      return true;
    } catch (e) {
      Object.keys(write).forEach(f => pending.current.write.add(f));
      body.delete.forEach(f => pending.current.del.add(f));
      Object.assign(pending.current.rename, body.rename);
      if (e instanceof ApiError && e.status === 409) { setSave('stale'); return false; }
      setSave('error');
      if (!(e instanceof ApiError) || e.status !== 0) toast({ kind: 'danger', icon: 'cloud-check', title: 'Belum tersimpan', body: e instanceof ApiError ? e.message : 'Coba lagi.' });
      return false;
    }
  }, [proj.id, proj.kind, stdin, server.status.state, server.reload, stack, mode]);
  const schedule = () => { setSave('saving'); clearTimeout(saveTimer.current); saveTimer.current = window.setTimeout(() => void flush(), 800); };
  useEffect(() => () => { void flush(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- pratinjau statis: dirakit ulang sebentar setelah mengetik
  const [staticEntry, setStaticEntry] = useState('index.html');
  const rebuildStatic = useCallback(() => { if (isStatic) setStaticDoc(buildStatic(files.current, staticEntry)); }, [isStatic, staticEntry]);
  const staticTimer = useRef(0);
  useEffect(rebuildStatic, [rebuildStatic]);

  const typedAt = useRef(0);
  const onDocChange = (path: string, tr: Transaction) => {
    files.current[path] = tr.newDoc.toString();
    pending.current.write.add(path);
    const remote = !!tr.annotation(ySyncAnnotation);
    // perubahan teman direkam dari observer Yjs (juga untuk berkas yang tidak sedang dibuka)
    if (!remote) rec.record(path, tr.changes.toJSON(), mode === 'kolab' && kol.peers.length > 1 ? me?.name.split(' ')[0] : undefined);
    if (mode !== 'kolab') schedule();
    else if (!remote) {  // indikator simpan hanya untuk ketikan sendiri; ketikan teman disimpan oleh room juga
      setSave('saving');
      if (Date.now() - typedAt.current > 900) { typedAt.current = Date.now(); kol.client?.awareness.setLocalStateField('typing', Date.now()); }
    }
    if (isStatic) { clearTimeout(staticTimer.current); staticTimer.current = window.setTimeout(rebuildStatic, 350); }
    if (problems.some(p => p.file === path)) setProblems(ps => ps.filter(p => p.file !== path));
  };

  // ---- ngoding bareng: room Yjs untuk proyek ini
  // menunggu room sebentar; kalau tidak bisa tersambung (atau ditolak), pakai simpan biasa
  useEffect(() => {
    if (mode !== 'wait') return;
    if (kol.synced) { setMode('kolab'); return; }
    if (kol.status === 'denied') { setMode('solo'); return; }
    const t = window.setTimeout(() => setMode(m => (m === 'wait' ? 'solo' : m)), 5000);
    return () => clearTimeout(t);
  }, [mode, kol.synced, kol.status]);
  useEffect(() => { if (kol.kicked) { toast({ kind: 'warning', icon: 'users', title: 'Kamu tidak lagi di proyek ini', body: 'Pemiliknya mengubah izin ngoding bareng.' }); nav('/sandbox'); } }, [kol.kicked]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (kol.rev !== null) { rev.current = kol.rev; setSave('saved'); } }, [kol.rev]);

  // isi editor sekarang berasal dari dokumen bersama: pasang yCollab, ikuti berkas yang ditambah/dihapus teman
  const client = mode === 'kolab' ? kol.client : null;
  const collabExt = useMemo(() => (client ? (path: string) => {
    const t = client.files.get(path);
    if (!t) return [];
    let um = undo.current.get(path);
    if (!um || um.scope[0] !== t) { um = new Y.UndoManager(t); undo.current.set(path, um); }
    return yCollab(t, client.awareness, { undoManager: um });
  } : undefined), [client]);
  useEffect(() => {
    if (!client) return;
    const map = client.files;
    const readAll = () => { const next: Record<string, string> = {}; map.forEach((t, k) => { next[k] = t.toString(); }); return next; };
    const relist = () => {
      const next = files.current;
      setPaths(sortPaths(Object.keys(next)));
      setTabs(t => t.filter(f => next[f] !== undefined));
      const a = activeRef.current;
      if (!a || next[a] === undefined) setActive(firstFile(proj, next));
      rebuildStatic();
    };
    undo.current.clear();
    files.current = readAll();
    pending.current = { write: new Set(), del: new Set(), rename: {} };
    Object.keys(files.current).forEach(f => editor.current?.forget(f));
    const a = activeRef.current;
    if (a && files.current[a] !== undefined) editor.current?.replace(a, files.current[a]);
    relist(); setSave('saved');
    const obs = (evs: Y.YEvent<Y.AbstractType<unknown>>[], tr: Y.Transaction) => {
      let keys = false;
      for (const e of evs) {
        if (e.target === map) keys = true;
        else {
          const k = String(e.path[0] ?? ''), t = map.get(k);
          if (!t) continue;
          const after = t.toString();
          files.current[k] = after;
          if (!tr.local && e instanceof Y.YTextEvent) {
            // replay: ubah delta Yjs jadi ChangeSet CodeMirror, penulisnya teman yang terakhir mengetik di berkas ini
            const specs: ChangeSpec[] = []; let pos = 0, ins = 0, del = 0;
            for (const d of e.delta) {
              if (d.retain) pos += d.retain;
              else if (typeof d.insert === 'string') { specs.push({ from: pos, insert: d.insert }); ins += d.insert.length; }
              else if (d.delete) { specs.push({ from: pos, to: pos + d.delete }); pos += d.delete; del += d.delete; }
            }
            const who = awareRef.current.filter(a => a.file === k && a.typing).sort((a, b) => (b.typing || 0) - (a.typing || 0))[0]?.user?.name || 'teman';
            try { rec.record(k, ChangeSet.of(specs, after.length - ins + del).toJSON(), who); } catch { /* delta aneh: dilewati */ }
          }
        }
      }
      if (keys) {
        const before = new Set(Object.keys(files.current));
        files.current = readAll();
        before.forEach(f => { if (files.current[f] === undefined) editor.current?.forget(f); });
        relist();
      }
      if (!tr.local && isStatic) { clearTimeout(staticTimer.current); staticTimer.current = window.setTimeout(rebuildStatic, 350); }
    };
    map.observeDeep(obs);
    return () => map.unobserveDeep(obs);
  }, [client]); // eslint-disable-line react-hooks/exhaustive-deps

  // siapa aku dan berkas yang kubuka (label kursor dan titik di pohon berkas teman)
  useEffect(() => {
    if (!client || !kol.you || !me) return;
    const c = kol.you.color;
    client.awareness.setLocalStateField('user', { id: me.id, name: me.name.split(' ')[0], color: c, colorLight: c + '33' });
  }, [client, kol.you, me]);
  useEffect(() => { client?.awareness.setLocalStateField('file', active); }, [client, active]);

  // menonton siaran: otomatis mengikuti pemiliknya
  const watching = params.get('tonton') === '1';
  useEffect(() => {
    if (!watching || follow !== null || !kol.peers.length) return;
    const host = kol.peers.find(p => p.role === 'owner');
    if (host && host.id !== me?.id) setFollow(host.id);
  }, [watching, kol.peers, follow, me?.id]);
  // mode Ikuti: buka berkas yang sama, gulir ke kursornya
  useEffect(() => {
    if (!client || follow === null) return;
    const a = aware.find(x => x.user?.id === follow);
    if (!a?.file) return;
    if (a.file !== activeRef.current && files.current[a.file] !== undefined) { openFile(a.file); return; }
    const head = a.cursor?.head, t = client.files.get(a.file), v = editor.current?.view();
    if (!head || !t || !v) return;
    const pos = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(head), client.doc);
    if (pos && pos.type === t && pos.index <= v.state.doc.length) v.dispatch({ effects: EditorView.scrollIntoView(pos.index, { y: 'center' }) });
  }, [aware, follow, client]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (follow !== null && !kol.peers.some(p => p.id === follow)) setFollow(null); }, [kol.peers, follow]);

  // hasil Jalankan teman ikut tampil di terminalku
  ranRef.current = r => {
    sound('tap');
    say({ k: 'dim', t: `▶ ${r.by.name.split(' ')[0]} menjalankan proyek` }, ...r.lines.map(l => ({ k: (['out', 'err', 'ok', 'dim', 'warn'].includes(l.k) ? l.k : 'out') as TermLine['k'], t: l.t })));
    if (r.web) { if (isStatic) rebuildStatic(); else server.reload(); }
    else setBot('terminal');
  };
  const shareRun = (ok: boolean, lines: TermLine[], web = false) => { if (mode === 'kolab') kol.client?.json({ t: 'ran', ok, web, lines: lines.filter(l => l.k !== 'in').slice(-120) }); };

  // ---- berkas
  const openFile = (f: string) => { setTabs(t => (t.includes(f) ? t : [...t, f])); setActive(f); if (size === 'hp') setHpView('kode'); if (size === 'sempit') setSide(null); };
  // chip "baris N" di Orvi AI: lompat ke baris itu kalau berkasnya ada di proyek ini
  const openRef = useRef(openFile); openRef.current = openFile;
  useEffect(() => {
    const f = (e: Event) => {
      const d = (e as CustomEvent<{ berkas: string; baris: number }>).detail;
      if (files.current[d.berkas] === undefined) return;
      openRef.current(d.berkas); window.setTimeout(() => editor.current?.reveal(d.baris), 60);
    };
    addEventListener('orvi:reveal', f); return () => removeEventListener('orvi:reveal', f);
  }, []);
  const closeTab = (f: string) => setTabs(t => { const n = t.filter(x => x !== f); if (active === f) setActive(n[n.length - 1] ?? null); return n; });
  const validName = (n: string) => (isWeb ? /^(?!\/)(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9_][A-Za-z0-9_./-]{0,119}$/ : /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/).test(n);
  const addFile = (name: string, body = '') => {
    const f = name.trim().replace(/^\/+/, '');
    setNewName(null);
    if (!f) return;
    if (!validName(f)) { toast({ kind: 'danger', icon: 'file-x', title: 'Nama berkas tidak valid', body: isWeb ? 'Pakai huruf, angka, titik, strip, garis bawah, dan / untuk folder.' : 'Proyek program tidak memakai folder. Pakai huruf, angka, titik, strip, dan garis bawah.' }); return; }
    if (files.current[f] === undefined) {
      files.current[f] = body;
      if (mode === 'kolab' && kol.client) kol.client.files.set(f, new Y.Text(body));
      else { pending.current.write.add(f); pending.current.del.delete(f); schedule(); }
      setPaths(sortPaths(Object.keys(files.current))); rebuildStatic();
    }
    openFile(f);
  };
  const removeFile = (f: string) => {
    if (f === proj.entry) { toast({ kind: 'warning', icon: 'lock', title: 'Berkas utama', body: `${f} dijalankan saat proyek dijalankan, jadi tidak bisa dihapus.` }); return; }
    if (!confirm(`Hapus ${f}?`)) return;
    delete files.current[f];
    if (mode === 'kolab' && kol.client) kol.client.files.delete(f);
    else { pending.current.write.delete(f); pending.current.del.add(f); schedule(); }
    editor.current?.forget(f); closeTab(f); setPaths(sortPaths(Object.keys(files.current))); rebuildStatic();
  };
  const renameFile = (from: string, to: string) => {
    setRenaming(null);
    to = to.trim();
    if (!to || to === from) return;
    if (from === proj.entry) { toast({ kind: 'warning', icon: 'lock', title: 'Berkas utama', body: 'Nama berkas utama tidak bisa diganti.' }); return; }
    if (!validName(to) || files.current[to] !== undefined) { toast({ kind: 'danger', icon: 'file-x', title: 'Nama tidak bisa dipakai', body: files.current[to] !== undefined ? 'Sudah ada berkas dengan nama itu.' : 'Nama berkas tidak valid.' }); return; }
    files.current[to] = files.current[from]; delete files.current[from];
    if (mode === 'kolab' && kol.client) {
      const c = kol.client, body = c.files.get(from)?.toString() ?? files.current[to];
      c.doc.transact(() => { c.files.delete(from); c.files.set(to, new Y.Text(body)); });
      editor.current?.forget(from);
    } else {
      if (pending.current.write.delete(from)) pending.current.write.add(to);
      pending.current.rename[from] = to;
      editor.current?.rename(from, to);
    }
    setTabs(t => t.map(x => (x === from ? to : x))); if (active === from) setActive(to);
    setPaths(sortPaths(Object.keys(files.current))); schedule(); rebuildStatic();
  };

  // ---- snapshot, jalankan
  const snapshot = async (label = '') => {
    setSnapBusy(true);
    await flush();
    try {
      const r = await api.post<{ created: boolean; message?: string }>(`/api/sandbox/${proj.id}/snapshots`, { label });
      if (r.created) { sound('snap'); emit('snapshot', { project: proj.id }); toast({ kind: 'success', icon: 'history', title: 'Snapshot tersimpan', body: label || 'Versi ini bisa dipulihkan kapan saja dari panel Versi.', ms: 2400 }); say({ k: 'ok', t: `✓ snapshot tersimpan${label ? `: ${label}` : ''}` }); }
      else say({ k: 'dim', t: r.message || 'Belum ada perubahan sejak snapshot terakhir.' });
    } catch (e) { say({ k: 'err', t: e instanceof ApiError ? e.message : 'Snapshot gagal.' }); }
    finally { setSnapBusy(false); }
  };

  const explain = async (out: RunOut) => {
    if (!out.error) return null;
    try { return await api.post<Diag>('/api/diagnose', { code: files.current[proj.entry || ''] || '', error: out.error, where: 'playground', lang: proj.lang }); } catch { return null; }
  };
  /** Jalankan proyek. Kembalikan ringkasan keluaran (dipakai alat `jalankan` di Orvi AI). */
  const run = async (): Promise<string> => {
    if (running) return 'Proyek sedang berjalan.';
    if (!canEdit) { toast({ icon: 'git-branch', title: 'Proyek milik orang lain', body: 'Remix dulu dari Galeri untuk menjalankannya di Sandbox-mu.' }); return 'Proyek ini milik orang lain, tidak bisa dijalankan.'; }
    setRunning(true); sound('tap');
    try {
      await flush();
      if (isWeb) {
        let note = 'Pratinjau dimuat ulang.';
        if (isStatic) { rebuildStatic(); setStaticDoc(d => d + ' '); say({ k: 'dim', t: 'pratinjau dimuat ulang' }); }
        else if (server.status.state === 'stopped' || server.status.state === 'exited') {
          say({ k: 'in', t: STACKS[stack!]?.run || 'start' });
          const err = await server.act('start');
          if (err) { say({ k: 'err', t: err }); setBot('log'); emit('run:error', { project: proj.id, message: err }); return `Server gagal jalan: ${err}`; }
          setBot('log'); note = 'Server web dijalankan.';
        } else server.reload();
        if (size === 'hp') setHpView('pratinjau');
        void api.post(`/api/sandbox/${proj.id}/ran`).catch(() => {});
        shareRun(true, [], true);
        emit('run:ok', { project: proj.id });
        if (motion() === 'full') burst(runBtn.current, { count: 10 });
        return `${note} Ini proyek web; hasilnya tampil di pratinjau, jadi tidak ada keluaran terminal.`;
      }
      setBot('terminal');
      say({ k: 'in', t: `run ${proj.entry}` });
      const out = await api.post<RunOut>(`/api/sandbox/${proj.id}/run`, { stdin });
      const said: TermLine[] = [];
      const put = (...l: TermLine[]) => { said.push(...l); say(...l); };
      if (out.compile && !out.compile.ok) put({ k: 'err', t: out.compile.stderr || 'Kompilasi gagal.' });
      out.stdout.forEach(t => put({ k: 'out', t }));
      if (out.stderr) put({ k: 'err', t: out.stderr.trimEnd() });
      if (out.timeout) put({ k: 'warn', t: 'Program dihentikan karena terlalu lama (mungkin ada perulangan tanpa akhir).' });
      if (out.oom) put({ k: 'warn', t: 'Program dihentikan karena memorinya penuh.' });
      if (out.truncated) put({ k: 'dim', t: '… keluaran dipotong' });
      put({ k: out.ok ? 'ok' : 'err', t: `${out.ok ? '✓ selesai' : '✗ berhenti'}${out.exit != null ? ` · kode ${out.exit}` : ''}${out.total_ms != null ? ` · ${out.total_ms} ms` : ''}` });
      shareRun(out.ok, said);
      const diags: Problem[] = (out.diagnostics || []).map(d => ({ ...d, file: proj.entry || '' }));
      if (out.error && !diags.length) diags.push({ file: proj.entry || '', line: out.error.line, col: out.error.col, severity: out.error.severity === 'warning' ? 'warning' : 'error', message: `${out.error.name}: ${out.error.message}` });
      if (out.ok) {
        setProblems([]); sound('ok'); emit('run:ok', { project: proj.id });
        if (motion() === 'full') burst(runBtn.current, { count: 12 });
      } else {
        const ex = await explain(out);
        if (diags[0]) diags[0].explain = ex;
        setProblems(diags); sound('err'); emit('run:error', { project: proj.id, message: out.error?.message || 'error' });
        if (diags.length) setBot('masalah');
        if (motion() !== 'off') shake(root.current?.querySelector('.ide-main'));
      }
      return said.map(l => l.t).join('\n').slice(-6000);
    } catch (e) {
      say({ k: 'err', t: e instanceof ApiError ? e.message : 'Runner belum bisa dihubungi.' });
      emit('run:error', { project: proj.id, message: 'runner' });
      return 'Runner belum bisa dihubungi.';
    } finally { setRunning(false); }
  };

  // ---- alat untuk Orvi AI: baca/tulis berkas dan jalankan proyek ini (Sandbox yang terakhir disentuh menang)
  const orviRef = useRef({ run, canEdit, mode, isWeb, active });
  const orviTools = useRef<OrviTools | null>(null);
  const orviWorking = useOrviTools(s => s.working === proj.id);
  // jendela Sandbox kelihatan (tidak dikecilkan / tertutup jendela maksimal): baru animasi di editornya ada artinya
  const shown = () => { const w = root.current?.closest('.os-win'); return !!root.current?.offsetParent && !w?.classList.contains('is-min') && !w?.classList.contains('is-occluded'); };
  orviRef.current = { run, canEdit, mode, isWeb, active };
  useEffect(() => {
    const tools: OrviTools = {
      id: proj.id, title: proj.title, bahasa: proj.lang || (isWeb ? 'web' : ''), canEdit,
      list: () => sortPaths(Object.keys(files.current)),
      read: path => (files.current[path] ?? null),
      write: (path, isi) => {
        const o = orviRef.current;
        if (!o.canEdit) return 'Proyek ini hanya bisa dilihat, tidak bisa diubah.';
        const f = path.trim().replace(/^\/+/, '');
        if (!validName(f)) return o.isWeb ? 'Nama berkas tidak valid.' : 'Nama berkas tidak valid (proyek program tidak memakai folder).';
        if (files.current[f] === undefined) { addFile(f, isi); return null; }
        const yt = o.mode === 'kolab' ? kol.client?.files.get(f) : null;
        if (yt) { yt.doc?.transact(() => { yt.delete(0, yt.length); yt.insert(0, isi); }); return null; }  // editor ikut lewat yCollab
        const v = editor.current?.view();
        if (v && o.active === f) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: isi } });  // bisa di-undo, simpan lewat onDocChange
        else { files.current[f] = isi; editor.current?.replace(f, isi); pending.current.write.add(f); schedule(); rebuildStatic(); }
        openRef.current(f);
        return null;
      },
      remove: path => {
        if (files.current[path] === undefined || path === proj.entry) return;
        delete files.current[path];
        if (orviRef.current.mode === 'kolab' && kol.client) kol.client.files.delete(path);
        else { pending.current.write.delete(path); pending.current.del.add(path); schedule(); }
        editor.current?.forget(path); setTabs(t => t.filter(x => x !== path)); if (orviRef.current.active === path) setActive(null); setPaths(sortPaths(Object.keys(files.current))); rebuildStatic();
      },
      run: () => orviRef.current.run(),
      scan: path => {
        const v = editor.current?.view();
        if (v && orviRef.current.active === path && shown()) {
          const b = document.createElement('div'); b.className = 'orvi-scan-beam'; b.style.setProperty('--h', `${Math.max(60, v.dom.clientHeight - 28)}px`);
          v.dom.appendChild(b); b.addEventListener('animationend', () => b.remove());
          return;
        }
        const row = root.current?.querySelector(`.ide-tree-row[data-file="${CSS.escape(path)}"]`);
        if (row) { row.classList.remove('orvi-reading'); void (row as HTMLElement).offsetWidth; row.classList.add('orvi-reading'); window.setTimeout(() => row.classList.remove('orvi-reading'), 1300); }
      },
      lineRect: async (path, line) => {
        if (orviRef.current.active !== path) openRef.current(path);
        await new Promise(r => window.setTimeout(r, 90));
        const v = editor.current?.view();
        if (!v || !shown()) return null;
        const pos = v.state.doc.line(Math.max(1, Math.min(line, v.state.doc.lines))).from;
        v.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const c = v.coordsAtPos(pos), box = v.contentDOM.getBoundingClientRect();
        return c ? new DOMRect(box.left, c.top, Math.min(box.width, 460), c.bottom - c.top) : null;
      },
      flash: (path, line, count = 1) => {
        const v = editor.current?.view();
        if (!v || orviRef.current.active !== path) return;
        const doc = v.state.doc, a = doc.line(Math.max(1, Math.min(line, doc.lines))), b = doc.line(Math.max(1, Math.min(line + count - 1, doc.lines)));
        const ca = v.coordsAtPos(a.from), cb = v.coordsAtPos(b.to), d = v.dom.getBoundingClientRect();
        if (!ca || !cb) return;
        const el = document.createElement('div'); el.className = 'orvi-line-flash';
        Object.assign(el.style, { top: `${ca.top - d.top}px`, height: `${Math.max(cb.bottom - ca.top, 18)}px` });
        v.dom.appendChild(el); el.addEventListener('animationend', () => el.remove());
      },
    };
    orviTools.current = tools;
    const release = provideTools(tools);
    const claim = () => claimTools(tools);
    const el = root.current;
    el?.addEventListener('pointerdown', claim);
    // jendela Sandbox ini jadi aktif (diklik title bar-nya, dipilih dari dock, Mission Control) → dia yang terhubung
    const stop = useWM.subscribe(st => { if (win && st.active === win.id) claim(); });
    return () => { el?.removeEventListener('pointerdown', claim); stop(); release(); };
  }, [proj.id, proj.title, proj.lang, isWeb, canEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  const command = (raw: string) => {
    say({ k: 'in', t: raw });
    const [cmd, ...args] = raw.split(/\s+/);
    if (!cmd) return;
    const secret = secretCommand(raw);
    if (secret) say(...secret);
    else if (cmd === 'help') say(...HELP);
    else if (cmd === 'clear') setTerm([]);
    else if (cmd === 'ls') say(...paths.map(t => ({ k: 'out' as const, t })));
    else if (cmd === 'cat') { const f = args.join(' '); f && files.current[f] !== undefined ? say({ k: 'out', t: files.current[f] || '(kosong)' }) : say({ k: 'err', t: `Berkas tidak ada: ${f || '(tanpa nama)'}` }); }
    else if (cmd === 'run' || /^(python3?|node|php|go|java|cargo|\.\/)/.test(cmd)) void run();
    else if (cmd === 'snapshot') void snapshot(args.join(' '));
    else say({ k: 'err', t: `Perintah "${cmd}" belum ada. Ketik help.` });
  };

  // ---- pintasan di luar editor
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (win && !win.active) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'Enter') { e.preventDefault(); void run(); }
      else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void snapshot(); }
    };
    const el = root.current; el?.addEventListener('keydown', k);
    return () => el?.removeEventListener('keydown', k);
  });

  // ---- konsol pratinjau statis → terminal & Masalah
  useEffect(() => {
    if (!isStatic) return;
    const f = (e: MessageEvent) => {
      const d = e.data as { __orv?: number; t?: string; a?: string[] };
      if (!d?.__orv || e.source !== root.current?.querySelector('iframe')?.contentWindow) return;
      if (d.t === 'nav') {
        const f = (d.a?.[0] || '').replace(/^\.?\//, '').split(/[?#]/)[0];
        if (files.current[f] !== undefined) setStaticEntry(f); else say({ k: 'warn', t: `Halaman ${f} tidak ada di proyek ini.` });
        return;
      }
      const text = (d.a || []).join(' ');
      say({ k: d.t === 'error' ? 'err' : d.t === 'warn' ? 'warn' : 'out', t: text });
      if (d.t === 'error') setProblems(ps => [...ps.filter(p => p.message !== text), { file: 'script.js', line: null, severity: 'error' as const, message: text }].slice(-20));
    };
    addEventListener('message', f); return () => removeEventListener('message', f);
  }, [isStatic, say]);

  // ---- berkas dari komputer (seret ke jendela)
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setDrop(false);
    if (!canEdit) return;
    for (const f of [...e.dataTransfer.files]) {
      if (f.name.endsWith('.zip')) { toast({ icon: 'import', title: 'Impor proyek .zip', body: 'Buka Berkas → Impor proyek (.zip) di menu, atau seret ke daftar proyek Sandbox.' }); continue; }
      if (f.size > MAX_DROP) { toast({ kind: 'danger', icon: 'file-x', title: `${f.name} terlalu besar`, body: 'Maksimal 100 KB per berkas teks.' }); continue; }
      const text = await f.text();
      if (/\u0000/.test(text)) { toast({ kind: 'danger', icon: 'file-x', title: `${f.name} bukan berkas teks`, body: 'Sandbox hanya menyimpan kode dan teks.' }); continue; }
      addFile(f.name.replace(/[^\w.-]+/g, '-'), text);
    }
  };

  // ---- pulihkan snapshot → ganti isi semua berkas
  const restored = (p: Project) => {
    if (mode === 'kolab') { rev.current = p.rev; setProj(x => ({ ...x, ...p })); setSave('saved'); return; }  // isinya datang lewat room
    files.current = { ...p.files }; rev.current = p.rev; setProj(p);
    Object.entries(p.files).forEach(([f, t]) => editor.current?.replace(f, t));
    setPaths(sortPaths(Object.keys(p.files)));
    setTabs(t => t.filter(f => p.files[f] !== undefined));
    if (active && p.files[active] === undefined) setActive(firstFile(p, p.files));
    rebuildStatic(); setSave('saved');
  };
  const reloadFromServer = async () => {
    pending.current = { write: new Set(), del: new Set(), rename: {} };
    restored(await api.get<Project>(`/api/sandbox/${proj.id}`));
    toast({ icon: 'refresh-cw', title: 'Dimuat ulang', body: 'Kamu sekarang melihat versi terbaru proyek ini.' });
  };

  // ---- cari di semua berkas
  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: { f: string; n: number; text: string }[] = [];
    for (const f of paths) (files.current[f] || '').split('\n').forEach((l, i) => { if (out.length < 200 && l.toLowerCase().includes(q)) out.push({ f, n: i + 1, text: l.trim().slice(0, 120) }); });
    return out;
  }, [query, paths, save]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- title bar
  const published = proj.visibility !== 'private' && !!proj.published;
  const others = kol.peers.filter(p => p.id !== me?.id);
  const tools = useMemo<ReactNode>(() => (
    <>
      {mode === 'kolab' && (others.length > 0 || kol.live) && (
        <button className="ide-peers hide-sm" title="Ngoding bareng" onClick={() => setSide('kolab')}>
          {kol.live && <span className="ide-live">LIVE</span>}
          {others.slice(0, 4).map(p => <span key={p.id} className="ide-peer" style={{ background: p.color }} title={`${p.name} · ${p.role === 'view' ? 'menonton' : 'ngoding'}`}>{p.initials}</span>)}
          {others.length > 4 && <span className="ide-peer more">+{others.length - 4}</span>}
        </button>
      )}
      {mode === 'kolab' && others.length === 0 && canEdit && !kol.live && <button className="btn btn-sm btn-ghost hide-sm" onClick={() => setSide('kolab')} title="Ajak teman ngoding bareng"><Icon name="user-plus" />Bareng</button>}
      {canEdit && <HelpButton context="sandbox" refPath={`/sandbox/${proj.id}`} className="hide-sm" />}
      <button className="btn btn-sm btn-ghost hide-sm" onClick={() => void (async () => { await flush(); await exportProject(proj); })()} title="Unduh proyek (.zip)"><Icon name="download" />Unduh</button>
      {canEdit && <button className="btn btn-sm hide-sm" onClick={() => setPublish(true)}><Icon name="rocket" />{published ? 'Terbit' : 'Terbitkan'}</button>}
      <button className={`btn btn-sm ide-orvi${orviWorking ? ' is-working' : ''}`} title="Minta Orvi AI bantu di proyek ini (Ctrl+J)"
        onClick={() => { if (orviTools.current) claimTools(orviTools.current); askOrviAbout(); }}><Icon name="orvi-ai" />Orvi AI</button>
      <button ref={runBtn} className={`btn btn-sm ide-run${running ? ' is-loading' : ''}`} onClick={() => void run()} title="Ctrl+Enter"><Icon name="play" />Jalankan</button>
    </>
  ), [running, published, canEdit, proj, mode, kol.peers, kol.live, me?.id, orviWorking]); // eslint-disable-line react-hooks/exhaustive-deps
  useWinTitle('Sandbox', `${proj.title}${active ? ` / ${active}` : ''}`, tools);

  const lang = active ? langOfPath(active) : proj.lang;
  const now = Date.now();
  const typing = aware.filter(a => a.user && a.typing && now - a.typing < 3500);
  const followed = follow !== null ? kol.peers.find(p => p.id === follow) : undefined;
  const activeDiags = useMemo(() => problems.filter(p => p.file === active), [problems, active]);
  const showPrev = isWeb && size !== 'hp';
  const sideOn = side !== null && size !== 'hp';
  const serverLabel = { stopped: 'server mati', starting: 'menyalakan…', running: 'server berjalan', exited: 'server berhenti' }[server.status.state];
  const prevSrc = isStatic ? null : server.preview && server.status.state !== 'stopped' ? server.preview : null;

  const act = (id: Side, icon: string, label: string) => (
    <button aria-pressed={side === id} title={label} aria-label={label} onClick={() => { setSide(s => (s === id ? null : id)); force(x => x + 1); }}><Icon name={icon} /></button>
  );
  const tree = (
    <>
      <div className="ide-side-head"><span>Berkas</span><span className="grow" />
        {canEdit && <button title="Berkas baru" aria-label="Berkas baru" onClick={() => setNewName('')}><Icon name="file-plus" /></button>}</div>
      <div className="ide-side-body">
        <div className="ide-tree-proj"><Icon name="folder-open" />{proj.title}</div>
        {newName !== null && (
          <form className="ide-tree-new" onSubmit={e => { e.preventDefault(); addFile(newName); }}>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} placeholder={isWeb ? 'folder/nama.ext' : 'nama.ext'} onBlur={() => !newName && setNewName(null)} aria-label="Nama berkas baru" />
          </form>
        )}
        {paths.map(f => {
          const depth = f.split('/').length - 1, l = langOfPath(f);
          return renaming === f
            ? <form key={f} className="ide-tree-new" onSubmit={e => { e.preventDefault(); renameFile(f, (e.currentTarget.elements[0] as HTMLInputElement).value); }}>
                <input autoFocus defaultValue={f} onBlur={e => renameFile(f, e.target.value)} aria-label={`Ganti nama ${f}`} /></form>
            : <div key={f} className="ide-tree-row" data-file={f} aria-current={active === f} style={{ ['--d' as string]: depth }} onClick={() => openFile(f)}
                onDoubleClick={() => canEdit && setRenaming(f)} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') openFile(f); if (e.key === 'F2' && canEdit) setRenaming(f); }}>
                {l !== 'text' ? <LangIcon id={l} size={16} /> : <Icon name="file" />}
                <span className="nm">{depth ? f.split('/').pop() : f}</span>
                {depth > 0 && <small>{f.slice(0, f.lastIndexOf('/'))}</small>}
                {f === proj.entry && <Icon name="play" className="entry" />}
                <PeerDots list={aware.filter(a => a.file === f)} />
                {canEdit && f !== proj.entry && <button className="del" aria-label={`Hapus ${f}`} onClick={e => { e.stopPropagation(); removeFile(f); }}><Icon name="trash-2" /></button>}
              </div>;
        })}
        <p className="ide-note"><b>{isStatic ? 'Pratinjau langsung:' : isWeb ? 'Server proyek:' : 'Program:'}</b> {isStatic ? 'setiap ketikan langsung terlihat di kanan.' : isWeb ? `tekan Jalankan untuk menyalakan server (${STACKS[stack!]?.run}).` : `${proj.entry} yang dijalankan.`} <b>Ctrl+Enter</b> menjalankan, <b>Ctrl+S</b> menyimpan snapshot. Klik dua kali nama berkas untuk menggantinya.</p>
      </div>
    </>
  );

  return (
    <div ref={root} className={`ide${isWeb ? '' : ' no-prev'}${sideOn ? '' : ' no-side'}`} data-size={size} data-view={hpView}
      onDragOver={e => { if (canEdit && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setDrop(true); } }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDrop(false); }} onDrop={e => void onDrop(e)}>
      {!win && (
        <div className="ide-classic-bar"><button className="btn btn-sm btn-ghost" onClick={() => nav('/sandbox')}><Icon name="arrow-left" />Proyek</button><b>{proj.title}</b><span className="grow" />{tools}</div>
      )}
      <div className="ide-mobtabs" role="tablist">
        {(['berkas', 'kode', 'terminal', ...(isWeb ? ['pratinjau'] : [])] as const).map(v => (
          <button key={v} aria-pressed={hpView === v} onClick={() => setHpView(v as typeof hpView)}><Icon name={({ berkas: 'folder', kode: 'code-xml', terminal: 'terminal', pratinjau: 'monitor' } as Record<string, string>)[v]} />{v[0].toUpperCase() + v.slice(1)}</button>
        ))}
      </div>

      <nav className="ide-act" aria-label="Panel Sandbox">
        {act('berkas', 'folder', 'Berkas')}{act('cari', 'search', 'Cari')}
        {canEdit && act('versi', 'history', 'Versi (snapshot)')}
        {proj.replay && act('replay', 'clapperboard', 'Replay')}
        {mode === 'kolab' && <span className="ide-act-kolab">{act('kolab', 'users', 'Ngoding bareng')}{others.length > 0 && <i>{others.length}</i>}</span>}
        {dbEngine && <button aria-pressed={bot === 'db'} title="Database" aria-label="Database" onClick={() => setBot('db')}><Icon name="database" /></button>}
        <span className="spacer" />
        <button title="Proyek saya" aria-label="Proyek saya" onClick={() => nav('/sandbox')}><Icon name="layout-grid" /></button>
      </nav>

      {(sideOn || size === 'hp') && (
        <aside className="ide-side" aria-label="Panel samping">
          {(side === 'berkas' || size === 'hp' || !side) && tree}
          {side === 'cari' && size !== 'hp' && <>
            <div className="ide-side-head"><span>Cari</span></div>
            <div className="ide-side-body">
              <input className="ide-search" autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari di semua berkas…" aria-label="Cari di semua berkas" />
              {hits.map((h, i) => {
                const k = h.text.toLowerCase().indexOf(query.trim().toLowerCase()), ql = query.trim().length;
                return <button key={i} className="ide-hit" onClick={() => { openFile(h.f); setTimeout(() => editor.current?.reveal(h.n), 60); }}>
                  <b>{h.f}:{h.n}</b><code>{k < 0 ? h.text : <>{h.text.slice(0, k)}<mark>{h.text.slice(k, k + ql)}</mark>{h.text.slice(k + ql)}</>}</code></button>;
              })}
              {query.trim().length >= 2 && !hits.length && <p className="ide-note">Tidak ada yang cocok.</p>}
            </div></>}
          {side === 'versi' && size !== 'hp' && <><div className="ide-side-head"><span>Versi</span></div>
            <div className="ide-side-body"><VersionsPanel nid={proj.id} busy={snapBusy} onSnap={l => void snapshot(l)} open={s => { void flush(); setDiffSnap(s); }} /></div></>}
          {side === 'kolab' && size !== 'hp' && mode === 'kolab' && <><div className="ide-side-head"><span>Ngoding bareng</span></div>
            <div className="ide-side-body"><KolabPanel proj={proj} kol={kol} aware={aware} follow={follow} setFollow={setFollow} /></div></>}
          {side === 'replay' && size !== 'hp' && <><div className="ide-side-head"><span>Replay</span></div>
            <div className="ide-side-body"><ReplayPanel nid={proj.id} open={s => { void rec.flush(); setReplay(s); }} /></div></>}
        </aside>
      )}

      <section className="ide-main" aria-label="Editor">
        <div className="ide-tabs" role="tablist">
          {tabs.map(f => (
            <span key={f} className="ide-tab" role="tab" aria-selected={active === f} tabIndex={0} onClick={() => setActive(f)} onKeyDown={e => { if (e.key === 'Enter') setActive(f); }}>
              {langOfPath(f) !== 'text' ? <LangIcon id={langOfPath(f)} size={15} /> : <Icon name="file" />}{f.split('/').pop()}
              {mode !== 'kolab' && pending.current.write.has(f) && <i className="dot" />}
              <PeerDots list={aware.filter(a => a.file === f)} />
              <button className="x" aria-label={`Tutup ${f}`} onClick={e => { e.stopPropagation(); closeTab(f); }}><Icon name="x" /></button>
            </span>
          ))}
          <span className="fill" />
        </div>
        <div className="ide-editors">
          {active ? <SandboxEditor ref={editor} path={active} initial={f => files.current[f] ?? ''} readOnly={!canEdit || mode === 'wait' || (mode === 'kolab' && kol.status !== 'online')}
              extra={collabExt} recreate={mode === 'kolab'} collab={mode === 'kolab'} onDocChange={onDocChange}
              onCursor={(l, c) => setCursor([l, c])} onRun={() => void run()} onSave={() => void snapshot()} diagnostics={activeDiags} label="Sandbox" />
            : <div className="ide-empty"><Orvi size={72} mood="idle" force /><p>Pilih berkas di panel kiri, atau buat berkas baru.</p></div>}
          {diffSnap && <DiffOverlay project={proj} snap={diffSnap} current={files.current} close={() => setDiffSnap(null)} restored={restored} />}
          {replay && <ReplayPlayer nid={proj.id} session={replay} close={() => setReplay(null)} />}
        </div>
      </section>

      <section className="ide-bot" aria-label="Terminal dan masalah">
        <div className="ide-bot-tabs" role="tablist">
          <button role="tab" aria-selected={bot === 'terminal'} onClick={() => setBot('terminal')}><Icon name="terminal" />Terminal</button>
          <button role="tab" aria-selected={bot === 'masalah'} onClick={() => setBot('masalah')}>Masalah{problems.length > 0 && <span className="n">{problems.length}</span>}</button>
          {!isWeb && <button role="tab" aria-selected={bot === 'input'} onClick={() => setBot('input')}>Input</button>}
          {isWeb && !isStatic && <button role="tab" aria-selected={bot === 'log'} onClick={() => setBot('log')}>Log server</button>}
          {dbEngine && <button role="tab" aria-selected={bot === 'db'} onClick={() => setBot('db')}><Icon name="database" />Database</button>}
          <span className="grow" />
          {bot === 'terminal' && <button className="ic" aria-label="Bersihkan terminal" title="Bersihkan" onClick={() => setTerm([])}><Icon name="trash-2" /></button>}
          {bot === 'log' && <button className="ic" aria-label="Bersihkan log" title="Bersihkan" onClick={server.clearLogs}><Icon name="trash-2" /></button>}
        </div>
        <div className="ide-bot-body">
          {bot === 'terminal' && <Terminal lines={term} files={paths} onCommand={command} prompt={`${proj.title.toLowerCase().replace(/\s+/g, '-').slice(0, 24)} $`} />}
          {bot === 'masalah' && (problems.length ? (
            <div className="ide-probs">{problems.map((p, i) => (
              <div key={i} className="ide-prob"><Icon name={p.severity === 'warning' ? 'triangle-alert' : 'circle-x'} />
                <b>{p.message}</b><small>{p.file}{p.line ? `:${p.line}` : ''}</small>
                {p.explain?.available && p.explain.text && <div className="ide-prob-orvi"><Orvi size={34} mood="think" force /><Html as="span" html={p.explain.text} /></div>}
                <div className="acts">
                  {p.line && <button className="btn btn-sm" onClick={() => { openFile(p.file); setTimeout(() => editor.current?.reveal(p.line!), 60); }}><Icon name="arrow-right" />Ke baris {p.line}</button>}
                  <button className="btn btn-sm" onClick={() => askOrviAbout({ pertanyaan: `Kenapa muncul error ini: ${p.message}?`, konteks: { bahasa: langOfPath(p.file), kode: files.current[p.file] || '', error: p.message, berkas: p.file, baris: p.line || null } })}>
                    <Icon name="orvi-ai" />Tanya Orvi AI</button>
                  {p.explain?.fix && canEdit && <button className="btn btn-sm btn-primary" onClick={() => { const v = editor.current?.view(); if (v && active === p.file) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: p.explain!.fix!.code } }); else editor.current?.replace(p.file, p.explain!.fix!.code); }}><Icon name="wand-sparkles" />{p.explain.fix.label}</button>}
                </div>
              </div>))}</div>
          ) : <div className="ide-ok-empty"><Icon name="circle-check" />Tidak ada masalah. Orvi senang.</div>)}
          {bot === 'input' && <div className="ide-stdin"><label className="os-field"><span>Input program (stdin): dibaca oleh input(), scanf, cin, dan sejenisnya</span>
            <textarea value={stdin} readOnly={!canEdit} onChange={e => { setStdin(e.target.value); if (mode === 'kolab') stdinDirty.current = true; else pending.current.write.add(proj.entry || ''); schedule(); }} spellCheck={false} placeholder={'5\nNadia'} rows={5} /></label></div>}
          {bot === 'log' && <div className="ide-term">{server.logs.length ? server.logs.map((l, i) => <div key={i} className={`l ${/error|exception|traceback|fatal/i.test(l.text) ? 'err' : 'out'}`}>{l.text}</div>)
            : <div className="l dim">{server.status.state === 'stopped' ? 'Log server muncul di sini setelah server dijalankan.' : 'menunggu keluaran server…'}</div>}
            {server.status.state === 'exited' && <div className="l err">✗ server berhenti{server.status.oom ? ' karena memori penuh' : ''}. Perbaiki error di atas, lalu Jalankan lagi.</div>}</div>}
          {bot === 'db' && dbEngine && <DbPanel nid={proj.id} engine={dbEngine} running={server.status.state === 'running'} title={proj.title} onStart={() => void run()} />}
        </div>
      </section>

      {(showPrev || (size === 'hp' && isWeb)) && (
        <section className="ide-prev" aria-label="Pratinjau">
          <div className="ide-prev-bar">
            <button aria-label="Muat ulang" title="Muat ulang" onClick={() => (isStatic ? setStaticDoc(d => d + ' ') : server.reload())}><Icon name="refresh-cw" /></button>
            <span className="ide-prev-url"><Icon name="lock" />{isStatic ? `${proj.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pratinjau.orvella/${staticEntry === 'index.html' ? '' : staticEntry}` : prevSrc ? new URL(prevSrc).host : serverLabel}</span>
            <span className={`ide-prev-live${!isStatic && server.status.state !== 'running' ? ' is-off' : ''}`}>{isStatic ? 'langsung' : serverLabel}</span>
            <button aria-label="Lebar HP" title="Lebar HP" aria-pressed={phone} onClick={() => setPhone(p => !p)}><Icon name="smartphone" /></button>
            {prevSrc && <a aria-label="Buka di tab baru" title="Buka di tab baru" href={prevSrc} target="_blank" rel="noopener"><Icon name="external-link" /></a>}
          </div>
          <div className={`ide-prev-stage${phone ? ' is-hp' : ''}`}>
            {isStatic ? <SrcDocFrame title="Pratinjau" doc={staticDoc} sandbox="allow-scripts allow-modals allow-forms allow-popups" />
              : prevSrc ? <iframe key={server.reloadKey} title="Pratinjau" src={prevSrc} sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin" />
              : <div className="ide-prev-off"><span className="icons">{STACKS[stack!]?.icons.map(i => <LangIcon key={i} id={i} size={34} />)}</span>
                  <b>{server.status.state === 'starting' ? 'Menyalakan server…' : 'Server belum menyala'}</b><small>Tekan Jalankan. Websitemu muncul di sini.</small>
                  {canEdit && server.status.state !== 'starting' && <button className="btn btn-sm btn-primary" disabled={server.busy} onClick={() => void run()}><Icon name="play" />Jalankan</button>}</div>}
          </div>
        </section>
      )}

      <footer className="ide-st">
        {canEdit ? <button onClick={() => setSide('versi')}><Icon name="history" />{snapBusy ? 'menyimpan snapshot…' : 'Versi'}</button> : <span><Icon name="eye" />hanya lihat</span>}
        <button onClick={() => setBot('masalah')}><Icon name={problems.length ? 'circle-x' : 'circle-check'} />{problems.length}</button>
        <span className={`save is-${save}`}>{save === 'saving' ? 'menyimpan…' : save === 'saved' ? 'tersimpan' : save === 'stale' ? 'diubah di tempat lain' : 'belum tersimpan'}</span>
        {save === 'stale' && <button className="warn" onClick={() => void reloadFromServer()}><Icon name="refresh-cw" />Muat versi terbaru</button>}
        {mode === 'wait' && <span className="kol">menyambung…</span>}
        {mode === 'kolab' && kol.status !== 'online' && <span className="warn"><Icon name="wifi-off" />koneksi putus, menyambung ulang…</span>}
        {typing.length > 0 && <span className="kol typing">{typing.map(a => a.user!.name).join(', ')} mengetik{typing[0].file ? ` di ${typing[0].file}` : ''}</span>}
        {followed && <button className="kol" onClick={() => setFollow(null)}><Icon name="eye" />mengikuti {followed.name.split(' ')[0]} · berhenti</button>}
        <span className="grow" />
        <span className="hide-sm">Ln {cursor[0]}, Kol {cursor[1]}</span>
        <span className="hide-sm">{lang === 'text' ? 'Teks' : lang.toUpperCase()}</span>
        {isWeb && <span className={isStatic || server.status.state === 'running' ? 'live' : ''}><Icon name="radio" />{isStatic ? 'Pratinjau langsung' : serverLabel}</span>}
        {rec.recording && <span className="rec">Merekam replay</span>}
      </footer>

      <div className={`ide-dropover${drop ? ' is-on' : ''}`} aria-hidden="true"><Icon name="import" /><b>Lepas untuk menambahkan berkas</b><small>Berkas teks sampai 100 KB</small></div>
      {publish && <PublishSheet project={proj} close={() => setPublish(false)} done={p => setProj(x => ({ ...x, ...p, files: x.files }))} />}
    </div>
  );
}

/** Titik warna untuk teman yang sedang membuka berkas ini. */
function PeerDots({ list }: { list: { clientId: number; user?: { name: string; color: string } }[] }) {
  const u = list.filter(a => a.user);
  if (!u.length) return null;
  return <span className="ide-pdots" aria-label={`Dibuka ${u.map(a => a.user!.name).join(', ')}`}>{u.slice(0, 3).map(a => <i key={a.clientId} style={{ background: a.user!.color }} title={a.user!.name} />)}</span>;
}
