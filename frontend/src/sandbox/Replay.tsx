/* Replay: merekam cara kode ditulis (ChangeSet CodeMirror per ketikan) lalu memutarnya ulang.
   Perekam mengirim potongan ke POST /api/sandbox/{id}/replay; pemutar dipakai di Sandbox dan Galeri. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChangeSet, EditorState, StateEffect, Text } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { syntaxHighlighting } from '@codemirror/language';
import { api } from '../api/client';
import { useApi } from '../api/hooks';
import { Icon } from '../design/Icon';
import { loadLanguage, orvellaHighlight } from '../code/CodeEditor';
import { langOfPath } from '../playground/stacks';
import type { ReplayEvent, ReplaySession } from './types';

const FLUSH_MS = 8000, FLUSH_N = 300;
const newSession = () => Math.random().toString(36).slice(2, 12);

/** Perekam satu sesi. record() dipanggil per transaksi editor; potongan dikirim berkala dan saat keluar. */
export function useReplayRecorder(nid: number, enabled: boolean) {
  const st = useRef({ session: newSession(), seq: 0, t0: 0, buf: [] as ReplayEvent[], full: false });
  const [recording, setRecording] = useState(false);
  const flush = useCallback(async () => {
    const s = st.current;
    if (!s.buf.length || s.full) return;
    const events = s.buf; s.buf = [];
    try {
      const r = await api.post<{ stored: boolean; reason?: string }>(`/api/sandbox/${nid}/replay`, { session: s.session, seq: s.seq, events });
      s.seq++;
      if (!r.stored && r.reason === 'full') { s.full = true; setRecording(false); }
    } catch { s.buf = [...events, ...s.buf].slice(-2000); }
  }, [nid]);
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => void flush(), FLUSH_MS);
    const bye = () => void flush();
    addEventListener('pagehide', bye);
    return () => { clearInterval(t); removeEventListener('pagehide', bye); void flush(); };
  }, [enabled, flush]);
  const record = useCallback((path: string, changes: unknown, author?: string) => {
    const s = st.current;
    if (!enabled || s.full) return;
    if (!s.t0) { s.t0 = performance.now(); setRecording(true); }
    s.buf.push(author ? [Math.round(performance.now() - s.t0), path, changes, author] : [Math.round(performance.now() - s.t0), path, changes]);
    if (s.buf.length >= FLUSH_N) void flush();
  }, [enabled, flush]);
  return { record, recording, flush };
}

export function ReplayPanel({ nid, open }: { nid: number; open: (s: ReplaySession) => void }) {
  const q = useApi<{ items: ReplaySession[] }>(`/api/sandbox/${nid}/replay`);
  return (
    <>
      <div className="ide-snaps" role="list">
        {q.data?.items.map(s => (
          <button key={s.session} role="listitem" className="ide-snap" onClick={() => open(s)}>
            <span className="dot is-rec" /><b>Sesi {s.ago}</b><small>{s.events} perubahan</small>
          </button>
        ))}
        {q.data && !q.data.items.length && <p className="ide-note">Belum ada rekaman. Ketikanmu mulai direkam begitu kamu mengetik di proyek ini.</p>}
        {q.isError && <p className="ide-note">Replay proyek ini tidak dibagikan.</p>}
      </div>
      <p className="ide-note"><b>Replay</b> memutar ulang cara kodenya ditulis, huruf demi huruf. Mentor bisa melihat cara berpikirmu, dan kamu bisa memamerkannya di Galeri.</p>
    </>
  );
}

