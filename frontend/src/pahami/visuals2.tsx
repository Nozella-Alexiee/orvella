import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './visuals2.css';
import { api, ApiError } from '../api/client';
import type { Checkpoint, MemStep, MemVal, Visual } from '../api/types';
import { CodeEditor } from '../code/CodeEditor';
import { Icon } from '../design/Icon';
import { LangIcon } from '../design/LangIcon';
import type { Mood } from '../design/Orvi';
import { cx } from '../design/ui';
import { burst, motion, pop, shake, sound } from '../fx';
import { highlightLine } from '../lib/highlight';
import { Html } from '../lib/html';
import { FILE_OF, LANG_BY_ID } from '../lib/langs';
import { renderMarkdown } from '../lib/markdown';
import { BRIDGE } from '../playground/MiniBrowser';

type Ctx = { setMood: (m: Mood) => void; onProgress?: (seen: number, total: number) => void; preview?: boolean };

// ================================================================== video
type YTPlayer = { getCurrentTime(): number; getDuration(): number; pauseVideo(): void; playVideo(): void; seekTo(s: number, allow: boolean): void; destroy(): void; getPlayerState(): number };
declare global { interface Window { YT?: { Player: new (el: HTMLElement, o: object) => YTPlayer; PlayerState: Record<string, number> }; onYouTubeIframeAPIReady?: () => void } }

