import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { ChapterRef } from '../api/types';
import { CodeEditor } from '../code/CodeEditor';
import { runLocal, type LocalRun } from '../code/runLocal';
import { Icon } from '../design/Icon';
import { Orvi } from '../design/Orvi';
import { cx } from '../design/ui';
import { pop, shake } from '../fx';
import { Html, clean } from '../lib/html';
import type { Cell, Diag, Notebook } from './types';

type CellRun = LocalRun & { n: number; diag?: Diag | null; shown: string[] };

const css = `
.ctx-chip { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px; border-radius: 999px; border: 1.5px dashed var(--border-strong); color: var(--text-muted); font-size: 13px; transition: all var(--dur-200) var(--spring-bouncy); }
.ctx-chip:hover { border-color: var(--pahami-fill); color: var(--pahami-ink); }
.ctx-chip.is-attached { border-style: solid; border-color: var(--pahami-line); background: var(--pahami-soft); color: var(--pahami-ink); }
.cell .codecard { width: 100%; }
.cell .cc-out:empty { display: none; }
.cell .diag { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-top: 1px dashed var(--kuis-line); background: var(--kuis-soft); color: var(--text); }
.note-edit { padding: 6px 4px; font-size: 16px; line-height: 1.7; color: var(--text-muted); outline: none; border-radius: 10px; min-height: 30px; }
.note-edit:focus { background: var(--surface); box-shadow: 0 0 0 1px var(--border); padding: 6px 12px; }
.cell-tools { display: flex; gap: 2px; margin-top: 4px; opacity: 0; transition: opacity var(--dur-200); }
.cell:hover .cell-tools, .cell:focus-within .cell-tools { opacity: 1; }
.ctx-menu { position: absolute; z-index: 20; top: 40px; left: 0; }
.add-cell { padding-left: 44px; }
`;

const newId = () => Math.random().toString(16).slice(2, 10);

