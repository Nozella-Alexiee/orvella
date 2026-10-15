/* Editor Sandbox: satu EditorView, satu EditorState per berkas (riwayat undo, kursor, dan
   gulir tiap berkas tetap saat pindah tab). Tidak dikontrol lewat `value`: perubahan dikirim
   sebagai Transaction lewat onDocChange (untuk simpan otomatis dan replay), dan extension
   tambahan per berkas (mis. yCollab untuk ngoding bareng) bisa dipasang lewat `extra`. */
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Compartment, EditorState, Prec, type Extension, type Transaction } from '@codemirror/state';
import { drawSelection, dropCursor, EditorView, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, keymap, lineNumbers, rectangularSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentLess, insertTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { loadLanguage, orvellaHighlight, WIDE_INDENT, type EditorDiag } from '../code/CodeEditor';
import { langOfPath } from '../playground/stacks';
import { yUndoManagerKeymap } from 'y-codemirror.next';

export type EditorHandle = {
  view: () => EditorView | null;
  /** Isi berkas: dari view kalau sedang aktif, dari state tersimpan kalau tidak. */
  text: (path: string) => string | null;
  /** Ganti isi berkas dari luar (pulihkan snapshot, impor). Riwayat undo berkas itu dimulai ulang. */
  replace: (path: string, text: string) => void;
  forget: (path: string) => void;
  rename: (from: string, to: string) => void;
  reveal: (line: number) => void;
  focus: () => void;
};

type Props = {
  path: string | null;
  initial: (path: string) => string;
  readOnly?: boolean;
  extra?: (path: string) => Extension;
  onDocChange?: (path: string, tr: Transaction) => void;
  onCursor?: (line: number, col: number) => void;
  onRun?: () => void;
  onSave?: () => void;
  diagnostics?: EditorDiag[] | null;
  label?: string;
  /** Buat state baru dari initial() setiap pindah berkas (dipakai saat ngoding bareng: isi terbaru ada di dokumen bersama). */
  recreate?: boolean;
  /** Ngoding bareng: undo/redo dari Y.UndoManager (hanya ketikan sendiri), bukan riwayat CodeMirror. */
  collab?: boolean;
};

const langComp = new Compartment(), roComp = new Compartment();
const theme = EditorView.theme({ '&': { height: '100%', backgroundColor: 'transparent' }, '.cm-scroller': { overflow: 'auto' } });

function toCm(state: EditorState, diags: EditorDiag[]): Diagnostic[] {
  const doc = state.doc, out: Diagnostic[] = [];
  for (const d of diags) {
    if (!d.line || d.line > doc.lines) continue;
    const line = doc.line(d.line);
    const from = d.col ? Math.min(line.to, line.from + d.col - 1) : line.from + (line.text.length - line.text.trimStart().length);
    out.push({ from, to: Math.max(from, d.col ? Math.min(line.to, from + 1) : line.to), severity: d.severity, message: d.message });
  }
  return out;
}

export const SandboxEditor = forwardRef<EditorHandle, Props>(function SandboxEditor(p, ref) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const states = useRef(new Map<string, EditorState>());
  const cur = useRef<string | null>(null);
  const props = useRef(p); props.current = p;

  const make = (path: string, doc: string) => {
    const lang = langOfPath(path);
    const unit = WIDE_INDENT.has(lang) ? '    ' : '  ';
    const st = EditorState.create({ doc, extensions: [
      lineNumbers(), highlightActiveLineGutter(), highlightSpecialChars(), props.current.collab ? [] : history(), drawSelection(), dropCursor(),
      EditorState.allowMultipleSelections.of(true), indentOnInput(), bracketMatching(), closeBrackets(), rectangularSelection(),
      highlightActiveLine(), highlightSelectionMatches(), search({ top: true }), autocompletion({ activateOnTyping: true }),
      syntaxHighlighting(orvellaHighlight), theme, indentUnit.of(unit), EditorState.tabSize.of(unit.length),
      EditorView.contentAttributes.of({ 'aria-label': `${props.current.label || 'Editor'} ${path}` }),
      langComp.of([]), roComp.of(EditorState.readOnly.of(!!props.current.readOnly)),
      Prec.highest(keymap.of([
        { key: 'Mod-Enter', run: () => { props.current.onRun?.(); return true; } },
        { key: 'Mod-s', run: () => { props.current.onSave?.(); return true; }, preventDefault: true },
        { key: 'Tab', run: insertTab, shift: indentLess },
      ])),
      props.current.collab ? Prec.high(keymap.of(yUndoManagerKeymap)) : [],
      keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...(props.current.collab ? [] : historyKeymap), ...completionKeymap]),
      props.current.extra ? props.current.extra(path) : [],
    ] });
    // paket bahasa dimuat belakangan; pasang ke state yang sedang dipakai berkas ini
    void loadLanguage(lang).then(ext => {
      const v = view.current;
      if (v && cur.current === path) v.dispatch({ effects: langComp.reconfigure(ext) });
      else { const s = states.current.get(path); if (s) states.current.set(path, s.update({ effects: langComp.reconfigure(ext) }).state); }
    });
    return st;
  };

  // satu EditorView selama komponen hidup
  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({ doc: '' }),
      dispatchTransactions: (trs, v) => {
        v.update(trs);
        const path = cur.current;
        if (!path) return;
        for (const tr of trs) if (tr.docChanged) props.current.onDocChange?.(path, tr);
        if (trs.some(t => t.selection || t.docChanged)) {
          const head = v.state.selection.main.head, line = v.state.doc.lineAt(head);
          props.current.onCursor?.(line.number, head - line.from + 1);
        }
      },
    });
    view.current = v;
    return () => { v.destroy(); view.current = null; };
  }, []);

  // pindah berkas: simpan state lama, pasang state berkas baru
  useEffect(() => {
    const v = view.current; if (!v) return;
    if (cur.current && cur.current !== p.path) states.current.set(cur.current, v.state);
    cur.current = p.path;
    if (!p.path) { v.setState(EditorState.create({ doc: '' })); return; }
    const st = (!p.recreate && states.current.get(p.path)) || make(p.path, p.initial(p.path));
    states.current.set(p.path, st);
    v.setState(st);
  }, [p.path]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { view.current?.dispatch({ effects: roComp.reconfigure(EditorState.readOnly.of(!!p.readOnly)) }); }, [p.readOnly]);
  useEffect(() => { const v = view.current; if (v) v.dispatch(setDiagnostics(v.state, toCm(v.state, p.diagnostics || []))); }, [p.diagnostics, p.path]);

  useImperativeHandle(ref, () => ({
    view: () => view.current,
    text: path => (cur.current === path && view.current ? view.current.state.doc.toString() : states.current.get(path)?.doc.toString() ?? null),
    replace: (path, text) => {
      const st = make(path, text);
      states.current.set(path, st);
      if (cur.current === path) view.current?.setState(st);
    },
    forget: path => { states.current.delete(path); },
    rename: (from, to) => {
      const st = cur.current === from ? view.current?.state : states.current.get(from);
      states.current.delete(from);
      if (st) states.current.set(to, st);
      if (cur.current === from) cur.current = to;
    },
    reveal: line => {
      const v = view.current; if (!v || line < 1 || line > v.state.doc.lines) return;
      const l = v.state.doc.line(line);
      v.dispatch({ selection: { anchor: l.from }, effects: EditorView.scrollIntoView(l.from, { y: 'center' }) });
      v.focus();
    },
    focus: () => view.current?.focus(),
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={host} className="cm-host ide-cm" />;
});
