/* Widget desktop yang bisa dimainkan: Tebak output harian, catatan tempel, timer fokus, jam, dan tanya cepat ke Orvi. */
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../api/client';
import { useApi, useMe } from '../../api/hooks';
import type { Me } from '../../api/types';
import { Icon } from '../../design/Icon';
import { Orvi } from '../../design/Orvi';
import { LangIcon } from '../../design/LangIcon';
import { toast } from '../../design/toast';
import { Html } from '../../lib/html';
import { askOrviAbout } from '../../orvi/ask';
import { confettiAt, shake, sound } from '../../fx';
import { dockOrvi } from '../Dock';
import { flyXp } from '../xp';
import { mmss, pomodoro, remaining, usePomodoro } from '../pomodoro';

// ------------------------------------------------------------ tebak output ---
type Teka = {
  day: string; lang: string; chapter: { number: number; title: string }; xp: number;
  q: { id: string; t: string; c?: string; o: string[] };
  answered: { choice: number; correct: boolean; answer: number; explain: string } | null;
  gained?: number; xp_week?: number;
};
const LANG_NAME: Record<string, string> = { python: 'Python', javascript: 'JavaScript', cpp: 'C++', c: 'C', rust: 'Rust', go: 'Go', java: 'Java', kotlin: 'Kotlin', php: 'PHP', sql: 'SQL' };

export function TekaWidget() {
  const q = useApi<Teka>('/api/teka-teki', { retry: false, staleTime: 5 * 60_000 });
  const qc = useQueryClient();
  const [busy, setBusy] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const t = q.data, a = t?.answered;

  const pick = async (i: number, btn: HTMLButtonElement) => {
    if (a || busy >= 0) return;
    setBusy(i);
    try {
      const r = await api.post<Teka & { gained: number; xp_week: number }>('/api/teka-teki', { choice: i });
      qc.setQueryData(['/api/teka-teki'], r);
      if (r.answered?.correct) {
        sound('ok'); confettiAt(btn); flyXp(btn, r.gained, r.xp_week);
        dockOrvi.current?.react('cheer', 1400);
      } else {
        sound('no'); shake(box.current?.closest('.os-wg'));
        dockOrvi.current?.oops();
        if (r.answered?.explain) window.setTimeout(() => dockOrvi.current?.say(r.answered!.explain.replace(/<[^>]+>/g, ''), { side: 'top', ms: 5200 }), 500);
      }
      void qc.invalidateQueries({ queryKey: ['/api/me'] });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) void q.refetch();
      else toast({ kind: 'danger', icon: 'wifi-off', title: 'Jawaban belum terkirim', body: 'Coba lagi sebentar.' });
    } finally { setBusy(-1); }
  };

  const head = <div className="os-wg-head"><span className="os-eyebrow"><Icon name="braces" size={14} />Tebak output</span>
    {t && <span className="os-chip more"><LangIcon id={t.lang} size={14} />{LANG_NAME[t.lang] || t.lang}</span>}</div>;
  if (q.isLoading) return <>{head}<div className="os-skel" /></>;
  if (!t) return <>{head}<p className="os-empty-s">{q.error instanceof ApiError && q.error.status === 409 ? 'Soal harian muncul setelah kamu mulai satu bab.' : 'Soal belum bisa dimuat.'}</p></>;
  return (
    <div ref={box} className="os-teka">
      {head}
      <Html as="p" className="os-teka-t" html={t.q.t} />
      {t.q.c && <pre className="os-teka-code">{t.q.c}</pre>}
      <div className="os-teka-opts" role="group" aria-label="Pilihan jawaban">
        {t.q.o.map((o, i) => (
          <button key={i} className={`os-teka-opt${a ? (i === a.answer ? ' is-right' : i === a.choice ? ' is-wrong' : ' is-dim') : ''}${busy === i ? ' is-busy' : ''}`}
            disabled={!!a} onClick={e => pick(i, e.currentTarget)}><span className="no">{'ABCD'[i]}</span><code>{o}</code></button>
        ))}
      </div>
      {a ? <p className={`os-teka-res${a.correct ? ' ok' : ''}`}><Icon name={a.correct ? 'circle-check' : 'lightbulb'} size={14} />
          <span>{a.correct ? `Benar! +${t.xp} XP. ` : 'Belum tepat. '}<Html as="span" html={a.explain} /> <small>Soal baru besok.</small></span></p>
        : <p className="os-teka-res"><small>Bab {t.chapter.number} · {t.chapter.title} · +{t.xp} XP kalau benar</small></p>}
    </div>
  );
}

// ---------------------------------------------------------- catatan tempel ---
const NOTE_MAX = 2800;

export function NoteWidget() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [text, setText] = useState<string | null>(null);
  const [state, setState] = useState<'' | 'saving' | 'saved'>('');
  const timer = useRef(0);
  useEffect(() => { if (text === null && me) setText(me.prefs.note || ''); }, [me, text]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const change = (v: string) => {
    setText(v); setState('saving');
    clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try { const u = await api.patch<Me>('/api/me', { prefs: { note: v } }); qc.setQueryData(['/api/me'], u); setState('saved'); }
      catch { setState(''); toast({ kind: 'danger', icon: 'circle-alert', title: 'Catatan belum tersimpan', body: 'Coba ketik lagi sebentar.' }); }
    }, 1000);
  };
  return (
    <div className="os-note">
      <textarea aria-label="Catatan tempel" placeholder={'Tulis apa aja…\ncontoh: jangan lupa titik koma ;)'} maxLength={NOTE_MAX}
        value={text ?? ''} onChange={e => change(e.target.value)} spellCheck={false} />
      <small className="os-note-st">{state === 'saving' ? 'menyimpan…' : state === 'saved' ? 'tersimpan' : ''}</small>
    </div>
  );
}

