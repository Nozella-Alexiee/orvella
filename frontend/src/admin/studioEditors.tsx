import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Checkpoint, IoTest, MemStep, Visual } from '../api/types';
import { CodeEditor } from '../code/CodeEditor';
import { Icon } from '../design/Icon';
import { LangIcon } from '../design/LangIcon';
import { toast } from '../design/toast';
import { cx, Modal } from '../design/ui';
import { Html } from '../lib/html';
import { LANG_BY_ID, LANGS } from '../lib/langs';
import { loadYT } from '../pahami/visuals2';
import { Area, Field, Num, StringList, Text } from './fields';
import './studio.css';

/** The chapter's language, for code fields and highlighting inside the Builder. */
export const BuilderLang = createContext<string>('javascript');
export const useBuilderLang = () => useContext(BuilderLang);

const nid = (p: string) => `${p}${Math.random().toString(36).slice(2, 7)}`;
const RUN_LANGS = LANGS.map(l => l.id);

export function LangSelect({ value, onChange, only, label = 'Bahasa' }: { value: string; onChange: (v: string) => void; only?: string[]; label?: string }) {
  return (
    <div className="row gap-2" style={{ alignItems: 'center' }}>
      <LangIcon id={value} size={22} />
      <select className="select" aria-label={label} value={value} onChange={e => onChange(e.target.value)}>
        {LANGS.filter(l => !only || only.includes(l.id)).map(l => <option key={l.id} value={l.id}>{l.name} · {l.rt}</option>)}
      </select>
    </div>
  );
}

