/* Versi ("mesin waktu"): daftar snapshot di panel samping, lalu perbandingan dengan versi sekarang
   yang menutupi area editor. Pulihkan membuat snapshot "Sebelum dipulihkan" dulu di server. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorState, StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { syntaxHighlighting } from '@codemirror/language';
import { unifiedMergeView } from '@codemirror/merge';
import { api, ApiError } from '../api/client';
import { useApi } from '../api/hooks';
import { Icon } from '../design/Icon';
import { toast } from '../design/toast';
import { loadLanguage, orvellaHighlight } from '../code/CodeEditor';
import { langOfPath } from '../playground/stacks';
import type { Project, Snapshot } from './types';

export function VersionsPanel({ nid, open, onSnap, busy }: { nid: number; open: (s: Snapshot) => void; onSnap: (label: string) => void; busy: boolean }) {
  const q = useApi<{ items: Snapshot[] }>(`/api/sandbox/${nid}/snapshots`, { refetchInterval: 20_000 });
  const [label, setLabel] = useState('');
  return (
    <>
      <form className="ide-snap-new" onSubmit={e => { e.preventDefault(); onSnap(label.trim()); setLabel(''); setTimeout(() => void q.refetch(), 400); }}>
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Nama snapshot (opsional)" maxLength={120} aria-label="Nama snapshot" />
        <button className="btn btn-sm btn-primary" disabled={busy} title="Ctrl+S"><Icon name="history" />Simpan</button>
      </form>
      <div className="ide-snaps" role="list">
        {q.data?.items.map((s, i) => (
          <button key={s.id} role="listitem" className={`ide-snap${i === 0 ? ' is-now' : ''}`} onClick={() => open(s)}>
            <span className="dot" /><b>{s.label}</b>
            <small>{s.ago}{s.stats.add || s.stats.del ? <> · <i>+{s.stats.add || 0}</i> <em>−{s.stats.del || 0}</em></> : null}{s.auto ? ' · otomatis' : ''}</small>
          </button>
        ))}
        {q.data && !q.data.items.length && <p className="ide-note">Belum ada snapshot. Tekan <b>Ctrl+S</b> kapan saja untuk menyimpan versi.</p>}
      </div>
      <p className="ide-note"><b>Mesin waktu.</b> Klik snapshot untuk membandingkannya dengan versi sekarang, lalu pulihkan kalau perlu.</p>
    </>
  );
}

function MergeEditor({ path, before, after }: { path: string; before: string; after: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const v = new EditorView({ parent: host.current!, state: EditorState.create({ doc: after, extensions: [
      EditorState.readOnly.of(true), EditorView.editable.of(false), syntaxHighlighting(orvellaHighlight),
      unifiedMergeView({ original: before, mergeControls: false, highlightChanges: true, gutter: true }),
      EditorView.theme({ '&': { height: '100%' }, '.cm-scroller': { overflow: 'auto' } }),
    ] }) });
    void loadLanguage(langOfPath(path)).then(ext => v.dispatch({ effects: StateEffect.appendConfig.of(ext) }));
    return () => v.destroy();
  }, [path, before, after]);
  return <div ref={host} className="cm-host ide-cm ide-merge" />;
}

export function DiffOverlay({ project, snap, current, close, restored }: {
  project: Project; snap: Snapshot; current: Record<string, string>; close: () => void; restored: (p: Project) => void;
}) {
  const q = useApi<Snapshot & { files: Record<string, string> }>(`/api/sandbox/${project.id}/snapshots/${snap.id}`);
  const [busy, setBusy] = useState(false);
  const changed = useMemo(() => {
    const old = q.data?.files || {};
    return [...new Set([...Object.keys(old), ...Object.keys(current)])].filter(f => old[f] !== current[f]).sort();
  }, [q.data, current]);
  const [file, setFile] = useState<string | null>(null);
  const f = file && changed.includes(file) ? file : changed[0] || null;
  const restore = async () => {
    setBusy(true);
    try { restored(await api.post<Project>(`/api/sandbox/${project.id}/snapshots/${snap.id}/restore`)); toast({ kind: 'success', icon: 'history', title: 'Versi dipulihkan', body: `Proyek kembali ke "${snap.label}". Versi sebelumnya tetap tersimpan sebagai snapshot.` }); close(); }
    catch (e) { toast({ kind: 'danger', icon: 'history', title: 'Belum bisa dipulihkan', body: e instanceof ApiError ? e.message : 'Coba lagi.' }); }
    finally { setBusy(false); }
  };
  return (
    <div className="ide-over" role="dialog" aria-label={`Bandingkan dengan ${snap.label}`}>
      <div className="ide-over-head"><Icon name="git-compare" /><span><b>{snap.label}</b> <small>{snap.ago} → sekarang</small></span><span className="grow" />
        {project.can_edit && <button className="btn btn-sm btn-primary" disabled={busy || !q.data} onClick={() => void restore()}><Icon name="undo-2" />Pulihkan versi ini</button>}
        <button className="btn btn-sm" onClick={close}><Icon name="x" />Tutup</button></div>
      {changed.length > 1 && <div className="ide-over-files">{changed.map(c => <button key={c} aria-pressed={c === f} onClick={() => setFile(c)}>{c}</button>)}</div>}
      {!q.data ? <div className="ide-over-empty"><Icon name="loader-circle" className="spin" /></div>
        : !f ? <div className="ide-over-empty">Tidak ada perbedaan. Versi sekarang sama dengan snapshot ini.</div>
        : <MergeEditor key={f} path={f} before={q.data.files[f] ?? ''} after={current[f] ?? ''} />}
    </div>
  );
}
