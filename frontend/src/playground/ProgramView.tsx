import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import { CodeEditor } from '../code/CodeEditor';
import { Icon } from '../design/Icon';
import { LangIcon } from '../design/LangIcon';
import { Orvi, type Mood } from '../design/Orvi';
import { toast } from '../design/toast';
import { cx } from '../design/ui';
import { motion, pop, shake, sound } from '../fx';
import { Html } from '../lib/html';
import { COMPILED, FILE_OF, LANG_BY_ID } from '../lib/langs';
import { MiniBrowser, withBridge } from './MiniBrowser';
import type { Diag, LangsInfo, Notebook, RunOut } from './types';

type Phase = 'idle' | 'compile' | 'run' | 'done' | 'fail';
const wait = (ms: number) => new Promise(r => setTimeout(r, motion() === 'off' ? 0 : Math.max(0, ms)));
const fmtMs = (ms: number | null | undefined) => (ms == null ? '–' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} dtk`);
const fmtMem = (kb: number | null | undefined) => (kb == null ? '–' : kb < 1024 ? `${kb} KB` : `${(kb / 1024).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB`);

/* Perintah yang ditampilkan di konsol (kosmetik, supaya siswa tahu apa yang terjadi di balik tombol Jalankan). */
const CMDS: Record<string, [string | null, string]> = {
  python: [null, 'python3 main.py'], javascript: [null, 'node main.js'], php: [null, 'php main.php'], sql: [null, 'sqlite3 :memory: < main.sql'],
  c: ['gcc main.c -o main', './main'], cpp: ['g++ -std=c++20 main.cpp -o main', './main'], rust: ['rustc main.rs', './main'],
  go: ['go build main.go', './main'], java: ['javac Main.java', 'java Main'], kotlin: ['kotlinc main.kt', 'kotlin MainKt'],
};

const CSS_DEMO = (css: string) => `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;padding:24px;color:#2B2350;background:#FFF8EC}</style><style>${css}</style></head>
<body><h1 class="halo">Halo, Orvella!</h1><div class="kartu"><p>Ini kartu contoh. Ubah CSS di kiri untuk mengubah tampilannya.</p><button class="tombol">Tombol</button></div>
<ul class="daftar"><li>Python</li><li>Rust</li><li>C++</li></ul></body></html>`;

/** Program satu berkas: 12 bahasa. HTML/CSS dipratinjau langsung, bahasa lain dijalankan di sandbox server. */
export function ProgramView({ nb, update, info }: { nb: Notebook; update: (n: Notebook) => void; info?: LangsInfo }) {
  const lang = nb.lang;
  const L = LANG_BY_ID[lang];
  const code = nb.files.code ?? '';
  const stdin = nb.files.stdin ?? '';
  const isWeb = lang === 'html' || lang === 'css';
  const compiled = COMPILED.has(lang);
  const enabled = info?.langs.find(l => l.id === lang)?.enabled ?? true;
  const [out, setOut] = useState<RunOut | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [diag, setDiag] = useState<Diag | null>(null);
  const [down, setDown] = useState<string | null>(null);
  const [mood, setMood] = useState<Mood>('idle');
  const [bump, setBump] = useState(0);
  const [stale, setStale] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const runBtn = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const running = phase === 'compile' || phase === 'run';

  useEffect(() => { setOut(null); setPhase('idle'); setDiag(null); setDown(null); setMood('idle'); }, [nb.id]);

  const setFiles = (patch: Partial<Notebook['files']>) => update({ ...nb, files: { ...nb.files, ...patch } });

  const run = async (src = code) => {
    if (running || isWeb) return;
    if (!enabled) { toast({ kind: 'accent', icon: 'lock', title: `${L?.name} sedang dinonaktifkan`, body: 'Admin menonaktifkan bahasa ini untuk sementara.' }); return; }
    pop(runBtn.current);
    setDown(null); setDiag(null); setStale(false);
    setPhase(compiled ? 'compile' : 'run'); setMood('think');
    const t0 = performance.now();
    try {
      const r = await api.post<RunOut>('/api/run', { lang, code: src, stdin });
      await wait(420 - (performance.now() - t0)); // let each pipeline step be seen
      if (compiled && r.compile?.ok) { setPhase('run'); await wait(240); }
      setOut(r);
      const bad = !!r.error && r.error.severity !== 'warning';
      setPhase(bad ? 'fail' : 'done');
      setMood(bad ? 'oops' : 'happy'); setBump(b => b + 1);
      if (bad) { shake(cardRef.current); sound('no'); } else sound('tap');
      requestAnimationFrame(() => bodyRef.current?.scrollTo({ top: 0 }));
      if (r.error) {
        try { setDiag(await api.post<Diag>('/api/diagnose', { code: src, error: r.error, where: 'playground', lang })); }
        catch { setDiag({ available: false, reason: 'down' }); }
      }
    } catch (e) {
      setPhase('idle'); setMood('sleep'); setOut(null);
      if (e instanceof ApiError && e.status === 429) toast({ kind: 'accent', icon: 'hourglass', title: 'Pelan-pelan dulu', body: e.message });
      else setDown(e instanceof ApiError && e.status !== 0 ? e.message : 'Runner kode tidak bisa dihubungi. Coba lagi sebentar.');
    }
  };

  const applyFix = (fixed: string) => { setFiles({ code: fixed }); setTimeout(() => run(fixed), 0); };

  // ---- HTML/CSS: live preview (debounced)
  const [doc, setDoc] = useState('');
  useEffect(() => {
    if (!isWeb) return;
    const t = setTimeout(() => setDoc(lang === 'css' ? withBridge(CSS_DEMO(code)) : withBridge(code)), 350);
    return () => clearTimeout(t);
  }, [code, lang, isWeb]);

  const [cmdC, cmdR] = CMDS[lang] || [null, ''];
  const err = out?.error;
  const warnOnly = err?.severity === 'warning';
  const pipe = useMemo(() => {
    const steps: { id: string; label: string; icon: string }[] = [{ id: 'write', label: 'Tulis', icon: 'pen-line' }];
    if (compiled) steps.push({ id: 'compile', label: 'Kompilasi', icon: 'hammer' });
    steps.push({ id: 'run', label: 'Jalankan', icon: 'play' });
    return steps;
  }, [compiled]);
  const stepState = (id: string) => {
    if (id === 'write') return phase === 'idle' ? 'on-idle' : 'ok';
    if (id === 'compile') {
      if (phase === 'compile') return 'on';
      if (!out) return phase === 'run' ? 'ok' : '';
      return out.compile && !out.compile.ok ? 'bad' : 'ok';
    }
    if (phase === 'run') return 'on';
    if (!out || (out.compile && !out.compile.ok)) return '';
    return err && !warnOnly ? 'bad' : 'ok';
  };

  return (
    <div className="prog">
      <div className="codecard prog-editor" ref={cardRef}>
        <div className="cc-head">
          <span className="cc-file"><LangIcon id={lang} size={18} />{FILE_OF[lang] || 'main'}</span>
          <span className="t-xs" style={{ color: 'var(--editor-dim)' }}>{L?.rt}</span>
          <span className="grow" />
          {info?.starters[lang] && (
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--editor-dim)' }} title="Kembalikan contoh awal"
              onClick={() => { setFiles({ code: info.starters[lang].code, stdin: info.starters[lang].stdin }); setOut(null); setPhase('idle'); }}>
              <Icon name="rotate-ccw" />Contoh</button>
          )}
        </div>
        <CodeEditor value={code} lang={lang} minHeight={360} maxHeight={620} label={`Editor ${L?.name ?? ''}`}
          onChange={v => { setFiles({ code: v }); if (out) setStale(true); }} onRun={() => run()}
          badLine={!stale && err && !warnOnly ? err.line : null} diagnostics={stale ? [] : out?.diagnostics} />
        {!isWeb && (
          <details className="stdin" open={!!stdin}>
            <summary><Icon name="chevron-right" size={14} className="chev" /><Icon name="keyboard" size={14} />Input (stdin)
              <span className="t-xs" style={{ fontWeight: 500, marginLeft: 'auto', opacity: .8 }}>{stdin ? `${stdin.split('\n').length} baris` : 'kosong'}</span></summary>
            <textarea value={stdin} onChange={e => setFiles({ stdin: e.target.value })} spellCheck={false} aria-label="Input program"
              placeholder="Tulis input di sini, satu baris untuk setiap kali program membaca input." />
          </details>
        )}
        <div className="prog-foot">
          {!isWeb ? (
            <>
              <div className="pipe" aria-hidden="true">
                {pipe.map((s, i) => {
                  const st = stepState(s.id);
                  return (
                    <span key={s.id} className="row gap-2" style={{ alignItems: 'center' }}>
                      {i > 0 && <span className="pipe-line" />}
                      <span className={cx('pipe-step', st === 'on' && 'is-on', st === 'ok' && 'is-ok', st === 'bad' && 'is-bad')}><span className="dot" />{s.label}</span>
                    </span>
                  );
                })}
              </div>
              <span className="grow" />
              <span className="kbdhint hide-sm" style={{ color: 'var(--editor-dim)' }}><kbd>Ctrl</kbd><kbd>↵</kbd></span>
              <button ref={runBtn} className={cx('btn btn-sun btn-lg btn-press', running && 'is-loading')} onClick={() => run()} disabled={running}>
                <Icon name="play" />Jalankan
              </button>
            </>
          ) : (
            <span className="t-xs" style={{ color: 'var(--editor-dim)' }}><Icon name="zap" size={14} /> Pratinjau diperbarui otomatis saat kamu mengetik.</span>
          )}
        </div>
      </div>

      {isWeb ? (
        <MiniBrowser srcDoc={doc} url={lang === 'css' ? 'pratinjau://contoh.html' : 'pratinjau://index.html'} />
      ) : (
        <section className="console" aria-live="polite" aria-label="Keluaran program">
          <div className="console-head">
            <Orvi size={34} mood={running ? 'think' : mood} bump={bump} force />
            <span className="t-label">Keluaran</span>
            <div className="stat-pills">
              {out && !running && (
                <>
                  {out.compile && <span className={cx('stat-pill', out.compile.ok ? 'is-ok' : 'is-bad')}><Icon name="hammer" />{fmtMs(out.compile.ms)}</span>}
                  {(!out.compile || out.compile.ok) && <span className="stat-pill"><Icon name="timer" />{out.timeout ? 'batas waktu' : fmtMs(out.ms)}</span>}
                  {out.mem_kb != null && <span className="stat-pill"><Icon name="memory-stick" />{fmtMem(out.mem_kb)}</span>}
                  {out.exit != null && (!out.compile || out.compile.ok) && <span className={cx('stat-pill', out.exit === 0 ? 'is-ok' : 'is-bad')}>kode {out.exit}</span>}
                </>
              )}
            </div>
          </div>
          <div className="console-body" ref={bodyRef}>
            {down ? (
              <div className="console-empty"><Orvi size="md" mood="sleep" force /><div><b>Runner sedang istirahat.</b><br />{down}</div>
                <button className="btn btn-secondary btn-sm" onClick={() => run()}><Icon name="refresh-cw" />Coba lagi</button></div>
            ) : !out && !running ? (
              <div className="console-empty">
                <LangIcon id={lang} size={46} />
                <div>Tekan <b>Jalankan</b> atau <kbd>Ctrl</kbd>+<kbd>↵</kbd> untuk melihat hasilnya di sini.<br />
                  <span className="t-xs">{L?.rt} · {compiled ? 'dikompilasi dulu, lalu dijalankan' : lang === 'sql' ? 'database baru setiap kali dijalankan' : 'langsung dijalankan'} · aman di sandbox</span></div>
                {!enabled && <span className="badge badge-warning">Bahasa ini sedang dinonaktifkan admin</span>}
              </div>
            ) : (
              <>
                {cmdC && <div className="console-line is-dim">$ {cmdC}</div>}
                {running && phase === 'compile' && <div className="console-line is-dim">mengompilasi…</div>}
                {out?.compile && (out.compile.ok
                  ? <div className="console-line is-ok">✓ kompilasi berhasil{out.diagnostics.some(d => d.severity === 'warning') ? ` · ${out.diagnostics.filter(d => d.severity === 'warning').length} peringatan` : ''}</div>
                  : <div className="console-block"><div className="console-line is-err">✗ kompilasi gagal</div><pre>{out.compile.stderr}</pre></div>)}
                {(!out?.compile || out.compile.ok) && (running ? phase === 'run' : true) && <div className="console-line is-dim">$ {cmdR}{stdin ? ' < input' : ''}</div>}
                {running && phase === 'run' && <div className="console-line is-dim">berjalan…</div>}
                {out && (!out.compile || out.compile.ok) && (
                  <>
                    {out.stdout.map((l, i) => <div className="console-line" key={i} style={{ animationDelay: `${Math.min(i, 30) * 35}ms` }}>{l || ' '}</div>)}
                    {!out.stdout.length && !out.stderr && !out.timeout && <div className="console-line is-dim">(program selesai tanpa keluaran)</div>}
                    {out.truncated && <div className="console-line is-dim">… keluaran dipotong (terlalu panjang)</div>}
                    {out.timeout && <div className="console-line is-err">✗ dihentikan: melewati batas waktu</div>}
                    {out.oom && <div className="console-line is-err">✗ dihentikan: memori melewati batas</div>}
                    {out.stderr && (
                      <details className="console-block" open={!!err && !warnOnly}>
                        <summary>{err && !warnOnly ? 'Pesan error' : 'stderr'}</summary><pre>{out.stderr}</pre>
                      </details>
                    )}
                  </>
                )}
              </>
            )}
          </div>
          {out && err && diag && !running && (
            <div className="diag">
              <Orvi size="sm" mood="think" force />
              <div className="t-sm grow">
                <span className="eyebrow">Orvi · {err.line ? `baris ${err.line}` : 'penjelasan'}</span>
                {diag.available ? <Html as="div" className="mt-1" html={diag.text} />
                  : <div className="mt-1">{diag.reason === 'capped' ? 'Mentormu membatasi penjelasan di playground. Pesan error di atas tetap akurat.' : 'Penjelasan untuk error ini belum ada. Baca pesan error di atas, biasanya baris dan penyebabnya sudah disebut.'}</div>}
                {diag.fix && (
                  <div className="row gap-2 mt-2 wrap">
                    <button className="btn btn-sun btn-sm btn-press" onClick={() => applyFix(diag.fix!.code)}><Icon name="wand-sparkles" />{diag.fix.label}</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--editor-dim)' }} onClick={() => setDiag({ ...diag, fix: undefined })}>Petunjuk saja</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