/** JavaScript notebook: cells share scope and run in a throwaway Web Worker in the browser. */
export function NotebookView({ nb, update, attachable, onAttach, onTemplate }: {
  nb: Notebook; update: (next: Notebook) => void; attachable: ChapterRef[]; onAttach: (id: number | null) => void; onTemplate: (t: string) => void;
}) {
  const [runs, setRuns] = useState<Record<string, CellRun>>({});
  const [active, setActive] = useState<string | null>(null);
  const [ctxOpen, setCtxOpen] = useState(false);
  const counter = useRef(0);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => { // run existing code cells once so outputs are visible on open
    setRuns({}); counter.current = 0;
    (async () => { for (const c of nb.cells) if (c.type === 'code' && c.src.trim()) await run(c.id, nb); })();
  }, [nb.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setCell = (id: string, src: string) => update({ ...nb, cells: nb.cells.map(c => (c.id === id ? { ...c, src } : c)) });
  const addCell = (type: 'code' | 'note', after?: string) => {
    const cell: Cell = { id: newId(), type, src: type === 'note' ? 'Catatan baru…' : '' };
    const cells = [...nb.cells];
    const idx = after ? cells.findIndex(c => c.id === after) + 1 : cells.length;
    cells.splice(idx, 0, cell);
    update({ ...nb, cells });
    setActive(cell.id);
  };
  const removeCell = (id: string) => update({ ...nb, cells: nb.cells.filter(c => c.id !== id) });

  async function run(id: string, source: Notebook = nb) {
    const codeCells = source.cells.filter(c => c.type === 'code');
    const idx = codeCells.findIndex(c => c.id === id);
    const cell = codeCells[idx];
    if (!cell) return;
    // notebook semantics: cells share scope, so previous code cells run first
    const prelude = codeCells.slice(0, idx).map(c => c.src).join('\n');
    const before = prelude ? (await runLocal(prelude)).logs.length : 0;
    const res = await runLocal(prelude ? `${prelude}\n${cell.src}` : cell.src);
    const preludeLines = prelude ? prelude.split('\n').length : 0;
    const line = res.error?.line ? res.error.line - preludeLines : null;
    const n = ++counter.current;
    const out: CellRun = { ...res, error: res.error ? { ...res.error, line: line && line > 0 ? line : null } : null, n, shown: res.logs.slice(before), diag: null };
    setRuns(r => ({ ...r, [id]: out }));
    if (res.error) {
      shake(cardRefs.current[id]);
      try {
        const d = await api.post<Diag>('/api/diagnose', { code: cell.src, error: out.error, scope_code: prelude, where: 'playground' });
        setRuns(r => ({ ...r, [id]: { ...out, diag: d, error: out.error && !out.error.line && d.line ? { ...out.error, line: d.line } : out.error } }));
      } catch { setRuns(r => ({ ...r, [id]: { ...out, diag: { available: false, reason: 'down' } } })); }
    }
  }

  return (
    <>
      <style>{css}</style>
      <div style={{ position: 'relative' }} className="mt-3">
        <button className={cx('ctx-chip', nb.attached && 'is-attached')} aria-expanded={ctxOpen} onClick={() => setCtxOpen(o => !o)}>
          <Icon name="link" size={14} />{nb.attached ? `Bab ${nb.attached.number} · ${nb.attached.title} · petunjuk mengikuti bab ini` : 'Tidak ada bab dilampirkan · lampirkan'}
        </button>
        {ctxOpen && (
          <div className="menu ctx-menu" role="menu">
            {attachable.map(c => <button key={c.id} className="menu-item w-full" onClick={() => { setCtxOpen(false); onAttach(c.id); }}><Icon name="book-open" />Bab {c.number} · {c.title}</button>)}
            {!attachable.length && <div className="menu-item t-faint">Belum ada bab yang dibuka</div>}
            {nb.attached && <button className="menu-item w-full" onClick={() => { setCtxOpen(false); onAttach(null); }}><Icon name="x" />Lepaskan bab</button>}
          </div>
        )}
      </div>

      {!nb.cells.length ? (
        <div className="card mt-6"><div className="empty" style={{ padding: '56px 24px' }}>
          <Orvi size="lg" mood="happy" />
          <div className="t-h3 mt-3">Kertas kosong. Mau coba apa?</div>
          <p>Tulis kode JavaScript apa saja lalu tekan jalankan. Tidak ada nilai, tidak ada yang salah.</p>
          <div className="row gap-2 mt-4 wrap center">
            <button className="btn btn-secondary btn-press" onClick={() => addCell('code')}><Icon name="code-xml" />Sel kode pertama</button>
            <button className="btn btn-ghost" onClick={() => onTemplate('tebak-angka')}>Mulai dari contoh: tebak angka</button>
          </div>
        </div></div>
      ) : (
        <div className="mt-6">
          {nb.cells.map(c => {
            const r = runs[c.id];
            return (
              <div key={c.id}>
                {c.type === 'note' ? (
                  <div className="cell is-note">
                    <div className="gut"><Icon name="text" size={14} className="t-faint" /><div className="cell-tools"><button className="btn btn-ghost btn-icon btn-sm" aria-label="Hapus catatan" onClick={() => removeCell(c.id)}><Icon name="trash-2" /></button></div></div>
                    <div className="note-edit" contentEditable suppressContentEditableWarning role="textbox" aria-label="Catatan"
                      dangerouslySetInnerHTML={{ __html: clean(c.src) }} onBlur={e => setCell(c.id, clean(e.currentTarget.innerHTML))} />
                  </div>
                ) : (
                  <div className={cx('cell', active === c.id && 'is-active')} onFocus={() => setActive(c.id)}>
                    <div className="gut">
                      <button className="run" aria-label="Jalankan sel" title="Jalankan (⇧↵)" onClick={e => { pop(e.currentTarget); run(c.id); }}><Icon name="play" size={14} /></button>
                      <span className="cnt">[{r?.n ?? ' '}]</span>
                      <div className="cell-tools"><button className="btn btn-ghost btn-icon btn-sm" aria-label="Hapus sel" onClick={() => removeCell(c.id)}><Icon name="trash-2" /></button></div>
                    </div>
                    <div className="codecard" ref={el => { cardRefs.current[c.id] = el; }}>
                      <CodeEditor value={c.src} onChange={v => setCell(c.id, v)} onRun={() => run(c.id)} runKey="Shift-Enter" small badLine={r?.error?.line ?? null}
                        label="Sel kode" placeholder="// tulis kode, lalu Shift+Enter" />
                      {r && (r.shown.length > 0 || r.error) && (
                        <div className="cc-out">
                          {r.shown.map((l, i) => <span className="out-bubble" key={i + l} style={{ animationDelay: `${i * 90}ms` }}><span className="p">›</span>{l}</span>)}
                          {r.error && <span className="out-bubble is-err"><Icon name="circle-x" size={14} />{r.error.name}: {r.error.message}</span>}
                        </div>
                      )}
                      {r?.error && r.diag && (
                        <div className="diag">
                          <Orvi size="sm" mood="think" force />
                          <div className="t-sm">
                            <span className="eyebrow" style={{ color: 'var(--kuis-ink)' }}>Orvi · penjelasan (L2)</span>
                            {r.diag.available ? <Html as="div" className="mt-1" html={r.diag.text} />
                              : <div className="mt-1">{r.diag.reason === 'capped' ? 'Mentormu membatasi penjelasan di playground. Pesan error di atas tetap akurat.' : 'Penjelasan belum tersedia saat ini. Pesan error di atas tetap akurat, dan petunjuk tertulis masih bisa dibuka.'}</div>}
                            {r.diag.fix && (
                              <div className="row gap-2 mt-2">
                                <button className="btn btn-secondary btn-sm btn-press" onClick={() => { const fixed = r.diag!.fix!.code; const next = { ...nb, cells: nb.cells.map(x => (x.id === c.id ? { ...x, src: fixed } : x)) }; update(next); setTimeout(() => run(c.id, next), 0); }}>{r.diag.fix.label}</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => setRuns(x => ({ ...x, [c.id]: { ...r, diag: { ...r.diag!, fix: undefined } } }))}>Petunjuk saja</button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="add-cell"><button className="btn btn-ghost btn-sm" onClick={() => addCell('code', c.id)}><Icon name="code-xml" />Kode</button><button className="btn btn-ghost btn-sm" onClick={() => addCell('note', c.id)}><Icon name="text" />Catatan</button></div>
              </div>
            );
          })}
          <div className="row gap-2 mt-2" style={{ paddingLeft: 44 }}><button className="btn btn-secondary btn-sm btn-press" onClick={() => addCell('code')}><Icon name="plus" />Sel kode</button><button className="btn btn-ghost btn-sm" onClick={() => addCell('note')}><Icon name="text" />Catatan</button></div>
        </div>
      )}
    </>
  );
}