// ------------------------------------------------------------- timer fokus ---
const PRESETS: [number, number][] = [[25, 5], [50, 10], [15, 3]];

export function PomodoroWidget() {
  const s = usePomodoro();
  const [, tick] = useState(0);
  useEffect(() => { if (!s.running) return; const t = window.setInterval(() => tick(x => x + 1), 500); return () => clearInterval(t); }, [s.running]);
  const left = remaining(s), total = (s.phase === 'work' ? s.work : s.rest) * 60_000, frac = Math.min(1, Math.max(0, 1 - left / total));
  const R = 40, C = 2 * Math.PI * R;
  const preset = PRESETS.findIndex(([w, r]) => w === s.work && r === s.rest);
  return (
    <div className={`os-pomo is-${s.phase}${s.running ? ' is-on' : ''}`}>
      <div className="os-wg-head"><span className="os-eyebrow"><Icon name="timer" size={14} />{s.phase === 'work' ? 'Fokus' : 'Istirahat'}</span>
        <button className="os-chip more" title="Ganti durasi" disabled={s.running} onClick={() => { const [w, r] = PRESETS[(preset + 1) % PRESETS.length]; pomodoro.set(w, r); sound('tap'); }}>{s.work}/{s.rest}</button></div>
      <div className="os-pomo-body">
        <svg viewBox="0 0 100 100" className="os-pomo-ring" aria-hidden="true">
          <circle cx="50" cy="50" r={R} className="bg" /><circle cx="50" cy="50" r={R} className="fg" strokeDasharray={`${C * frac} ${C}`} />
        </svg>
        <b className="os-pomo-t num" aria-live="off">{mmss(left)}</b>
        <div className="os-pomo-act">
          <button className="os-play" aria-label={s.running ? 'Jeda' : 'Mulai'} onClick={() => (s.running ? pomodoro.pause() : pomodoro.start())}><Icon name={s.running ? 'pause' : 'play'} /></button>
          <button className="os-pomo-reset" aria-label="Ulang" onClick={() => pomodoro.reset()}><Icon name="rotate-ccw" size={14} /></button>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- jam ---
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export function JamWidget() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const s = now.getSeconds(), m = now.getMinutes() + s / 60, h = (now.getHours() % 12) + m / 60;
  const hand = (deg: number, len: number, cls: string) => <line className={cls} x1="50" y1="50" x2={50 + len * Math.sin(deg * Math.PI / 180)} y2={50 - len * Math.cos(deg * Math.PI / 180)} />;
  return (
    <div className="os-jam">
      <svg viewBox="0 0 100 100" className="os-jam-face" role="img" aria-label={`Pukul ${now.getHours()}.${String(now.getMinutes()).padStart(2, '0')}`}>
        <circle cx="50" cy="50" r="46" className="rim" />
        {Array.from({ length: 12 }, (_, i) => <line key={i} className={i % 3 ? 'tk' : 'tk big'} x1="50" y1="8" x2="50" y2={i % 3 ? 13 : 16} transform={`rotate(${i * 30} 50 50)`} />)}
        {hand(h * 30, 24, 'h')}{hand(m * 6, 34, 'm')}{hand(s * 6, 36, 's')}
        <circle cx="50" cy="50" r="3.4" className="dot" />
      </svg>
      <div className="os-jam-t"><b className="num">{String(now.getHours()).padStart(2, '0')}.{String(now.getMinutes()).padStart(2, '0')}</b><small>{HARI[now.getDay()]}</small></div>
    </div>
  );
}

// ------------------------------------------------------------ orvi ai ---
const ORVI_SARAN = ['Jelasin for loop', 'Ide proyek pemula'];

/** Kolom tanya cepat: pertanyaannya dikirim ke jendela Orvi AI, jawabannya mengalir di sana. */
export function OrviWidget() {
  const [q, setQ] = useState('');
  const send = (text: string) => { const t = text.trim(); if (!t) return; askOrviAbout({ pertanyaan: t }); setQ(''); };
  return (
    <div className="os-orvi-w">
      <div className="os-wg-head"><span className="os-eyebrow"><Icon name="orvi-ai" size={14} />Orvi AI</span>
        <button className="btn btn-ghost btn-sm more" onClick={() => askOrviAbout()}><Icon name="app-window" />Buka</button></div>
      <form className="os-orvi-ask" onSubmit={e => { e.preventDefault(); send(q); }}>
        <Orvi size={34} mood="happy" force />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tanya apa aja…" aria-label="Pertanyaan untuk Orvi" maxLength={4000}
          onKeyDown={e => e.stopPropagation()} />
        <button className="btn btn-primary btn-sm" type="submit" disabled={!q.trim()} aria-label="Kirim ke Orvi AI"><Icon name="send" /></button>
      </form>
      <div className="os-orvi-saran">{ORVI_SARAN.map(s => <button key={s} type="button" className="os-chip" onClick={() => send(s)}>{s}</button>)}</div>
    </div>
  );
}