let ytReady: Promise<void> | null = null;
export function loadYT(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (ytReady) return ytReady;
  ytReady = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => { ytReady = null; reject(new Error('yt')); };
    document.head.appendChild(s);
  });
  return ytReady;
}

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** A YouTube video that pauses at the mentor's checkpoints and asks a question before it continues. */
export function VideoViz({ v, ctx }: { v: Extract<Visual, { type: 'video' }>; ctx: Ctx }) {
  const cps = useMemo(() => [...(v.checkpoints || [])].sort((a, b) => a.t - b.t), [v.checkpoints]);
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [failed, setFailed] = useState(false);
  const [ask, setAsk] = useState<number | null>(null);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [picked, setPicked] = useState<number | null>(null);
  const [dur, setDur] = useState(0);
  const [now, setNow] = useState(0);
  const card = useRef<HTMLDivElement>(null);
  const doneRef = useRef(done); doneRef.current = done;
  const askRef = useRef(ask); askRef.current = ask;

  useEffect(() => { ctx.onProgress?.(done.size, cps.length); if (cps.length && done.size === cps.length) ctx.setMood('happy'); }, [done.size]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let alive = true;
    let tick = 0;
    const t = setTimeout(() => { if (!player.current) setFailed(true); }, 8000);
    loadYT().then(() => {
      if (!alive || !host.current || !window.YT) return;
      const el = document.createElement('div');
      host.current.innerHTML = '';
      host.current.appendChild(el);
      player.current = new window.YT.Player(el, {
        videoId: v.id, host: 'https://www.youtube-nocookie.com', width: '100%', height: '100%',
        playerVars: { start: v.start || 0, ...(v.end ? { end: v.end } : {}), rel: 0, modestbranding: 1, playsinline: 1, cc_lang_pref: 'id' },
        events: {
          onReady: () => { clearTimeout(t); setDur(player.current?.getDuration() || 0); },
          onError: () => setFailed(true),
        },
      });
      tick = window.setInterval(() => {
        const p = player.current;
        if (!p?.getCurrentTime) return;
        const cur = p.getCurrentTime();
        setNow(cur);
        if (askRef.current !== null) return;
        const i = cps.findIndex((c, k) => !doneRef.current.has(k) && cur >= c.t && cur < c.t + 2.5);
        if (i >= 0) { p.pauseVideo(); setAsk(i); setPicked(null); ctx.setMood('think'); sound('pop'); }
      }, 250);
    }).catch(() => setFailed(true));
    return () => { alive = false; clearTimeout(t); clearInterval(tick); try { player.current?.destroy(); } catch { /* already gone */ } player.current = null; };
  }, [v.id, v.start, v.end]); // eslint-disable-line react-hooks/exhaustive-deps

  const answer = (i: number, idx: number, el: HTMLElement) => {
    setPicked(idx);
    if (idx === cps[i].a) {
      burst(el, { count: 12 }); sound('ok'); ctx.setMood('happy');
      setDone(d => new Set(d).add(i));
    } else { shake(card.current); sound('no'); ctx.setMood('oops'); }
  };
  const resume = () => { setAsk(null); setPicked(null); player.current?.playVideo(); };
  const rewind = (i: number) => { setAsk(null); setPicked(null); player.current?.seekTo(Math.max(0, cps[i].t - 20), true); player.current?.playVideo(); };
  const q = ask !== null ? cps[ask] : null;
  const total = dur || Math.max(60, ...(cps.map(c => c.t + 30)));

  return (
    <div className="vid">
      <div className="vid-frame">
        {!failed ? <div ref={host} className="vid-host" /> : (
          <div className="vid-fail">
            <Icon name="video" />
            <div><b>Video tidak bisa dimuat di sini.</b><br /><span className="t-sm">Tonton di YouTube, lalu jawab pertanyaannya di bawah.</span></div>
            <a className="btn btn-secondary btn-sm" href={`https://www.youtube.com/watch?v=${v.id}${v.start ? `&t=${v.start}s` : ''}`} target="_blank" rel="noopener noreferrer"><Icon name="external-link" />Buka YouTube</a>
          </div>
        )}
        {q && ask !== null && (
          <div className="vid-ask" ref={card} role="dialog" aria-label="Pertanyaan video">
            <span className="eyebrow">Jeda sebentar · {mmss(q.t)}</span>
            <Html as="h3" className="t-h3 mt-2" html={q.q} />
            <div className="vid-opts">
              {q.o.map((o, k) => (
                <button key={k} className={cx('choice', picked === k && (k === q.a ? 'is-right' : 'is-wrong'))} disabled={done.has(ask)}
                  onClick={e => answer(ask, k, e.currentTarget)}><span className="key abcd">{'ABCD'[k]}</span><Html html={o} /></button>
              ))}
            </div>
            {picked !== null && picked !== q.a && <div className="t-sm mt-3">{q.e ? <Html html={q.e} /> : 'Belum tepat. Coba lagi, atau putar ulang bagian ini.'}</div>}
            <div className="row gap-2 mt-4">
              {done.has(ask) ? <button className="btn btn-ok btn-press" onClick={resume}><Icon name="play" />Lanjut menonton</button>
                : <button className="btn btn-ghost btn-sm" onClick={() => rewind(ask)}><Icon name="rotate-ccw" />Putar ulang bagian ini</button>}
            </div>
          </div>
        )}
      </div>
      {cps.length > 0 && (
        <div className="vid-line" aria-label="Titik pertanyaan">
          <div className="vid-track"><i style={{ width: `${Math.min(100, (now / total) * 100)}%` }} /></div>
          {cps.map((c, i) => (
            <button key={i} className={cx('vid-dot', done.has(i) && 'is-done')} style={{ left: `${Math.min(98, (c.t / total) * 100)}%` }}
              title={`${mmss(c.t)} · ${c.q.replace(/<[^>]+>/g, '')}`} onClick={() => { player.current?.seekTo(Math.max(0, c.t - 1), true); player.current?.playVideo(); }}>
              {done.has(i) ? <Icon name="check" size={14} /> : i + 1}
            </button>
          ))}
        </div>
      )}
      {failed && cps.map((c, i) => <FallbackQuestion key={i} c={c} done={done.has(i)} onRight={el => { burst(el); sound('ok'); setDone(d => new Set(d).add(i)); }} />)}
      {v.title && <div className="t-xs t-faint mt-2"><Icon name="youtube" size={14} /> {v.title}{cps.length ? ` · ${done.size}/${cps.length} pertanyaan terjawab` : ''}</div>}
    </div>
  );
}

