/* App Duel: /duel = lobi (tantang teman sekelas yang online, tantangan masuk, riwayat) · /duel/:id = arena.
   Semua waktu dan skor dihitung server; di sini hanya ditampilkan. Progres lawan datang lewat kanal presence. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api, ApiError } from '../api/client';
import { useApi, useMe, useRefreshMe } from '../api/hooks';
import { Icon } from '../design/Icon';
import { Orvi } from '../design/Orvi';
import { toast } from '../design/toast';
import { Html } from '../lib/html';
import { confetti, confettiAt, shake, sound } from '../fx';
import { useWinTitle } from '../os/Window';
import { Av } from '../os/Friends';
import { usePresence } from '../os/presence';
import { flyXp } from '../os/xp';
import './duel.css';

type P = { id: number; name: string; initials: string };
type Card = { id: number; state: string; lang: string; opp: P; challenger: boolean; score: [number, number]; won: boolean | null; tie: boolean; expires_at: string };
type Lobby = { incoming: Card[]; outgoing: Card[]; active: Card | null; history: Card[]; paths: { id: number; title: string; language: string }[] };
type Side = P & { score: number; answers: { correct: boolean }[] };
type View = {
  id: number; state: string; lang: string; n: number; per_question: number; me: Side; opp: Side; started_at: string | null; ends_at: string | null; now: string;
  expires_at: string; winner_id: number | null; review?: { t: string; c?: string; answer: string; e: string; mine: string | null; ok: boolean }[];
};
type Q = { index: number; q: { t: string; c?: string; o: string[] }; seconds: number; done: false } | { done: true; index: number };
type Ans = { correct: boolean; answer: number; e: string; points: number; score: number; combo: number; finished: boolean; state: string };

const useRt = (fn: (m: { ev: string; id: number; [k: string]: unknown }) => void) => {
  const ref = useRef(fn); ref.current = fn;
  useEffect(() => { const f = (e: Event) => ref.current((e as CustomEvent).detail); addEventListener('orvella:rt:duel', f); return () => removeEventListener('orvella:rt:duel', f); }, []);
};
const left = (iso: string, skew: number) => Math.max(0, Date.parse(iso) - (Date.now() + skew));
const mmss = (ms: number) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export default function DuelApp() {
  const { id } = useParams();
  useWinTitle('Duel', id ? 'arena' : 'lobi');
  return id ? <Arena id={Number(id)} /> : <DuelLobby />;
}

function DuelLobby() {
  const nav = useNavigate();
  const q = useApi<Lobby>('/api/duel');
  const people = usePresence(s => s.people);
  const [path, setPath] = useState<number | ''>('');
  const [busy, setBusy] = useState<number | null>(null);
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(t); }, []);
  useRt(() => { void q.refetch(); });
  const err = (e: unknown) => toast({ kind: 'danger', icon: 'swords', title: 'Belum bisa', body: e instanceof ApiError ? e.message : 'Coba lagi.' });
  const challenge = async (p: P) => {
    setBusy(p.id);
    try { await api.post('/api/duel', { lawan: p.id, path_id: path || null }); sound('whoosh'); toast({ icon: 'swords', title: `Tantangan dikirim ke ${p.name.split(' ')[0]}`, body: 'Menunggu dia menerima (5 menit).' }); void q.refetch(); }
    catch (e) { if (e instanceof ApiError && typeof e.detail === 'object' && (e.detail as { id?: number }).id) nav(`/duel/${(e.detail as { id: number }).id}`); else err(e); }
    finally { setBusy(null); }
  };
  const accept = async (c: Card) => { try { await api.post(`/api/duel/${c.id}/terima`); nav(`/duel/${c.id}`); } catch (e) { err(e); void q.refetch(); } };
  const decline = async (c: Card) => { await api.post(`/api/duel/${c.id}/tolak`).catch(() => {}); void q.refetch(); };
  const d = q.data;
  const pending = new Set([...(d?.outgoing || []), ...(d?.incoming || [])].map(c => c.opp.id));
  return (
    <div className="dl">
      <header className="dl-hero">
        <Orvi size={84} mood="happy" force />
        <div><h1>Duel 1 lawan 1</h1><p>5 soal Kuis yang sama, 5 menit. Makin cepat benar, makin besar poinnya. Soal diambil dari bab yang sudah kamu pahami.</p></div>
      </header>
      {d?.active && <button className="dl-active" onClick={() => nav(`/duel/${d.active!.id}`)}><Icon name="swords" /><b>Duel melawan {d.active.opp.name} sedang berjalan</b><span>Lanjutkan →</span></button>}
      {!!d?.incoming.length && <section className="dl-sec"><h2>Tantangan masuk</h2>
        {d.incoming.map(c => (
          <div key={c.id} className="dl-row is-hot"><Av f={c.opp} size={36} /><div className="grow"><b>{c.opp.name}</b><small>duel {c.lang} · {mmss(left(c.expires_at, 0))} lagi</small></div>
            <button className="btn btn-primary btn-sm" onClick={() => void accept(c)}><Icon name="swords" />Terima</button><button className="btn btn-sm" onClick={() => void decline(c)}>Nanti</button></div>
        ))}</section>}
      <section className="dl-sec"><h2>Tantang teman yang online</h2>
        <label className="dl-lang"><span>Bahasa</span><select value={path} onChange={e => setPath(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Otomatis</option>{d?.paths.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
        {people.length ? people.map(p => (
          <div key={p.id} className="dl-row"><Av f={p} size={36} /><div className="grow"><b>{p.name}</b><small>{p.what || 'online'}</small></div>
            <button className="btn btn-sm" disabled={busy !== null || pending.has(p.id)} onClick={() => void challenge(p)}><Icon name="swords" />{pending.has(p.id) ? 'Menunggu…' : 'Tantang'}</button></div>
        )) : <p className="dl-empty">Belum ada teman sekelas yang online. Ajak mereka buka Orvella!</p>}
        {d?.outgoing.map(c => (
          <div key={c.id} className="dl-row is-wait"><Icon name="hourglass" /><div className="grow"><b>Menunggu {c.opp.name.split(' ')[0]}</b><small>{mmss(left(c.expires_at, 0))} lagi</small></div>
            <button className="btn btn-sm btn-ghost" onClick={() => void decline(c)}>Batal</button></div>
        ))}
      </section>
      {!!d?.history.length && <section className="dl-sec"><h2>Riwayat</h2>
        {d.history.map(c => (
          <button key={c.id} className="dl-row" onClick={() => c.state === 'done' && nav(`/duel/${c.id}`)} disabled={c.state !== 'done'}>
            <Av f={c.opp} size={30} /><div className="grow"><b>vs {c.opp.name}</b><small>{c.lang} · {c.state === 'done' ? `${c.score[0]} – ${c.score[1]}` : c.state === 'declined' ? 'ditolak' : 'kedaluwarsa'}</small></div>
            {c.state === 'done' && <span className={`dl-badge ${c.tie ? 'tie' : c.won ? 'win' : 'lose'}`}>{c.tie ? 'Seri' : c.won ? 'Menang' : 'Kalah'}</span>}
          </button>
        ))}</section>}
    </div>
  );
}

function Arena({ id }: { id: number }) {
  const nav = useNavigate();
  const refreshMe = useRefreshMe();
  const { data: me } = useMe();
  const [v, setV] = useState<View | null>(null);
  const [skew, setSkew] = useState(0);
  const [q, setQ] = useState<Q | null>(null);
  const [res, setRes] = useState<(Ans & { pick: number }) | null>(null);
  const [qT0, setQT0] = useState(0);
  const [, tick] = useState(0);
  const card = useRef<HTMLDivElement>(null), celebrated = useRef(false);

  const load = useCallback(async () => {
    try { const r = await api.get<View>(`/api/duel/${id}`); setSkew(Date.parse(r.now) - Date.now()); setV(r); return r; }
    catch { toast({ kind: 'danger', icon: 'swords', title: 'Duel tidak ditemukan' }); nav('/duel'); return null; }
  }, [id, nav]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const t = window.setInterval(() => tick(x => x + 1), 250); return () => clearInterval(t); }, []);
  useRt(m => { if (m.id === id) void load(); });

  const fetchQ = useCallback(async () => {
    try { const r = await api.post<Q>(`/api/duel/${id}/soal`); setQ(r); setRes(null); setQT0(Date.now()); if (r.done) void load(); }
    catch (e) { if (e instanceof ApiError && e.status === 425) window.setTimeout(() => void fetchQ(), 400); else void load(); }
  }, [id, load]);

  const started = !!v?.started_at && left(v.started_at, skew) === 0;
  useEffect(() => { if (v?.state === 'live' && started && !q) void fetchQ(); }, [v?.state, started, q, fetchQ]);

  const answer = async (choice: number, el?: HTMLElement | null) => {
    if (!q || q.done || res) return;
    try {
      const r = await api.post<Ans>(`/api/duel/${id}/jawab`, { index: q.index, choice });
      setRes({ ...r, pick: choice });
      if (r.correct) { sound('ok'); confettiAt(el); } else { sound('no'); shake(card.current); }
      setV(x => (x ? { ...x, me: { ...x.me, score: r.score, answers: [...x.me.answers, { correct: r.correct }] } } : x));
      window.setTimeout(() => { if (r.finished) { setQ({ done: true, index: q.index + 1 }); void load(); } else void fetchQ(); }, r.correct ? 1100 : 2200);
    } catch { void load(); }
  };
  // waktu soal habis → dianggap tidak menjawab
  const qLeft = q && !q.done ? Math.max(0, q.seconds * 1000 - (Date.now() - qT0)) : 0;
  useEffect(() => { if (q && !q.done && !res && qLeft === 0 && qT0) void answer(-1); }, [qLeft === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (v?.state !== 'done' || celebrated.current || !me) return;
    celebrated.current = true;
    const won = v.winner_id === me.id, tie = v.winner_id === null;
    if (won) { confetti(); sound('level'); } else sound(tie ? 'done' : 'no');
    window.setTimeout(() => flyXp(document.querySelector('.dl-res-xp'), won ? 30 : tie ? 20 : 10), 700);
    refreshMe();
  }, [v?.state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!v) return <div className="dl"><div className="os-skel" style={{ height: 300 }} /></div>;
  if (v.state === 'pending') return (
    <div className="dl dl-center"><Orvi size={110} mood="think" force /><h2>Menunggu {v.opp.name.split(' ')[0]} menerima…</h2><p>{mmss(left(v.expires_at, skew))} lagi sebelum tantangannya kedaluwarsa.</p>
      <button className="btn" onClick={() => nav('/duel')}>Kembali ke lobi</button></div>
  );
  if (v.state === 'declined' || v.state === 'expired') return (
    <div className="dl dl-center"><Orvi size={110} mood="oops" force /><h2>{v.state === 'declined' ? 'Tantangannya ditolak' : 'Tantangannya kedaluwarsa'}</h2><button className="btn btn-primary" onClick={() => nav('/duel')}>Ke lobi</button></div>
  );

  const bar = (s: Side, mine: boolean) => (
    <div className={`dl-side${mine ? ' me' : ''}`}>
      <Av f={s} size={40} /><div className="grow"><b>{mine ? 'Kamu' : s.name.split(' ')[0]}</b>
        <div className="dl-dots">{Array.from({ length: v.n }, (_, i) => <i key={i} className={i < s.answers.length ? (s.answers[i].correct ? 'ok' : 'no') : ''} />)}</div></div>
      <span className="dl-score num">{s.score}</span>
    </div>
  );

  if (v.state === 'done') {
    const won = v.winner_id === me?.id, tie = v.winner_id === null;
    return (
      <div className="dl">
        <div className="dl-res">
          <Orvi size={110} mood={won ? 'cheer' : tie ? 'happy' : 'oops'} force />
          <h2>{tie ? 'Seri!' : won ? 'Kamu menang!' : `${v.opp.name.split(' ')[0]} menang`}</h2>
          <div className="dl-vs">{bar(v.me, true)}{bar(v.opp, false)}</div>
          <span className="dl-res-xp">+{won ? 30 : tie ? 20 : 10} XP</span>
        </div>
        <section className="dl-sec"><h2>Pembahasan</h2>
          {v.review?.map((r, i) => (
            <div key={i} className={`dl-rev ${r.ok ? 'ok' : 'no'}`}><Icon name={r.ok ? 'circle-check' : 'circle-x'} />
              <div><Html as="b" html={r.t} />{r.c && <pre>{r.c}</pre>}<small>Jawaban: <code>{r.answer}</code>{!r.ok && <> · kamu: <code>{r.mine ?? 'tidak menjawab'}</code></>}</small><Html as="p" html={r.e} /></div></div>
          ))}</section>
        <div className="dl-actions"><button className="btn btn-primary" onClick={() => void api.post<View>('/api/duel', { lawan: v.opp.id }).then(r => nav(`/duel/${r.id}`)).catch(e => toast({ kind: 'danger', icon: 'swords', title: 'Belum bisa', body: e instanceof ApiError ? e.message : '' }))}><Icon name="swords" />Duel lagi</button>
          <button className="btn" onClick={() => nav('/duel')}>Ke lobi</button></div>
      </div>
    );
  }

  const cd = v.started_at ? left(v.started_at, skew) : 0;
  const total = v.ends_at ? left(v.ends_at, skew) : 0;
  return (
    <div className="dl dl-arena">
      <div className="dl-top"><span className="os-chip"><Icon name="swords" size={14} />{v.lang}</span><span className="dl-clock num"><Icon name="timer" size={14} />{mmss(total)}</span></div>
      <div className="dl-vs">{bar(v.me, true)}{bar(v.opp, false)}</div>
      {cd > 0 ? <div className="dl-count"><b key={Math.ceil(cd / 1000)}>{Math.ceil(cd / 1000) > 3 ? 'Siap?' : Math.ceil(cd / 1000)}</b></div>
        : q && !q.done ? (
          <div ref={card} className="dl-q">
            <div className="dl-q-top"><span>Soal {q.index + 1} dari {v.n}</span><i className="dl-qbar"><i style={{ width: `${(qLeft / (q.seconds * 1000)) * 100}%` }} /></i><span className="num">{Math.ceil(qLeft / 1000)}s</span></div>
            <Html as="h3" html={q.q.t} />
            {q.q.c && <pre className="dl-code">{q.q.c}</pre>}
            <div className="dl-opts">{q.q.o.map((o, i) => (
              <button key={i} className={`dl-opt${res ? (i === res.answer ? ' ok' : i === res.pick ? ' no' : ' dim') : ''}`} disabled={!!res} onClick={e => void answer(i, e.currentTarget)}>
                <span className="k">{'ABCD'[i]}</span><code>{o}</code></button>
            ))}</div>
            {res && <p className={`dl-fb ${res.correct ? 'ok' : 'no'}`}>{res.correct ? `Benar! +${res.points}${res.combo > 1 ? ` · combo ×${res.combo}` : ''}` : res.pick < 0 ? 'Waktu habis.' : 'Belum tepat.'} <Html as="span" html={res.e} /></p>}
          </div>
        ) : <div className="dl-center"><Orvi size={90} mood="think" force /><h3>Kamu sudah selesai!</h3><p>Menunggu {v.opp.name.split(' ')[0]}… ({v.opp.answers.length}/{v.n})</p></div>}
    </div>
  );
}
