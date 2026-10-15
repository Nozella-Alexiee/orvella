import { useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { HighlightStyle, indentUnit, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView, Decoration, keymap, placeholder as cmPlaceholder, type DecorationSet } from '@codemirror/view';
import { Prec, RangeSetBuilder, StateField, StateEffect, EditorState } from '@codemirror/state';
import { tags as t } from '@lezer/highlight';
import { setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { cx } from '../design/ui';

/** Compiler message for the editor: squiggle under the spot + tooltip on hover. */
export type EditorDiag = { line: number | null; col?: number | null; severity: 'error' | 'warning'; message: string };

/* CodeMirror 6 bergaya kartu kode Orvella ("papan tulis") — sengaja bukan IDE: tanpa minimap, tab, atau ikon gutter.
   Paket bahasa dimuat sesuai kebutuhan supaya bundel awal tetap ringan. */
export const EDITOR_LANGS = ['javascript', 'python', 'c', 'cpp', 'rust', 'java', 'go', 'php', 'sql', 'html', 'css', 'kotlin'] as const;
const loaders: Record<string, () => Promise<Extension>> = {
  javascript: () => import('@codemirror/lang-javascript').then(m => m.javascript()),
  python: () => import('@codemirror/lang-python').then(m => m.python()),
  c: () => import('@codemirror/lang-cpp').then(m => m.cpp()),
  cpp: () => import('@codemirror/lang-cpp').then(m => m.cpp()),
  rust: () => import('@codemirror/lang-rust').then(m => m.rust()),
  java: () => import('@codemirror/lang-java').then(m => m.java()),
  go: () => import('@codemirror/lang-go').then(m => m.go()),
  php: () => import('@codemirror/lang-php').then(m => m.php()),
  sql: () => import('@codemirror/lang-sql').then(m => m.sql()),
  html: () => import('@codemirror/lang-html').then(m => m.html()),
  css: () => import('@codemirror/lang-css').then(m => m.css()),
  kotlin: () => import('@codemirror/legacy-modes/mode/clike').then(m => StreamLanguage.define(m.kotlin)),
  text: () => Promise.resolve([]),
};
const cache = new Map<string, Extension>();
/** Paket bahasa CodeMirror (dimuat sekali lalu disimpan). */
export function loadLanguage(lang: string): Promise<Extension> {
  const hit = cache.get(lang);
  if (hit) return Promise.resolve(hit);
  return (loaders[lang] || loaders.text)().then(e => { cache.set(lang, e); return e; });
}
function useLanguage(lang: string) {
  const [ext, setExt] = useState<Extension | null>(() => cache.get(lang) || null);
  useEffect(() => {
    let live = true;
    const hit = cache.get(lang);
    if (hit) { setExt(hit); return; }
    (loaders[lang] || loaders.javascript)().then(e => { cache.set(lang, e); if (live) setExt(e); });
    return () => { live = false; };
  }, [lang]);
  return ext;
}
export const WIDE_INDENT = new Set(['python', 'c', 'cpp', 'rust', 'java', 'go', 'php', 'kotlin']);

export const orvellaHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.definitionKeyword, t.modifier, t.controlKeyword, t.operatorKeyword, t.bool, t.null], class: 'k' },
  { tag: [t.string, t.special(t.string), t.regexp], class: 's' },
  { tag: [t.number], class: 'n' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], class: 'f' },
  { tag: [t.standard(t.variableName), t.propertyName], class: 'p' },
  { tag: [t.comment, t.lineComment, t.blockComment], class: 'c' },
  { tag: [t.punctuation, t.operator, t.bracket, t.separator], class: 'pn' },
  { tag: [t.typeName, t.className, t.namespace, t.macroName, t.tagName], class: 'ty' },
  { tag: [t.attributeName], class: 'p' },
]);

const theme = EditorView.theme({ '&': { backgroundColor: 'transparent' } });