// ------------------------------------------------------------ io tests
export function IoTestsTable({ tests, onChange, lang, solution }: { tests: IoTest[]; onChange: (t: IoTest[]) => void; lang: string; solution?: string }) {
  const [res, setRes] = useState<Record<string, { pass: boolean; detail: string; got?: string | null }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (i: number, p: Partial<IoTest>) => { onChange(tests.map((t, j) => (j === i ? { ...t, ...p } : t))); setRes(null); };
  const check = async () => {
    if (!solution?.trim()) { toast({ kind: 'accent', icon: 'info', title: 'Tulis solusi referensi dulu' }); return; }
    setBusy(true); setErr('');
    try {
      const r = await api.post<{ results: { id: string; pass: boolean; detail: string; got?: string | null }[]; error: { name: string; message: string; line: number | null } | null }>(
        '/api/studio/solution', { language: lang, code: solution, tests: tests.map(t => ({ ...t, kind: 'io' })) });
      setRes(Object.fromEntries(r.results.map(x => [x.id, x])));
      if (r.error && r.results.every(x => !x.pass)) setErr(`${r.error.name}: ${r.error.message}${r.error.line ? ` (baris ${r.error.line})` : ''}`);
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Runner tidak bisa dihubungi.'); }
    finally { setBusy(false); }
  };
  const fill = (i: number) => { const got = res?.[tests[i].id]?.got; if (got != null) set(i, { expect: got.replace(/\n$/, '') }); };
  const passed = res ? Object.values(res).filter(x => x.pass).length : 0;
  return (
    <div>
      <div className="stack gap-2">
        {tests.map((t, i) => {
          const r = res?.[t.id];
          return (
            <div key={t.id} className={cx('iot', r && (r.pass ? 'is-pass' : 'is-fail'))}>
              <div className="iot-head">
                <span className="t-mono t-xs">#{i + 1}</span>
                <input className="input" value={t.name || ''} placeholder="Nama untuk siswa, mis. “angka negatif”" onChange={e => set(i, { name: e.target.value })} />
                <select className="select" value={t.match || 'trim'} onChange={e => set(i, { match: e.target.value })} aria-label="Cara membandingkan">
                  <option value="trim">sama persis (abaikan spasi akhir)</option><option value="exact">sama persis</option><option value="tokens">kata/angka sama</option>
                  <option value="contains">memuat teks</option><option value="regex">pola regex</option>
                </select>
                <label className="check t-xs"><input type="checkbox" checked={!!t.hidden} onChange={e => set(i, { hidden: e.target.checked })} />tersembunyi</label>
                <input className="input" style={{ width: 64 }} type="number" min={1} value={t.pts ?? 1} onChange={e => set(i, { pts: Number(e.target.value) })} aria-label="Poin" title="Poin" />
                <button className="btn btn-ghost btn-icon btn-sm" aria-label="Hapus tes" onClick={() => onChange(tests.filter((_, j) => j !== i))}><Icon name="x" /></button>
              </div>
              <div className="iot-body">
                <label><span className="t-label">Input (stdin)</span><textarea className="textarea mono" rows={2} value={t.stdin || ''} onChange={e => set(i, { stdin: e.target.value })} /></label>
                <label><span className="t-label">Output yang diharapkan</span><textarea className="textarea mono" rows={2} value={t.expect || ''} onChange={e => set(i, { expect: e.target.value })} /></label>
              </div>
              {r && !r.pass && (
                <div className="iot-res">✗ {r.detail}{r.got != null && <> · <button className="link" onClick={() => fill(i)}>pakai keluaran solusi sebagai jawaban</button></>}</div>
              )}
              {r?.pass && <div className="iot-res is-ok">✓ solusi referensi lulus</div>}
            </div>
          );
        })}
      </div>
      <div className="row gap-2 mt-3 wrap">
        <button className="btn btn-ghost btn-sm" onClick={() => onChange([...tests, { id: nid('t'), name: `Tes ${tests.length + 1}`, stdin: '', expect: '', match: 'trim', pts: 1, kind: 'io' }])}><Icon name="plus" />Tes</button>
        {solution !== undefined && <button className={cx('btn btn-secondary btn-sm btn-press', busy && 'is-loading')} onClick={check}><Icon name="play" />Uji solusi referensi</button>}
        {res && <span className={cx('badge', passed === tests.length ? 'badge-success' : 'badge-danger')}>{passed}/{tests.length} lulus</span>}
        {err && <span className="t-xs t-danger">{err}</span>}
      </div>
    </div>
  );
}

// ------------------------------------------------------ quick paste quiz
type ParsedQ = { t: string; o: string[]; a: number; e: string; c?: string };

export function QuickQuizModal({ open, onClose, onAdd, target }: { open: boolean; onClose: () => void; onAdd: (qs: ParsedQ[]) => void; target: string }) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'text' | 'csv'>('text');
  const [res, setRes] = useState<{ questions: ParsedQ[]; warnings: string[] } | null>(null);
  const timer = useRef(0);
  useEffect(() => {
    clearTimeout(timer.current);
    if (!text.trim()) { setRes(null); return; }
    timer.current = window.setTimeout(async () => {
      try { setRes(await api.post('/api/studio/quiz/parse', { text, format: mode })); } catch { setRes(null); }
    }, 350);
  }, [text, mode]);
  const file = async (f: File | undefined) => { if (!f) return; setMode(f.name.endsWith('.csv') ? 'csv' : 'text'); setText(await f.text()); };
  const sample = 'Apa keluaran print(2 ** 3)?\n- 6\n* 8\n- 9\n> 2 ** 3 artinya 2 pangkat 3.\n\nTipe data dari "halo" adalah…\n- int\n* str\n- bool';
  return (
    <Modal open={open} onClose={onClose} title={`Tempel soal cepat · ${target}`} width={880}
      foot={<><button className="btn btn-ghost" onClick={onClose}>Batal</button>
        <button className="btn btn-primary btn-press" disabled={!res?.questions.length} onClick={() => { onAdd(res!.questions); setText(''); onClose(); }}>
          <Icon name="plus" />Tambahkan {res?.questions.length || 0} soal</button></>}>
      <div className="qq">
        <div>
          <div className="row between mb-2">
            <div className="segmented"><button aria-pressed={mode === 'text'} onClick={() => setMode('text')}>Teks</button><button aria-pressed={mode === 'csv'} onClick={() => setMode('csv')}>CSV</button></div>
            <label className="btn btn-ghost btn-sm"><Icon name="upload" />Pilih berkas<input type="file" accept=".txt,.csv,.md" hidden onChange={e => file(e.target.files?.[0])} /></label>
          </div>
          <textarea className="textarea mono" rows={16} value={text} onChange={e => setText(e.target.value)} placeholder={mode === 'text' ? sample : 'pertanyaan,a,b,c,d,jawaban,penjelasan\nIbu kota Indonesia?,Bandung,Jakarta,Medan,,B,'} />
          <p className="t-xs t-faint mt-2">{mode === 'text'
            ? <>Satu soal per blok, pisahkan dengan baris kosong. <b>*</b> = jawaban benar, <b>-</b> = pilihan salah, <b>&gt;</b> = pembahasan. Kode boleh diapit <span className="t-mono">```</span>.</>
            : <>Baris pertama berisi judul kolom: pertanyaan, a, b, c, d, jawaban (huruf atau teks), penjelasan, kode.</>}</p>
          {!text && <button className="btn btn-ghost btn-sm mt-2" onClick={() => { setMode('text'); setText(sample); }}><Icon name="wand-sparkles" />Isi contoh</button>}
        </div>
        <div className="qq-prev">
          <span className="eyebrow">Pratinjau</span>
          {!res && <p className="t-sm t-faint mt-2">Soal yang terbaca muncul di sini sambil kamu mengetik.</p>}
          {res?.warnings.map((w, i) => <div key={i} className="callout callout-warning mt-2"><Icon name="triangle-alert" /><div className="t-sm">{w}</div></div>)}
          {res?.questions.map((q, i) => (
            <div key={i} className="qq-card">
              <div className="t-sm"><b>{i + 1}.</b> <Html html={q.t} /></div>
              {q.c && <pre className="codeblock mt-2"><code>{q.c}</code></pre>}
              <div className="qq-opts">{q.o.map((o, k) => <span key={k} className={cx('qq-opt', k === q.a && 'is-right')}>{'ABCDEF'[k]}. {o}</span>)}</div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------- visuals
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const secs = (s: string) => { const p = s.split(':').map(Number); return p.length === 2 ? (p[0] || 0) * 60 + (p[1] || 0) : Number(s) || 0; };

function TimeInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const [t, setT] = useState(mmss(value));
  useEffect(() => setT(mmss(value)), [value]);
  return <input className="input t-mono" style={{ width: 84 }} aria-label={label} value={t} onChange={e => setT(e.target.value)} onBlur={() => onChange(secs(t))} placeholder="m:ss" />;
}

type YT = { getCurrentTime(): number; destroy(): void };

function VideoEditor({ v, set }: { v: Extract<Visual, { type: 'video' }>; set: (v: Visual) => void }) {
  const [url, setUrl] = useState(v.id ? `https://youtu.be/${v.id}` : '');
  const [busy, setBusy] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YT | null>(null);
  const cps = v.checkpoints || [];
  useEffect(() => {
    if (!v.id) return;
    let alive = true;
    loadYT().then(() => {
      if (!alive || !host.current || !window.YT) return;
      const el = document.createElement('div');
      host.current.innerHTML = '';
      host.current.appendChild(el);
      player.current = new window.YT.Player(el, { videoId: v.id, host: 'https://www.youtube-nocookie.com', width: '100%', height: '100%', playerVars: { rel: 0, start: v.start || 0 } }) as unknown as YT;
    }).catch(() => undefined);
    return () => { alive = false; try { player.current?.destroy(); } catch { /* */ } player.current = null; };
  }, [v.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const fetchInfo = async () => {
    setBusy(true);
    try {
      const r = await api.get<{ id: string; start: number; title: string }>(`/api/studio/oembed?url=${encodeURIComponent(url)}`);
      set({ ...v, id: r.id, title: r.title || v.title, start: r.start || v.start });
    } catch (e) { toast({ kind: 'danger', icon: 'youtube', title: 'Video belum bisa dipakai', body: e instanceof ApiError ? e.message : '' }); }
    finally { setBusy(false); }
  };
  const setCp = (i: number, p: Partial<Checkpoint>) => set({ ...v, checkpoints: cps.map((c, j) => (j === i ? { ...c, ...p } : c)) });
  const addCp = () => {
    const t = Math.round(player.current?.getCurrentTime?.() || (cps.length ? cps[cps.length - 1].t + 60 : 30));
    set({ ...v, checkpoints: [...cps, { t, q: 'Pertanyaan di titik ini?', o: ['Pilihan A', 'Pilihan B', 'Pilihan C'], a: 0, e: '' }].sort((a, b) => a.t - b.t) });
  };
  return (
    <div className="stack gap-3">
      <Field label="Tautan YouTube" help="Tempel tautan video (youtube.com/watch, youtu.be, atau shorts). Judul diambil otomatis.">
        <form className="row gap-2" onSubmit={e => { e.preventDefault(); fetchInfo(); }}>
          <input className="input grow" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://youtu.be/…" />
          <button className={cx('btn btn-secondary btn-press', busy && 'is-loading')}><Icon name="youtube" />Pakai video</button>
        </form>
      </Field>
      {v.id && (
        <>
          <div className="vid-frame" style={{ maxWidth: 560 }}><div ref={host} className="vid-host" /></div>
          <div className="form-grid">
            <Field label="Judul video"><Text value={v.title} onChange={t => set({ ...v, title: t })} /></Field>
            <Field label="Mulai · selesai (m:ss)"><div className="row gap-2"><TimeInput value={v.start || 0} onChange={s => set({ ...v, start: s || undefined })} label="Mulai" /><TimeInput value={v.end || 0} onChange={s => set({ ...v, end: s || undefined })} label="Selesai" /></div></Field>
          </div>
          <div className="row between"><span className="eyebrow">Titik jeda + pertanyaan · {cps.length}</span>
            <button className="btn btn-sun btn-sm btn-press" onClick={addCp}><Icon name="plus" />Tambah pertanyaan di menit video sekarang</button></div>
          {cps.map((c, i) => (
            <div key={i} className="card card-pad">
              <div className="row gap-2" style={{ alignItems: 'center' }}>
                <span className="badge badge-mono">jeda</span><TimeInput value={c.t} onChange={t => setCp(i, { t })} label="Waktu" />
                <input className="input grow" value={c.q} onChange={e => setCp(i, { q: e.target.value })} aria-label="Pertanyaan" />
                <button className="btn btn-ghost btn-icon btn-sm" aria-label="Hapus" onClick={() => set({ ...v, checkpoints: cps.filter((_, j) => j !== i) })}><Icon name="trash-2" /></button>
              </div>
              <div className="stack gap-2 mt-3">
                {c.o.map((o, k) => (
                  <div key={k} className="row gap-2"><input className="input grow" value={o} style={c.a === k ? { borderColor: 'var(--perkuat-fill)' } : undefined}
                    onChange={e => setCp(i, { o: c.o.map((x, j) => (j === k ? e.target.value : x)) })} />
                    <label className="check t-xs"><input type="radio" checked={c.a === k} onChange={() => setCp(i, { a: k })} />benar</label>
                    {c.o.length > 2 && <button className="btn btn-ghost btn-icon btn-sm" aria-label="Hapus pilihan" onClick={() => setCp(i, { o: c.o.filter((_, j) => j !== k), a: c.a >= k && c.a > 0 ? c.a - 1 : c.a })}><Icon name="x" /></button>}</div>
                ))}
                {c.o.length < 4 && <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setCp(i, { o: [...c.o, ''] })}><Icon name="plus" />Pilihan</button>}
                <input className="input" value={c.e || ''} placeholder="Penjelasan jika salah (opsional)" onChange={e => setCp(i, { e: e.target.value })} />
              </div>
            </div>
          ))}
          {!cps.length && <p className="t-xs t-faint">Putar video di atas, jeda di bagian penting, lalu tekan tombol kuning. Video akan berhenti di sana dan siswa harus menjawab dulu.</p>}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------ memory templates
function cppPointer(x: string, v1: string, p: string, v2: string): { lines: string[]; steps: MemStep[] } {
  const ax = '0x7ffe10', ap = '0x7ffe18';
  const f = (vars: MemStep['frames'][0]['vars']) => [{ name: 'main()', vars }];
  return {
    lines: ['#include <iostream>', '', 'int main() {', `    int ${x} = ${v1};`, `    int* ${p} = &${x};`, `    *${p} = ${v2};`, `    std::cout << ${x};`, '}'],
    steps: [
      { line: 3, frames: f([]), heap: [], note: 'Program masuk ke main(). Stack masih kosong.' },
      { line: 4, frames: f([{ name: x, v: v1, addr: ax, type: 'int' }]), heap: [], note: `<b>${x}</b> dibuat di stack pada alamat ${ax}, isinya ${v1}.` },
      { line: 5, frames: f([{ name: x, v: v1, addr: ax }, { name: p, ptr: x, addr: ap, type: 'int*' }]), heap: [], note: `<b>${p}</b> menyimpan <i>alamat</i> ${x} (${ax}), bukan nilainya. Panah artinya “menunjuk ke”.` },
      { line: 6, frames: f([{ name: x, v: v2, addr: ax }, { name: p, ptr: x, addr: ap }]), heap: [], note: `<b>*${p}</b> artinya “isi yang ditunjuk ${p}”. Mengubah *${p} berarti mengubah ${x}.` },
      { line: 7, frames: f([{ name: x, v: v2, addr: ax }, { name: p, ptr: x, addr: ap }]), heap: [], out: v2, note: `Yang tercetak ${v2}: ${x} sudah berubah lewat pointer.` },
    ],
  };
}

function rustOwnership(a: string, text: string, b: string, mode: 'move' | 'clone' | 'borrow'): { lines: string[]; steps: MemStep[] } {
  const f = (vars: MemStep['frames'][0]['vars']) => [{ name: 'main()', vars }];
  const s1 = { id: 'o1', type: 'String', label: `"${text}"`, addr: 'heap' };
  const line2 = mode === 'move' ? `    let ${b} = ${a};` : mode === 'clone' ? `    let ${b} = ${a}.clone();` : `    let ${b} = &${a};`;
  const after: MemStep['frames'][0]['vars'] = mode === 'move' ? [{ name: a, moved: true }, { name: b, ref: 'o1' }]
    : mode === 'clone' ? [{ name: a, ref: 'o1' }, { name: b, ref: 'o2' }] : [{ name: a, ref: 'o1' }, { name: b, ptr: a, type: '&String' }];
  const heap2 = mode === 'clone' ? [s1, { ...s1, id: 'o2' }] : [s1];
  const lines = ['fn main() {', `    let ${a} = String::from("${text}");`, line2, `    println!("{}", ${b});`,
    mode === 'move' ? `    // println!("{}", ${a}); // error: ${a} sudah dipindahkan` : `    println!("{}", ${a});`, '}'];
  const note2 = mode === 'move' ? `Kepemilikan <b>pindah</b> ke ${b}. ${a} tidak boleh dipakai lagi, jadi Rust tidak perlu menyalin data.`
    : mode === 'clone' ? `<b>clone()</b> menyalin datanya ke tempat baru di heap. Sekarang ada dua pemilik untuk dua salinan.`
      : `<b>&${a}</b> meminjam tanpa mengambil kepemilikan. ${b} hanya menunjuk ke ${a}.`;
  return {
    lines,
    steps: [
      { line: 2, frames: f([{ name: a, ref: 'o1', type: 'String' }]), heap: [s1], note: `Teks "${text}" disimpan di heap. <b>${a}</b> adalah pemiliknya.` },
      { line: 3, frames: f(after), heap: heap2, note: note2 },
      { line: 4, frames: f(after), heap: heap2, out: text, note: `${b} dipakai untuk mencetak.` },
      { line: 5, frames: f(after), heap: heap2, out: mode === 'move' ? text : `${text}\n${text}`,
        note: mode === 'move' ? `Baris ini sengaja dikomentari: kalau dijalankan, kompilasi gagal dengan <i>borrow of moved value</i>.` : `${a} masih sah dipakai.` },
      { line: 6, frames: f([]), heap: [], out: mode === 'move' ? text : `${text}\n${text}`, note: 'Akhir main(): pemilik keluar dari scope, jadi memori heap dibebaskan otomatis. Tanpa garbage collector.' },
    ],
  };
}

function MemoryEditor({ v, set }: { v: Extract<Visual, { type: 'memory' }>; set: (v: Visual) => void }) {
  const tpl = v.template || (v.lang === 'python' ? 'python' : v.lang === 'rust' ? 'rust' : v.lang === 'cpp' || v.lang === 'c' ? 'cpp' : 'python');
  const [code, setCode] = useState(v.lang === 'python' ? v.lines.join('\n') : 'a = [1, 2]\nb = a\nb.append(3)\nprint(a)');
  const [stdin, setStdin] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ x: 'x', v1: '5', p: 'p', v2: '7', a: 's', text: 'halo', b: 't', mode: 'move' as 'move' | 'clone' | 'borrow' });
  const trace = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ steps: MemStep[]; error: { name: string; message: string; line: number | null } | null; truncated?: boolean }>('/api/studio/trace', { code, stdin });
      if (!r.steps.length) throw new Error(r.error ? `${r.error.name}: ${r.error.message}` : 'Tidak ada langkah.');
      set({ ...v, lang: 'python', template: 'python', lines: code.split('\n'), steps: r.steps });
      toast({ kind: 'success', icon: 'memory-stick', title: `${r.steps.length} langkah dibuat`, body: r.error ? `Program berhenti karena ${r.error.name}. Error itu ikut dianimasikan.` : r.truncated ? 'Program panjang: hanya 160 langkah pertama.' : 'Lihat hasilnya di pratinjau.' });
    } catch (e) { toast({ kind: 'danger', icon: 'circle-alert', title: 'Animasi belum bisa dibuat', body: e instanceof ApiError || e instanceof Error ? e.message : '' }); }
    finally { setBusy(false); }
  };
  const apply = () => {
    const r = tpl === 'cpp' ? cppPointer(form.x, form.v1, form.p, form.v2) : rustOwnership(form.a, form.text, form.b, form.mode);
    set({ ...v, lang: tpl === 'cpp' ? 'cpp' : 'rust', template: tpl, ...r });
  };
  return (
    <div className="stack gap-3">
      <div className="segmented" role="group" aria-label="Template animasi">
        {([['python', 'python', 'Python · otomatis'], ['cpp', 'cpp', 'C++ · pointer'], ['rust', 'rust', 'Rust · ownership']] as const).map(([id, ic, label]) => (
          <button key={id} aria-pressed={tpl === id} onClick={() => set({ ...v, template: id, lang: id })}><LangIcon id={ic} size={16} />{label}</button>
        ))}
      </div>
      {tpl === 'python' && (
        <>
          <p className="t-sm t-muted">Tulis program Python pendek. Orvella menjalankannya baris demi baris di sandbox dan merekam isi memorinya.</p>
          <div className="codecard"><CodeEditor value={code} onChange={setCode} lang="python" label="Kode Python untuk animasi" small minHeight={160} /></div>
          <div className="row gap-2"><input className="input grow t-mono" value={stdin} onChange={e => setStdin(e.target.value)} placeholder="input (kalau program memakai input())" />
            <button className={cx('btn btn-sun btn-press', busy && 'is-loading')} onClick={trace}><Icon name="wand-sparkles" />Buat animasi</button></div>
        </>
      )}
      {tpl === 'cpp' && (
        <div className="form-grid">
          <Field label="Nama variabel"><Text mono value={form.x} onChange={x => setForm({ ...form, x })} /></Field>
          <Field label="Nilai awal"><Text mono value={form.v1} onChange={v1 => setForm({ ...form, v1 })} /></Field>
          <Field label="Nama pointer"><Text mono value={form.p} onChange={p => setForm({ ...form, p })} /></Field>
          <Field label="Nilai baru lewat pointer"><Text mono value={form.v2} onChange={v2 => setForm({ ...form, v2 })} /></Field>
          <div><button className="btn btn-sun btn-press" onClick={apply}><Icon name="wand-sparkles" />Buat animasi</button></div>
        </div>
      )}
      {tpl === 'rust' && (
        <div className="form-grid">
          <Field label="Pemilik pertama"><Text mono value={form.a} onChange={a => setForm({ ...form, a })} /></Field>
          <Field label="Isi String"><Text value={form.text} onChange={text => setForm({ ...form, text })} /></Field>
          <Field label="Variabel kedua"><Text mono value={form.b} onChange={b => setForm({ ...form, b })} /></Field>
          <Field label="Yang terjadi"><div className="segmented">{(['move', 'clone', 'borrow'] as const).map(m => <button key={m} aria-pressed={form.mode === m} onClick={() => setForm({ ...form, mode: m })}>{m === 'move' ? 'pindah' : m === 'clone' ? 'salin' : 'pinjam'}</button>)}</div></Field>
          <div><button className="btn btn-sun btn-press" onClick={apply}><Icon name="wand-sparkles" />Buat animasi</button></div>
        </div>
      )}
      {v.steps.length > 0 && <div className="badge badge-success" style={{ alignSelf: 'flex-start' }}><Icon name="check" />{v.steps.length} langkah siap · putar di pratinjau</div>}
      <Field label="Catatan umum (muncul kalau langkah tidak punya catatan)"><Text value={v.note} onChange={note => set({ ...v, note: note || undefined })} /></Field>
    </div>
  );
}

/** Structured forms for the visuals mentors use most. Returns null for visuals that only have the JSON editor. */
export function VisualForm({ v, set }: { v: Visual; set: (v: Visual) => void }) {
  const lang = useBuilderLang();
  switch (v.type) {
    case 'video': return <VideoEditor v={v} set={set} />;
    case 'markdown': return (
      <Field label="Teks (markdown)" help="# judul, **tebal**, *miring*, `kode`, - daftar, [tautan](https://…), ```python untuk blok kode.">
        <textarea className="textarea mono" rows={14} value={v.md} onChange={e => set({ ...v, md: e.target.value })} />
      </Field>
    );
    case 'run': return (
      <div className="stack gap-3">
        <LangSelect value={v.lang} onChange={l => set({ ...v, lang: l })} only={RUN_LANGS} />
        <div className="codecard"><CodeEditor value={v.code} onChange={code => set({ ...v, code })} lang={v.lang} label="Kode awal" small minHeight={140} /></div>
        <label className="check"><input type="checkbox" checked={v.stdin !== undefined} onChange={e => set({ ...v, stdin: e.target.checked ? '' : undefined })} />Tampilkan kotak input</label>
        {v.stdin !== undefined && <Field label="Isi awal kotak input"><Text mono value={v.stdin} onChange={stdin => set({ ...v, stdin })} /></Field>}
        <Field label="Catatan di bawah editor"><Text value={v.note} onChange={note => set({ ...v, note: note || undefined })} placeholder="Coba ganti angka 3 lalu jalankan lagi." /></Field>
      </div>
    );
    case 'memory': return <MemoryEditor v={v} set={set} />;
    case 'boxmodel': return (
      <div className="form-grid">
        {(['width', 'padding', 'border', 'margin'] as const).map(k => <Field key={k} label={`${k} awal (px)`}><Num value={v[k]} onChange={n => set({ ...v, [k]: n })} /></Field>)}
        <Field label="box-sizing"><div className="segmented">{(['content-box', 'border-box'] as const).map(b => <button key={b} aria-pressed={(v.sizing || 'content-box') === b} onClick={() => set({ ...v, sizing: b })}>{b}</button>)}</div></Field>
      </div>
    );
    case 'code': return (
      <div className="form-grid">
        <Field label="Nama file"><Text mono value={v.file} onChange={file => set({ ...v, file })} placeholder={`main.${LANG_BY_ID[lang]?.ext || 'txt'}`} /></Field>
        <div />
        <Field label="Kode" full><div className="codecard"><CodeEditor value={v.lines.join('\n')} onChange={c => set({ ...v, lines: c.split('\n') })} lang={lang} label="Kode" small minHeight={120} /></div></Field>
        <Field label="Output (satu baris per baris output)" full><Area mono rows={3} value={(v.outputs || []).join('\n')} onChange={o => set({ ...v, outputs: o ? o.split('\n') : [] })} /></Field>
      </div>
    );
    case 'intro': return (
      <div className="form-grid">
        <Field label="Judul daftar tujuan"><Text value={v.objectives_label} onChange={t => set({ ...v, objectives_label: t })} /></Field>
        <Field label="Gelembung di samping (opsional)"><Text value={v.side?.text} onChange={t => set({ ...v, side: t ? { kind: 'bubble', text: t } : undefined })} /></Field>
        <Field label="Tujuan belajar" full><StringList items={v.objectives} onChange={o => set({ ...v, objectives: o })} addLabel="Tujuan" /></Field>
      </div>
    );
    case 'summary': return (
      <div className="stack gap-2">
        {v.cards.map((c, i) => (
          <div key={i} className="grid grid-2" style={{ gap: 8 }}>
            <input className="input" value={c.title} placeholder="Poin" onChange={e => set({ ...v, cards: v.cards.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
            <div className="row gap-2"><input className="input grow" value={c.body} placeholder="Penjelasan singkat" onChange={e => set({ ...v, cards: v.cards.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) })} />
              <button className="btn btn-ghost btn-icon btn-sm" aria-label="Hapus" onClick={() => set({ ...v, cards: v.cards.filter((_, j) => j !== i) })}><Icon name="x" /></button></div>
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ ...v, cards: [...v.cards, { icon: 'lightbulb', title: '', body: '' }] })}><Icon name="plus" />Poin</button>
        <Field label="Ajakan di bawah (boleh <b>)"><Text value={v.callout?.html} onChange={h => set({ ...v, callout: h ? { icon: 'arrow-right-circle', html: h } : undefined })} /></Field>
      </div>
    );
    case 'cards': return (
      <div className="stack gap-2">
        {v.cards.map((c, i) => (
          <div key={i} className="card card-pad stack gap-2">
            <div className="row gap-2"><input className="input grow" value={c.label} placeholder="Label" onChange={e => set({ ...v, cards: v.cards.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
              <select className="select" style={{ width: 150 }} value={c.tone || 'ok'} onChange={e => set({ ...v, cards: v.cards.map((x, j) => (j === i ? { ...x, tone: e.target.value as 'ok' } : x)) })}><option value="ok">benar</option><option value="bad">salah / error</option><option value="muted">netral</option></select>
              <button className="btn btn-ghost btn-icon btn-sm" aria-label="Hapus" onClick={() => set({ ...v, cards: v.cards.filter((_, j) => j !== i) })}><Icon name="x" /></button></div>
            <input className="input t-mono" value={c.code} placeholder="kode" onChange={e => set({ ...v, cards: v.cards.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)) })} />
            <input className="input" value={c.note} placeholder="Penjelasan" onChange={e => set({ ...v, cards: v.cards.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)) })} />
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ ...v, cards: [...v.cards, { label: 'Contoh', code: '', tone: 'ok', note: '' }] })}><Icon name="plus" />Kartu</button>
      </div>
    );
    default: return null;
  }
}

// --------------------------------------------------------- code exercise
type CodeItem = { lang?: string; starter?: string; solution?: string; tests?: IoTest[]; from_lang?: string; from_code?: string; type: string };

export function CodeItemForm<T extends CodeItem>({ it, set }: { it: T; set: (p: Partial<T>) => void }) {
  const chapterLang = useBuilderLang();
  const lang = it.lang || chapterLang;
  return (
    <div className="stack gap-3">
      {it.type === 'translate' && (
        <>
          <Field label="Kode asal (bahasa lain) yang harus diterjemahkan"><LangSelect value={it.from_lang || 'python'} onChange={l => set({ from_lang: l } as Partial<T>)} /></Field>
          <div className="codecard"><CodeEditor value={it.from_code || ''} onChange={c => set({ from_code: c } as Partial<T>)} lang={it.from_lang || 'python'} label="Kode asal" small minHeight={110} /></div>
        </>
      )}
      <Field label={it.type === 'translate' ? 'Terjemahkan ke' : 'Bahasa jawaban'}><LangSelect value={lang} onChange={l => set({ lang: l } as Partial<T>)} only={RUN_LANGS} /></Field>
      <Field label="Kode awal untuk siswa"><div className="codecard"><CodeEditor value={it.starter || ''} onChange={c => set({ starter: c } as Partial<T>)} lang={lang} label="Kode awal" small minHeight={110} /></div></Field>
      <Field label="Solusi referensi (tidak terlihat siswa; muncul sebagai L6 setelah 3 percobaan)"><div className="codecard"><CodeEditor value={it.solution || ''} onChange={c => set({ solution: c } as Partial<T>)} lang={lang} label="Solusi" small minHeight={110} /></div></Field>
      <div><span className="eyebrow">Tes input → output</span><div className="mt-2"><IoTestsTable tests={it.tests || []} onChange={t => set({ tests: t } as Partial<T>)} lang={lang} solution={it.solution || ''} /></div></div>
    </div>
  );
}
