/* Tipe data Mode Sandbox (Orvella OS). Bentuknya mengikuti backend/app/services/sandbox.py. */
export type Owner = { id: number; name: string; initials: string; class: string | null };

export type ProjectCard = {
  id: number; title: string; description: string; kind: 'program' | 'web'; lang: string; stack: string | null;
  visibility: 'private' | 'class' | 'public'; published: string | null; stars: number; starred: boolean;
  updated: string; owner: Owner; mine: boolean; preview?: Record<string, string>;
};

export type Project = ProjectCard & {
  files: Record<string, string>; entry: string | null; stdin: string; rev: number; can_edit: boolean;
  /** owner | edit | view (ngoding bareng) */ access?: 'owner' | 'edit' | 'view'; live?: boolean;
  share_replay: boolean; replay: boolean; remix_of: { id: number; title: string; owner: Owner } | null;
};

export type Snapshot = { id: number; label: string; stats: { add?: number; del?: number }; auto: boolean; at: string; ago: string };

/** Satu kejadian replay: [ms sejak awal sesi, berkas, ChangeSet.toJSON(), penulis?] */
export type ReplayEvent = [number, string, unknown, string?];
export type ReplaySession = { session: string; events: number; started: string; ago: string };

/** Bahasa yang dipakai editor untuk tiap berkas (lang dari ekstensi). */
export const projectLang = (p: Pick<ProjectCard, 'kind' | 'lang' | 'stack'>) =>
  p.kind === 'web' ? (p.stack === 'flask' || p.stack === 'fastapi' ? 'python' : p.stack === 'php' ? 'php' : p.stack === 'node' ? 'javascript' : 'html') : p.lang;