// error line (L1): tinted until the code changes
const setBad = StateEffect.define<number | null>();
const badField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) {
      if (e.is(setBad)) {
        if (!e.value || e.value > tr.state.doc.lines) return Decoration.none;
        const line = tr.state.doc.line(e.value);
        const b = new RangeSetBuilder<Decoration>();
        b.add(line.from, line.from, Decoration.line({ class: 'is-bad' }));
        return b.finish();
      }
    }
    return tr.docChanged ? Decoration.none : deco.map(tr.changes);
  },
  provide: f => EditorView.decorations.from(f),
});

function toCm(doc: EditorState['doc'], diags: EditorDiag[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const d of diags) {
    if (!d.line || d.line > doc.lines) continue;
    const line = doc.line(d.line);
    const from = Math.min(line.to, line.from + Math.max(0, (d.col || 1) - 1));
    const word = /^[\w$]+/.exec(doc.sliceString(from, line.to));
    const to = d.col ? Math.max(from + 1, from + (word ? word[0].length : 1)) : line.to;
    out.push({ from: d.col ? from : line.from + (line.text.length - line.text.trimStart().length), to: Math.min(to, line.to) || from,
      severity: d.severity, message: d.message, source: d.severity === 'error' ? 'error' : 'peringatan' });
  }
  return out;
}

export function CodeEditor({ value, onChange, onRun, badLine, small, minHeight, maxHeight, readOnly, placeholder, label, runKey = 'Mod-Enter', lang = 'javascript', diagnostics }: {
  value: string; onChange?: (v: string) => void; onRun?: () => void; badLine?: number | null; small?: boolean; minHeight?: number; maxHeight?: number;
  readOnly?: boolean; placeholder?: string; label: string; runKey?: 'Mod-Enter' | 'Shift-Enter'; lang?: string; diagnostics?: EditorDiag[] | null;
}) {
  const langExt = useLanguage(lang);
  const unit = WIDE_INDENT.has(lang) ? '    ' : '  ';
  const runRef = useRef(onRun);
  runRef.current = onRun;
  const view = useRef<EditorView | null>(null);
  const extensions = useMemo(() => [
    ...(langExt ? [langExt] : []),
    syntaxHighlighting(orvellaHighlight),
    theme,
    indentUnit.of(unit),
    EditorState.tabSize.of(unit.length),
    badField,
    EditorView.contentAttributes.of({ 'aria-label': label }),
    // above basicSetup's own keymap (which binds Mod-Enter to "insert blank line")
    Prec.highest(keymap.of([
      { key: runKey, run: () => { runRef.current?.(); return true; } },
      { key: 'Tab', run: v => { v.dispatch(v.state.replaceSelection(unit)); return true; } },
    ])),
    ...(placeholder ? [cmPlaceholder(placeholder)] : []),
  ], [label, runKey, placeholder, langExt, unit]);
  useEffect(() => { view.current?.dispatch({ effects: setBad.of(badLine ?? null) }); }, [badLine]);
  useEffect(() => {
    const v = view.current;
    if (v) v.dispatch(setDiagnostics(v.state, toCm(v.state.doc, diagnostics || [])));
  }, [diagnostics]);
  return (
    <div className={cx('cm-host', small && 'is-sm')}>
      <CodeMirror
        value={value}
        onChange={v => onChange?.(v)}
        extensions={extensions}
        readOnly={readOnly}
        editable={!readOnly}
        theme="none"
        onCreateEditor={v => {
          view.current = v;
          if (badLine) v.dispatch({ effects: setBad.of(badLine) });
          if (diagnostics?.length) v.dispatch(setDiagnostics(v.state, toCm(v.state.doc, diagnostics)));
        }}
        basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true, highlightActiveLineGutter: true, autocompletion: false,
          bracketMatching: true, closeBrackets: true, indentOnInput: true, searchKeymap: false, lintKeymap: false, highlightSelectionMatches: false, dropCursor: false }}
        minHeight={minHeight ? `${minHeight}px` : undefined}
        maxHeight={maxHeight ? `${maxHeight}px` : undefined}
      />
    </div>
  );
}