function FallbackQuestion({ c, done, onRight }: { c: Checkpoint; done: boolean; onRight: (el: HTMLElement) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <div className="card card-pad mt-3">
      <span className="eyebrow">Menit {mmss(c.t)}</span><Html as="div" className="t-h4 mt-1" html={c.q} />
      <div className="vid-opts">{c.o.map((o, k) => <button key={k} disabled={done} className={cx('choice', picked === k && (k === c.a ? 'is-right' : 'is-wrong'))}
        onClick={e => { setPicked(k); if (k === c.a) onRight(e.currentTarget); }}><span className="key abcd">{'ABCD'[k]}</span><Html html={o} /></button>)}</div>
    </div>
  );
}

// =============================================================== markdown
export function MarkdownViz({ v }: { v: Extract<Visual, { type: 'markdown' }> }) {
  const html = useMemo(() => renderMarkdown(v.md), [v.md]);
  return <div className="md-body" dangerouslySetInnerHTML={{ __html: html }} />;
}

// ============================================================= runnable code
type RunRes = { ok: boolean; stdout: string[]; stderr: string; error: { name: string; message: string; line: number | null } | null; compile: { ok: boolean; stderr: string } | null; timeout: boolean };

/** A small editor inside the lesson: change the code and run it for real (any language). */
export function RunViz({ v, ctx }: { v: Extract<Visual, { type: 'run' }>; ctx: Ctx }) {
  const [code, setCode] = useState(v.code);
  const [stdin, setStdin] = useState(v.stdin || '');
  const [res, setRes] = useState<RunRes | null>(null);
  const [busy, setBusy] = useState(false);
  const [down, setDown] = useState('');
  const [runs, setRuns] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const web = v.lang === 'html' || v.lang === 'css';
  useEffect(() => { setCode(v.code); setRes(null); }, [v.code]);
  const run = async () => {
    if (web || busy) return;
    pop(btn.current); setBusy(true); setDown('');
    try {
      const r = await api.post<RunRes>('/api/run', { lang: v.lang, code, stdin });
      setRes(r); setRuns(n => n + 1);
      ctx.setMood(r.error ? 'oops' : 'happy');
    } catch (e) { setDown(e instanceof ApiError ? e.message : 'Runner tidak bisa dihubungi.'); }
    finally { setBusy(false); }
  };
  const doc = web ? (v.lang === 'css' ? `<style>${code}</style><h1 class="halo">Halo, Orvella!</h1><div class="kartu">Kartu contoh</div>` : code) : '';
  return (
    <div className="codecard run-viz">
      <div className="cc-head">
        <span className="cc-file"><LangIcon id={v.lang} size={18} />{FILE_OF[v.lang] || 'main'}</span>
        <span className="t-xs" style={{ color: 'var(--editor-dim)' }}>{LANG_BY_ID[v.lang]?.rt}</span>
        <span className="grow" />
        {code !== v.code && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--editor-dim)' }} onClick={() => { setCode(v.code); setRes(null); }}><Icon name="rotate-ccw" />Awal</button>}
        {!web && <button ref={btn} className={cx('btn btn-sun btn-sm btn-press', busy && 'is-loading')} onClick={run}><Icon name="play" />Jalankan</button>}
      </div>
      <CodeEditor value={code} onChange={setCode} lang={v.lang} onRun={run} small label="Kode interaktif" badLine={res?.error?.line ?? null} maxHeight={360} />
      {v.stdin !== undefined && !web && (
        <div className="run-stdin"><Icon name="keyboard" size={14} /><textarea rows={Math.min(4, Math.max(1, stdin.split('\n').length))} value={stdin} onChange={e => setStdin(e.target.value)} aria-label="Input program" placeholder="input untuk program, satu baris per input()" spellCheck={false} /></div>
      )}
      {web ? <iframe className="run-web" title="Pratinjau" sandbox="allow-scripts" srcDoc={BRIDGE + doc} />
        : (res || down) && (
          <div className="cc-out">
            {down && <span className="out-bubble is-err"><Icon name="wifi-off" size={14} />{down}</span>}
            {res?.compile && !res.compile.ok && <pre className="run-err">{res.compile.stderr.slice(0, 1200)}</pre>}
            {res && (!res.compile || res.compile.ok) && res.stdout.map((l, i) => <span className="out-bubble" key={`${runs}-${i}`} style={{ animationDelay: `${Math.min(i, 12) * 70}ms` }}><span className="p">›</span>{l || ' '}</span>)}
            {res?.error && (!res.compile || res.compile.ok) && <span className="out-bubble is-err"><Icon name="circle-x" size={14} />{res.error.name}: {res.error.message}{res.error.line ? ` · baris ${res.error.line}` : ''}</span>}
            {res && !res.error && !res.stdout.length && <span className="t-xs" style={{ color: 'var(--editor-dim)' }}>(program selesai tanpa keluaran)</span>}
          </div>
        )}
      {v.note && <div className="run-note"><Html html={v.note} /></div>}
    </div>
  );
}

