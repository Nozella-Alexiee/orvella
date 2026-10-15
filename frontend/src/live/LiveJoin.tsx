/* Kuis langsung untuk siswa: /gabung (masukkan PIN) dan /gabung/:pin (lobi → soal → hasil → podium). */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api, ApiError } from '../api/client';
import { useMe } from '../api/hooks';
import { Icon } from '../design/Icon';
import { Orvi } from '../design/Orvi';
import { Html } from '../lib/html';
import { confetti, shake, sound } from '../fx';
import { useWinTitle } from '../os/Window';
import { SHAPES, useCountdown, useLive, type LivePlayer, type LiveQ } from './useLive';
import './live.css';

export default function LiveJoin() {
  const { pin } = useParams();
  useWinTitle('Kuis langsung', pin ? `PIN ${pin}` : 'gabung');
  return pin ? <Play pin={pin} /> : <EnterPin />;
}

function EnterPin() {
  const nav = useNavigate();
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api.post('/api/kuis-langsung/gabung', { pin }); sound('ok'); nav(`/gabung/${pin}`); }
    catch (x) { setErr(x instanceof ApiError ? x.message : 'Coba lagi.'); shake(document.querySelector('.lq-pin-in')); sound('no'); }
  };
  return (
    <div className="lq lq-student lq-center">
      <Orvi size={96} mood="happy" force />
      <h1>Gabung kuis langsung</h1>
      <p>Masukkan PIN 6 angka dari layar mentormu.</p>
      <form onSubmit={e => void go(e)} className="lq-join">
        <input className="lq-pin-in" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} autoFocus aria-label="PIN kuis"
          onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr(''); }} placeholder="000000" />
        <button className="btn btn-primary btn-lg" disabled={pin.length !== 6}>Gabung<Icon name="arrow-right" /></button>
      </form>
      {err && <p className="lq-err">{err}</p>}
    </div>
  );
}

function Play({ pin }: { pin: string }) {
  const nav = useNavigate();
  const { data: me } = useMe();
  const { status, msg, lobby, send } = useLive(pin);
  const { left, frac } = useCountdown(msg);
  const [picked, setPicked] = useState<{ index: number; choice: number } | null>(null);
  const t = msg?.t;
  useEffect(() => {
    if (t === 'result') { if (msg!.correct) { sound('ok'); } else sound('no'); }
    if (t === 'done' && Number(msg!.rank) <= 3) confetti();
  }, [msg]); // eslint-disable-line react-hooks/exhaustive-deps
  if (status === 'notfound' || status === 'late' || status === 'forbidden' || status === 'kicked') return (
    <div className="lq lq-student lq-center"><Orvi size={96} mood="oops" force />
      <h1>{status === 'late' ? 'Kuisnya sudah dimulai' : status === 'kicked' ? 'Kamu dikeluarkan dari lobi' : status === 'forbidden' ? 'Kuis ini bukan untuk sekolahmu' : 'Kuisnya sudah selesai'}</h1>
      <button className="btn" onClick={() => nav('/gabung')}>Masukkan PIN lain</button></div>
  );
  const q = (msg?.q as LiveQ) || null;
  const answered = t === 'question' && (msg!.answered === true || picked?.index === msg!.index);
  const pick = (i: number) => { if (!msg || answered) return; setPicked({ index: Number(msg.index), choice: i }); send({ t: 'answer', index: Number(msg.index), choice: i }); sound('tap'); };
  return (
    <div className="lq lq-student">
      <header className="lq-bar"><b>{String(lobby?.title || 'Kuis langsung')}</b><span className="grow" />{status !== 'open' && <span className="lq-warn">menyambung…</span>}
        {msg && 'score' in msg && <span className="lq-myscore num">{String(msg.score)}</span>}</header>
      {(!t || t === 'lobby') && <div className="lq-center"><Orvi size={100} mood="happy" force /><h1>Kamu sudah masuk!</h1>
        <p>Tunggu mentormu memulai. {((lobby?.players as LivePlayer[]) || []).length} teman sudah bergabung.</p><span className="lq-me">{me?.name}</span></div>}
      {t === 'question' && !answered && q && (
        <div className="lq-play">
          <div className="lq-q-top"><span>Soal {Number(msg!.index) + 1}/{String(msg!.n)}</span><i className="lq-qbar"><i style={{ width: `${frac * 100}%` }} /></i><span className="num">{Math.ceil(left / 1000)}</span></div>
          <Html as="h2" html={q.t} />
          {q.c && <pre className="lq-code">{q.c}</pre>}
          <div className="lq-pads">{q.o.map((o, i) => (
            <button key={i} className="lq-pad" style={{ ['--c' as string]: SHAPES[i].color }} onClick={() => pick(i)} aria-label={`${SHAPES[i].key}: ${o}`}>
              <span className="lq-shape">{SHAPES[i].glyph}</span><code>{o}</code></button>
          ))}</div>
        </div>
      )}
      {t === 'question' && answered && <div className="lq-center"><Orvi size={90} mood="think" force /><h2>Jawaban terkirim</h2><p>Tunggu yang lain…</p></div>}
      {t === 'result' && (
        <div className={`lq-center lq-res ${msg!.correct ? 'ok' : 'no'}`}>
          <Orvi size={100} mood={msg!.correct ? 'cheer' : 'oops'} force />
          <h1>{msg!.correct ? 'Benar!' : msg!.answered ? 'Belum tepat' : 'Waktu habis'}</h1>
          {msg!.correct ? <b className="lq-pts">+{String(msg!.points)}</b> : null}
          <p>Kamu peringkat <b>{String(msg!.rank)}</b> dari {String(msg!.of)}</p>
        </div>
      )}
      {t === 'wait' && <div className="lq-center"><Orvi size={90} mood="idle" force /><h2>Soal berikutnya sebentar lagi</h2><p>Peringkatmu sekarang {String(msg!.rank)} dari {String(msg!.of)}.</p></div>}
      {t === 'done' && (
        <div className="lq-center"><Orvi size={110} mood={Number(msg!.rank) <= 3 ? 'cheer' : 'happy'} force />
          <h1>{Number(msg!.rank) === 1 ? 'Juara 1!' : `Peringkat ${String(msg!.rank)}`}</h1><p>Skor akhirmu <b>{String(msg!.score)}</b> dari {String(msg!.of)} peserta.</p>
          <button className="btn" onClick={() => nav('/beranda')}>Ke desktop</button></div>
      )}
    </div>
  );
}
