/* Kuis langsung untuk mentor: /mentor/kuis-langsung (siapkan) dan /kuis-langsung/:pin/layar (layar proyektor). */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, ApiError } from '../api/client';
import { useApi } from '../api/hooks';
import { Icon } from '../design/Icon';
import { Orvi } from '../design/Orvi';
import { toast } from '../design/toast';
import { Html } from '../lib/html';
import { confetti, sound } from '../fx';
import { SHAPES, useCountdown, useLive, type LivePlayer, type LiveQ } from './useLive';
import '@fontsource-variable/unbounded';
import '@fontsource-variable/figtree';
import './live.css';

type Sources = { chapters: { id: number; number: number; title: string; count: number }[]; classes: { id: number; name: string }[] };
const EXAMPLE = 'Apa keluaran print(2 * 3)?\n- 5\n* 6\n- 23\n> Tanda * artinya dikali.\n\nNilai x setelah x = 1 lalu x += 2?\n* 3\n- 1\n- 12';

export function LiveSetup() {
  const nav = useNavigate();
  const q = useApi<Sources>('/api/kuis-langsung/sumber');
  const [source, setSource] = useState<'bab' | 'cepat'>('bab');
  const [chapter, setChapter] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [count, setCount] = useState(8);
  const [seconds, setSeconds] = useState(20);
  const [klass, setKlass] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data && chapter === null) setChapter(q.data.chapters[0]?.id ?? null); }, [q.data, chapter]);
  const start = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ pin: string }>('/api/kuis-langsung', { source, chapter_id: chapter, text, count, seconds, class_id: klass });
      nav(`/kuis-langsung/${r.pin}/layar`);
    } catch (e) { toast({ kind: 'danger', icon: 'presentation', title: 'Belum bisa dimulai', body: e instanceof ApiError ? (e.fields.text || e.message) : 'Coba lagi.' }); }
    finally { setBusy(false); }
  };
  return (
    <main className="page" style={{ maxWidth: 860 }}>
      <div className="page-head"><div><div className="eyebrow">Mentor</div><h1 className="big-serif mt-2" style={{ fontSize: 44 }}>Kuis <em>langsung</em></h1>
        <p className="t-muted mt-2">Tayangkan di proyektor. Siswa menjawab dari HP atau laptop pakai PIN, skornya langsung naik di layar.</p></div></div>
      <section className="lq-setup card">
        <div className="segmented" role="radiogroup">
          <button role="radio" aria-checked={source === 'bab'} aria-pressed={source === 'bab'} onClick={() => setSource('bab')}>Dari bank soal bab</button>
          <button role="radio" aria-checked={source === 'cepat'} aria-pressed={source === 'cepat'} onClick={() => setSource('cepat')}>Tempel soal sendiri</button>
        </div>
        {source === 'bab' ? (
          <label className="field"><span className="field-label">Bab</span>
            <select className="select" value={chapter ?? ''} onChange={e => setChapter(Number(e.target.value))}>
              {q.data?.chapters.map(c => <option key={c.id} value={c.id}>Bab {c.number} · {c.title} ({c.count} soal)</option>)}</select></label>
        ) : (
          <label className="field"><span className="field-label">Soal (tanda * untuk jawaban benar, maksimal 4 pilihan)</span>
            <textarea className="input" rows={10} value={text} onChange={e => setText(e.target.value)} placeholder={EXAMPLE} spellCheck={false} style={{ fontFamily: 'var(--font-mono)' }} /></label>
        )}
        <div className="lq-setup-row">
          <label className="field"><span className="field-label">Jumlah soal</span><input className="input" type="number" min={1} max={30} value={count} onChange={e => setCount(Number(e.target.value))} /></label>
          <label className="field"><span className="field-label">Detik per soal</span><select className="select" value={seconds} onChange={e => setSeconds(Number(e.target.value))}>{[10, 20, 30, 60].map(s => <option key={s} value={s}>{s} detik</option>)}</select></label>
          {(q.data?.classes.length ?? 0) > 1 && <label className="field"><span className="field-label">Kelas</span><select className="select" value={klass ?? ''} onChange={e => setKlass(Number(e.target.value) || null)}>
            {q.data?.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
        </div>
        <button className="btn btn-primary btn-lg" disabled={busy || (source === 'bab' ? !chapter : !text.trim())} onClick={() => void start()}><Icon name="presentation" />Buka lobi</button>
      </section>
    </main>
  );
}

export function LiveScreen() {
  const { pin = '' } = useParams();
  const { status, msg, lobby, answered, send } = useLive(pin);
  const { left, frac } = useCountdown(msg);
  const [fs, setFs] = useState(false);
  const players = (lobby?.players as LivePlayer[]) || [];
  const lastQ = useRef<LiveQ | null>(null);
  if (msg?.t === 'question' && msg.q) lastQ.current = msg.q as LiveQ;
  useEffect(() => { if (msg?.t === 'done') { confetti(); sound('level'); } if (msg?.t === 'reveal') sound('done'); }, [msg]);
  useEffect(() => { const f = () => setFs(!!document.fullscreenElement); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); }, []);
  if (status === 'notfound') return <div className="lq lq-center"><Orvi size={120} mood="oops" force /><h1>Kuis ini sudah selesai</h1><Link className="btn btn-primary" to="/mentor/kuis-langsung">Buat kuis baru</Link></div>;
  if (status === 'forbidden') return <div className="lq lq-center"><h1>Layar ini hanya untuk mentor yang membuat kuisnya.</h1></div>;
  const t = msg?.t;
  const q = (msg?.q as LiveQ) || null;
  return (
    <div className="lq lq-host">
      <header className="lq-bar"><b>{String(lobby?.title || 'Kuis langsung')}</b><span className="lq-pin-sm">PIN <b>{pin}</b></span><span className="grow" />
        {status !== 'open' && <span className="lq-warn">menyambung…</span>}
        <button className="btn btn-sm btn-ghost" onClick={() => (fs ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}><Icon name="maximize-2" />{fs ? 'Keluar layar penuh' : 'Layar penuh'}</button>
        {t !== 'done' && <button className="btn btn-sm btn-ghost" onClick={() => send({ t: 'finish' })}>Akhiri</button>}</header>

      {(!t || t === 'lobby') && (
        <section className="lq-lobby">
          <p>Buka <b>{location.host}/gabung</b> lalu masukkan PIN</p>
          <div className="lq-pin">{pin.split('').map((d, i) => <span key={i}>{d}</span>)}</div>
          <div className="lq-names">{players.length ? players.map(p => <span key={p.id} className="lq-name">{p.name.split(' ')[0]}</span>) : <em>Menunggu siswa bergabung…</em>}</div>
          <div className="lq-lobby-foot"><span>{players.length} bergabung · {String(lobby?.n)} soal · {String(lobby?.seconds)} detik per soal</span>
            <button className="btn btn-primary btn-lg" disabled={!players.length} onClick={() => send({ t: 'start' })}><Icon name="play" />Mulai</button></div>
        </section>
      )}

      {t === 'question' && q && (
        <section className="lq-question">
          <div className="lq-q-top"><span>Soal {Number(msg!.index) + 1} dari {String(msg!.n)}</span>
            <span className="lq-timer" style={{ ['--p' as string]: `${frac * 100}%` }}><b>{Math.ceil(left / 1000)}</b></span>
            <span>{answered && answered.index === msg!.index ? answered.count : String(msg!.answered ?? 0)} / {String(msg!.total ?? players.length)} menjawab</span></div>
          <Html as="h1" html={q.t} />
          {q.c && <pre className="lq-code">{q.c}</pre>}
          <div className="lq-opts">{q.o.map((o, i) => <div key={i} className="lq-opt" style={{ ['--c' as string]: SHAPES[i].color }}><span className="lq-shape">{SHAPES[i].glyph}</span><code>{o}</code></div>)}</div>
          <button className="btn btn-lg lq-next" onClick={() => send({ t: 'reveal' })}>Tampilkan jawaban</button>
        </section>
      )}

      {t === 'reveal' && <Reveal m={msg!} q={lastQ.current} onBoard={() => send({ t: 'board' })} onNext={() => send({ t: 'next' })} />}

      {t === 'board' && (
        <section className="lq-board"><h1>Papan skor</h1>
          <ol>{(msg!.board as LivePlayer[]).map((p, i) => <li key={p.id}><span className="rk">{i + 1}</span><b>{p.name}</b><span className="num">{p.score}</span></li>)}</ol>
          <button className="btn btn-primary btn-lg lq-next" onClick={() => send({ t: 'next' })}>Lanjut<Icon name="arrow-right" /></button></section>
      )}

      {t === 'done' && (
        <section className="lq-podium">
          <Orvi size={120} mood="cheer" force />
          <h1>Juara kuis!</h1>
          <div className="lq-steps">{[1, 0, 2].map(i => { const p = (msg!.podium as LivePlayer[])[i]; return p ? (
            <div key={i} className={`lq-step s${i + 1}`}><b>{p.name.split(' ')[0]}</b><span className="num">{p.score}</span><i>{i + 1}</i></div>) : <div key={i} className="lq-step empty" />; })}</div>
          <div className="lq-actions">
            <a className="btn" href={`/api/kuis-langsung/${String(msg!.quiz_id)}/laporan.csv`}><Icon name="download" />Unduh CSV</a>
            <Link className="btn btn-primary" to="/mentor/kuis-langsung">Kuis baru</Link><Link className="btn btn-ghost" to="/mentor">Ke dashboard</Link></div>
        </section>
      )}
    </div>
  );
}

function Reveal({ m, q, onBoard, onNext }: { m: { [k: string]: unknown }; q: LiveQ | null; onBoard: () => void; onNext: () => void }) {
  const dist = m.dist as number[], max = Math.max(1, ...dist), ans = Number(m.answer);
  return (
    <section className="lq-reveal">
      {q && <><Html as="h2" html={q.t} className="lq-rev-q" /><p className="lq-rev-a">Jawaban: <code>{q.o[ans]}</code></p></>}
      <div className="lq-bars">{dist.map((n, i) => (
        <div key={i} className={`lq-barcol${i === ans ? ' ok' : ''}`} style={{ ['--c' as string]: SHAPES[i].color }}>
          <span className="num">{n}</span><i style={{ height: `${(n / max) * 100}%` }} /><span className="lq-shape">{SHAPES[i].glyph}{i === ans && <Icon name="check" />}</span></div>
      ))}</div>
      {!!m.e && <Html as="p" className="lq-expl" html={String(m.e)} />}
      <div className="lq-actions"><button className="btn btn-lg" onClick={onBoard}>Papan skor</button><button className="btn btn-primary btn-lg" onClick={onNext}>Lanjut<Icon name="arrow-right" /></button></div>
    </section>
  );
}