// ================================================================= memory
const ARROW = { stroke: 'var(--marigold)', width: 2 };

function Val({ val, dotRef }: { val: MemVal; dotRef?: (el: HTMLSpanElement | null) => void }) {
  if (val.ref || val.ptr) return <span className="mem-dot" ref={dotRef} />;
  return <span className="mem-v">{val.v}</span>;
}

/** Steps through a program and shows what memory looks like: frames with variables, objects, and arrows between them. */
export function MemoryViz({ v, ctx, compact }: { v: Extract<Visual, { type: 'memory' }>; ctx?: Ctx; compact?: boolean }) {
  const steps = v.steps || [];
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [maxSeen, setMaxSeen] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const dots = useRef<Map<string, HTMLSpanElement>>(new Map());
  const targets = useRef<Map<string, HTMLElement>>(new Map());
  const [paths, setPaths] = useState<{ d: string; key: string }[]>([]);
  const s: MemStep | undefined = steps[Math.min(i, steps.length - 1)];
  const prev = i > 0 ? steps[i - 1] : undefined;

  useEffect(() => { setMaxSeen(m => Math.max(m, i)); }, [i]);
  useEffect(() => { ctx?.onProgress?.(Math.min(steps.length, maxSeen + 1), steps.length); if (maxSeen + 1 >= steps.length) ctx?.setMood('happy'); }, [maxSeen]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!playing) return;
    if (i >= steps.length - 1) { setPlaying(false); return; }
    const t = setTimeout(() => setI(x => x + 1), motion() === 'off' ? 400 : 1100);
    return () => clearTimeout(t);
  }, [playing, i, steps.length]);

  const draw = useCallback(() => {
    const box = wrap.current?.getBoundingClientRect();
    if (!box || !s) return;
    const out: { d: string; key: string }[] = [];
    dots.current.forEach((el, key) => {
      const target = targets.current.get(key.split('→')[1]);
      if (!el.isConnected || !target?.isConnected) return;
      const a = el.getBoundingClientRect(), b = target.getBoundingClientRect();
      const x1 = a.left + a.width / 2 - box.left, y1 = a.top + a.height / 2 - box.top;
      const toLeft = b.left - box.left > x1;
      const x2 = toLeft ? b.left - box.left - 2 : b.right - box.left + 2, y2 = b.top + Math.min(22, b.height / 2) - box.top;
      const c = Math.max(30, Math.abs(x2 - x1) / 2);
      out.push({ key, d: `M${x1},${y1} C${x1 + (toLeft ? c : -c)},${y1} ${x2 + (toLeft ? -c : c)},${y2} ${x2},${y2}` });
    });
    setPaths(out);
  }, [s]);
  useLayoutEffect(() => { const id = requestAnimationFrame(draw); return () => cancelAnimationFrame(id); }, [draw, i]);
  useEffect(() => {
    const ro = new ResizeObserver(() => draw());
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [draw]);

  if (!s) return <div className="card card-pad t-muted">Animasi memori belum dibuat.</div>;
  // arrows are re-measured after every render from these element maps (filled by the callback refs below)
  dots.current = new Map();
  targets.current = new Map();
  const changed = (frame: string, name: string, val: MemVal) => {
    const pf = prev?.frames.find(f => f.name === frame)?.vars.find(x => x.name === name);
    return !pf || pf.v !== val.v || pf.ref !== val.ref || pf.ptr !== val.ptr;
  };
  const dot = (key: string) => (el: HTMLSpanElement | null) => { if (el) dots.current.set(key, el); };
  const target = (id: string) => (el: HTMLElement | null) => { if (el) targets.current.set(id, el); };
  const lang = v.lang;

  return (
    <div className={cx('mem', compact && 'is-compact')}>
      <div className="mem-code codecard">
        <div className="cc-head"><span className="cc-file"><LangIcon id={lang} size={16} />{FILE_OF[lang] || 'main'}</span><span className="grow" />
          <span className="t-xs" style={{ color: 'var(--editor-dim)' }}>langkah {i + 1}/{steps.length}</span></div>
        <div className="cc-body">
          {v.lines.map((l, k) => (
            <div key={k} className={cx('cc-line', s.line === k + 1 && 'is-lit', prev?.line === k + 1 && s.line !== k + 1 && 'was-lit')}>
              <span className="cc-ln">{s.line === k + 1 ? '▶' : k + 1}</span><span dangerouslySetInnerHTML={{ __html: highlightLine(l, lang) }} />
            </div>
          ))}
        </div>
        {s.out !== undefined && s.out !== '' && <div className="mem-out"><span className="t-label">Output</span><pre>{s.out}</pre></div>}
      </div>

      <div className="mem-board" ref={wrap}>
        <svg className="mem-arrows" ref={svg} aria-hidden="true">
          <defs><marker id="mem-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--marigold)" /></marker></defs>
          {paths.map(p => <path key={p.key} d={p.d} fill="none" stroke={ARROW.stroke} strokeWidth={ARROW.width} markerEnd="url(#mem-head)" className="mem-arrow" />)}
        </svg>
        <div className="mem-col">
          <span className="t-label">{lang === 'cpp' || lang === 'c' || lang === 'rust' ? 'Stack' : 'Frame'}</span>
          {s.frames.map(f => (
            <div className="mem-frame" key={f.name}>
              <div className="mem-fname">{f.name}</div>
              {f.vars.map(x => (
                <div key={x.name} className={cx('mem-var', changed(f.name, x.name, x) && 'is-changed', x.moved && 'is-moved')} ref={target(`var:${f.name}:${x.name}`)}>
                  <span className="mem-name">{x.name}{x.addr && <small>{x.addr}</small>}</span>
                  <span className="mem-cell">{x.moved ? <span className="mem-moved">dipindahkan</span>
                    : <Val val={x} dotRef={x.ref ? dot(`${f.name}.${x.name}→obj:${x.ref}`) : x.ptr ? dot(`${f.name}.${x.name}→var:${f.name}:${x.ptr}`) : undefined} />}</span>
                </div>
              ))}
              {!f.vars.length && <div className="t-xs t-faint" style={{ padding: '4px 8px' }}>(kosong)</div>}
            </div>
          ))}
        </div>
        {s.heap.length > 0 && (
          <div className="mem-col">
            <span className="t-label">{lang === 'python' ? 'Objek' : 'Heap'}</span>
            {s.heap.map(o => (
              <div key={o.id} className={cx('mem-obj', o.freed && 'is-freed')} ref={target(`obj:${o.id}`)}>
                <div className="mem-otype">{o.type}{o.addr && <small>{o.addr}</small>}</div>
                {o.label !== undefined && <div className="mem-olabel">{o.label}</div>}
                {o.items && (
                  <div className={cx('mem-items', o.items.some(it => it.k !== undefined) && 'is-kv')}>
                    {o.items.map((it, k) => (
                      <div className="mem-item" key={k}>
                        <span className="mem-idx">{it.k ?? k}</span>
                        <Val val={it} dotRef={it.ref ? dot(`${o.id}.${k}→obj:${it.ref}`) : undefined} />
                      </div>
                    ))}
                    {o.more ? <div className="mem-item"><span className="mem-idx">…</span><span className="mem-v">+{o.more}</span></div> : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mem-ctrl">
        <button className="btn btn-ghost btn-icon btn-sm" aria-label="Ke awal" onClick={() => { setPlaying(false); setI(0); }} disabled={i === 0}><Icon name="rotate-ccw" /></button>
        <button className="btn btn-secondary btn-icon btn-sm" aria-label="Langkah sebelumnya" onClick={() => { setPlaying(false); setI(x => Math.max(0, x - 1)); }} disabled={i === 0}><Icon name="chevron-left" /></button>
        <button className="btn btn-sun btn-sm btn-press" onClick={() => { if (i >= steps.length - 1) setI(0); setPlaying(p => !p); }}><Icon name={playing ? 'pause' : 'play'} />{playing ? 'Jeda' : 'Putar'}</button>
        <button className="btn btn-secondary btn-icon btn-sm" aria-label="Langkah berikutnya" onClick={() => { setPlaying(false); setI(x => Math.min(steps.length - 1, x + 1)); }} disabled={i >= steps.length - 1}><Icon name="chevron-right" /></button>
        <input type="range" min={0} max={steps.length - 1} value={i} onChange={e => { setPlaying(false); setI(Number(e.target.value)); }} aria-label="Langkah" className="grow" />
      </div>
      {(s.note || v.note) && <div className="mem-note"><Icon name="lightbulb" size={14} /><Html html={s.note || v.note} /></div>}
    </div>
  );
}

// ================================================================ box model
export function BoxModelViz({ v }: { v: Extract<Visual, { type: 'boxmodel' }> }) {
  const [st, setSt] = useState({ width: v.width, padding: v.padding, border: v.border, margin: v.margin, sizing: v.sizing || 'content-box' });
  const set = (k: keyof typeof st, val: number | string) => setSt(x => ({ ...x, [k]: val }));
  const total = st.sizing === 'border-box' ? st.width + 2 * st.margin : st.width + 2 * (st.padding + st.border + st.margin);
  const content = st.sizing === 'border-box' ? Math.max(0, st.width - 2 * (st.padding + st.border)) : st.width;
  const scale = Math.min(1, 360 / Math.max(total, 1));
  return (
    <div className="boxm">
      <div className="boxm-stage">
        <div className="boxm-ruler">lebar total <b>{total}px</b></div>
        <div className="boxm-margin" style={{ padding: st.margin * scale }}>
          <span className="boxm-lab">margin</span>
          <div className="boxm-border" style={{ padding: st.border * scale }}>
            <span className="boxm-lab">border</span>
            <div className="boxm-pad" style={{ padding: st.padding * scale }}>
              <span className="boxm-lab">padding</span>
              <div className="boxm-content" style={{ width: content * scale }}>{content}px</div>
            </div>
          </div>
        </div>
      </div>
      <div className="boxm-ctrl">
        <div className="codecard"><div className="cc-body">
          {[`.kotak {`, `  box-sizing: ${st.sizing};`, `  width: ${st.width}px;`, `  padding: ${st.padding}px;`, `  border: ${st.border}px solid;`, `  margin: ${st.margin}px;`, `}`]
            .map((l, k) => <div className="cc-line" key={k} dangerouslySetInnerHTML={{ __html: highlightLine(l, 'css') }} />)}
        </div></div>
        {(['width', 'padding', 'border', 'margin'] as const).map(k => (
          <label key={k} className="boxm-knob"><span>{k}</span><input type="range" min={k === 'width' ? 40 : 0} max={k === 'width' ? 320 : k === 'border' ? 20 : 60}
            value={st[k]} onChange={e => set(k, Number(e.target.value))} /><b>{st[k]}px</b></label>
        ))}
        <div className="segmented mt-2" role="group" aria-label="box-sizing">
          {(['content-box', 'border-box'] as const).map(b => <button key={b} aria-pressed={st.sizing === b} onClick={() => set('sizing', b)}>{b}</button>)}
        </div>
      </div>
    </div>
  );
}
