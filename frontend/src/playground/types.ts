import type { ChapterRef } from '../api/types';
import type { EditorDiag } from '../code/CodeEditor';

export type Cell = { id: string; type: 'code' | 'note'; src: string };
export type Kind = 'notebook' | 'program' | 'web';
export type Notebook = {
  id: number; title: string; cells: Cell[]; updated: string; attached: ChapterRef | null;
  kind: Kind; lang: string; files: { code?: string; stdin?: string; stack?: string; files?: Record<string, string> };
};
export type ListItem = { id: number; title: string; updated: string; kind: Kind; lang: string };
export type List = { items: ListItem[]; attachable: ChapterRef[]; assist_cap: number };
export type Diag = { available: boolean; text?: string; fix?: { label: string; code: string }; line?: number | null; reason?: string };
export type RunErr = { name: string; message: string; line: number | null; col?: number | null; phase?: 'compile' | 'run'; severity?: 'warning' } | null;
export type RunOut = {
  ok: boolean; stdout: string[]; stderr: string; exit: number | null; ms: number | null; mem_kb: number | null;
  timeout: boolean; oom: boolean; truncated: boolean;
  compile: { ok: boolean; ms: number; stderr: string } | null;
  error: RunErr; diagnostics: EditorDiag[]; total_ms: number;
};
export type LangsInfo = { runner: boolean; langs: { id: string; enabled: boolean }[]; starters: Record<string, { code: string; stdin: string }> };
