/* Bus kejadian Orvella OS: Orvi pemandu, quest, dan efek mendengarkan dari sini
   tanpa komponen saling mengimpor. */
export type OsEvents = {
  'win:open': { app: string; id: string };
  'run:ok': { project: number };
  'run:error': { project: number; message: string };
  'snapshot': { project: number };
  'publish': { project: number };
  'cheer': { from: string; emoji: string };
  'learn:correct': Record<string, never>;
  'learn:wrong': Record<string, never>;
  'dnd:start': { type: string };
  'dnd:end': { type: string; dropped: boolean };
  'pomodoro:start': { phase: 'work' | 'rest' };
  'pomodoro:stop': Record<string, never>;
  'pomodoro:done': { phase: 'work' | 'rest' };
  'xp': { amount: number; from?: Element | null };
  'level:up': { level: number };
  'badge': { title: string };
  'orvi:visit': { win: Element; app: string };
};

const target = new EventTarget();

export function emit<K extends keyof OsEvents>(name: K, detail: OsEvents[K]) {
  target.dispatchEvent(new CustomEvent(name, { detail }));
}

export function on<K extends keyof OsEvents>(name: K, fn: (d: OsEvents[K]) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<OsEvents[K]>).detail);
  target.addEventListener(name, h);
  return () => target.removeEventListener(name, h);
}