type Frame = { i: number; docs: Record<string, Text> };
const SPEEDS = [1, 2, 4, 8];
const fmt = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function ReplayPlayer({ nid, session, title, close }: { nid: number; session: ReplaySession; title?: string; close: () => void }) {
  const q = useApi<{ base: Record<string, string>; events: ReplayEvent[] }>(`/api/sandbox/${nid}/replay/${session.session}`);
  const events = q.data?.events || [];
  const dur = events.length ? events[events.length - 1][0] : 0;
  // titik simpan tiap 200 kejadian supaya menggeser mundur tetap cepat
  const checkpoints = useMemo(() => {
    if (!q.data) return [] as Frame[];
    const docs: Record<string, Text> = {};
    for (const [k, v] of Object.entries(q.data.base)) docs[k] = Text.of(v.split('\n'));
    const out: Frame[] = [{ i: 0, docs: { ...docs } }];
    events.forEach(([, f, ch], i) => {
      try { docs[f] = ChangeSet.fromJSON(ch).apply(docs[f] || Text.empty); } catch { /* kejadian rusak dilewati */ }
      if ((i + 1) % 200 === 0) out.push({ i: i + 1, docs: { ...docs } });
    });
    return out;
  }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const [pos, setPos] = useState(0);        // jumlah kejadian yang sudah diterapkan
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const host = useRef<HTMLDivElement>(null), view = useRef<EditorView | null>(null), shown = useRef('');

  const at = useCallback((n: number) => {
    const cp = [...checkpoints].reverse().find(c => c.i <= n) || checkpoints[0];
    const docs = { ...cp.docs };
    for (let i = cp.i; i < n; i++) { const [, f, ch] = events[i]; try { docs[f] = ChangeSet.fromJSON(ch).apply(docs[f] || Text.empty); } catch { /* */ } }
    return docs;
  }, [checkpoints, events]);
  const file = pos > 0 ? events[pos - 1][1] : Object.keys(q.data?.base || {})[0] || (events[0]?.[1] ?? '');

  useEffect(() => {
    if (!host.current || !checkpoints.length) return;
    const docs = at(pos), doc = docs[file] || Text.empty;
    if (!view.current || shown.current !== file) {
      view.current?.destroy();
      view.current = new EditorView({ parent: host.current, state: EditorState.create({ doc, extensions: [EditorState.readOnly.of(true), EditorView.editable.of(false),
        syntaxHighlighting(orvellaHighlight), EditorView.theme({ '&': { height: '100%' }, '.cm-scroller': { overflow: 'auto' } })] }) });
      shown.current = file;
      void loadLanguage(langOfPath(file)).then(ext => view.current?.dispatch({ effects: StateEffect.appendConfig.of(ext) }));
    } else {
      const v = view.current, head = pos > 0 ? ChangeSet.fromJSON(events[pos - 1][2]).mapPos(0, 1) : 0;
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: doc }, selection: { anchor: Math.min(head, doc.length) }, scrollIntoView: true });
    }
  }, [pos, file, checkpoints]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => view.current?.destroy(), []);

  // putar: maju mengikuti waktu asli dikali kecepatan (jeda panjang dipersingkat)
  useEffect(() => {
    if (!playing) return;
    if (pos >= events.length) { setPlaying(false); return; }
    const gap = pos === 0 ? 300 : Math.min(1200, events[pos][0] - events[pos - 1][0]) / speed;
    const t = setTimeout(() => setPos(p => Math.min(events.length, p + 1)), Math.max(8, gap));
    return () => clearTimeout(t);
  }, [playing, pos, speed, events]);

  const track = useRef<HTMLDivElement>(null);
  const seek = (clientX: number) => {
    const r = track.current!.getBoundingClientRect(), f = Math.min(1, Math.max(0, (clientX - r.left) / r.width)), t = f * dur;
    let n = events.findIndex(e => e[0] > t); if (n < 0) n = events.length;
    setPos(n);
  };
  const now = pos > 0 ? events[pos - 1][0] : 0;
  const author = pos > 0 ? events[pos - 1][3] : undefined;
  return (
    <div className="ide-over" role="dialog" aria-label="Replay">
      <div className="ide-over-head"><Icon name="clapperboard" /><span><b>Replay{title ? ` · ${title}` : ''}</b> <small>sesi {session.ago}</small></span><span className="grow" />
        <button className="btn btn-sm" onClick={close}><Icon name="x" />Tutup</button></div>
      <div className="ide-rp-view">
        {!q.data ? <div className="ide-over-empty"><Icon name="loader-circle" className="spin" /></div> : <div ref={host} className="cm-host ide-cm" />}
        {author && <span className="ide-rp-cap">{author} sedang mengetik di {file}</span>}
      </div>
      <div className="ide-rp-bar">
        <div className="ide-rp-ctl">
          <button className="btn btn-sm btn-primary" aria-label={playing ? 'Jeda' : 'Putar'} disabled={!events.length}
            onClick={() => { if (pos >= events.length) setPos(0); setPlaying(p => !p); }}><Icon name={playing ? 'pause' : 'play'} />{playing ? 'Jeda' : 'Putar'}</button>
          <div className="os-seg" role="group" aria-label="Kecepatan">{SPEEDS.map(s => <button key={s} aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>)}</div>
          <span className="time">{fmt(now)} / {fmt(dur)}</span>
          <span className="file"><Icon name="file-code" />{file}</span>
        </div>
        <div ref={track} className="ide-rp-track" role="slider" aria-label="Posisi replay" aria-valuemin={0} aria-valuemax={events.length} aria-valuenow={pos} tabIndex={0}
          onPointerDown={e => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setPlaying(false); seek(e.clientX); }}
          onPointerMove={e => { if (e.buttons) seek(e.clientX); }}
          onKeyDown={e => { if (e.key === 'ArrowRight') setPos(p => Math.min(events.length, p + 10)); if (e.key === 'ArrowLeft') setPos(p => Math.max(0, p - 10)); if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p); } }}>
          <i className="rail" /><i className="done" style={{ width: `${dur ? (now / dur) * 100 : 0}%` }} /><i className="head" style={{ left: `${dur ? (now / dur) * 100 : 0}%` }} />
        </div>
      </div>
    </div>
  );
}
