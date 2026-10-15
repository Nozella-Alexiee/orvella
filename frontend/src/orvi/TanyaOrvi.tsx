/* Orvi AI: app desktop buat ngobrol apa aja, paling jago soal ngoding. Jawaban mengalir (stream) dalam Markdown.
   Kalau Sandbox terbuka, Orvi bisa membaca berkas proyeknya, mengusulkan perubahan (kartu diff: Terapkan/Tolak/Urungkan),
   dan menjalankan proyek setelah diizinkan (loop agen di agent.ts). Dari halaman bab, Orvi cuma memberi petunjuk.
   Bisa dibuka dari dock, Spotlight, Ctrl+J, tombol "Tanya Orvi AI" di panel Masalah Sandbox, atau halaman bab.
   Riwayat obrolan disimpan di browser (40 pesan terakhir). Nama layanan/model AI tidak ditampilkan.

   Gerak (mockup orvella-design/os/orvi-ai-gerak.html): pil status di atas obrolan, pinggiran jendela berpendar selama Orvi
   kerja, maskot berekspresi per jenis kerjaan, pesan terbang dari kolom ketik, kata muncul dari blur, hasil pencarian
   berjatuhan lalu dilipat, baris kode terbang dari kartu perubahan ke editor Sandbox. Semua mati kalau gerak dikurangi. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import gsap from 'gsap';
import { api, ApiError } from '../api/client';
import { useMe } from '../api/hooks';
import { Icon } from '../design/Icon';
import { Orvi, type Mood } from '../design/Orvi';
import { toast } from '../design/toast';
import { burst, isFull } from '../fx';
import { renderMarkdown } from '../lib/markdown';
import { useWinTitle } from '../os/Window';
import { args, diff, host, hue, proposal, readTool, streamStep, toolLabel, webTool, WEB_TOOLS, type ApiMsg, type Kuota, type ToolCall, type WebHasil } from './agent';
import { useOrviAsk, useOrviTools, type Konteks, type OrviTools } from './ask';
import './orvi.css';

type Ic = 'web' | 'page' | 'file' | 'list' | 'search' | 'think';
type ToolStep = { id: string; k: 'tool'; label: string; ic?: Ic; pill?: string; live?: boolean; gagal?: boolean; hasil?: WebHasil[]; url?: string; open?: boolean };
type Step = ToolStep | ({ id: string } & (
  | { k: 'text'; text: string }
  | { k: 'edit'; proj: number; path: string; before: string | null; after: string; status: 'tunggu' | 'diterapkan' | 'ditolak' | 'diurungkan' | 'gagal'; note?: string }
  | { k: 'run'; status: 'tunggu' | 'diizinkan' | 'ditolak'; out?: string; ok?: boolean }));
type OrviMsg = { id: string; peran: 'orvi'; steps: Step[]; sumber: string; live?: boolean; stop?: boolean; vote?: 'naik' | 'turun' };
type Msg =
  | { id: string; peran: 'user'; teks: string }
  | OrviMsg
  | { id: string; peran: 'info'; jenis: 'batas' | 'rame' | 'pelan'; teks: string; reset?: string | null; ulang?: string };
/** Jenis kerjaan saat ini: warna pil, cahaya jendela, dan ekspresi Orvi. */
type Kind = 'think' | 'web' | 'code' | 'run' | 'write' | 'done';

const SARAN = ['Jelasin for loop pakai contoh', 'Ide proyek web buat pemula', 'Gimana cara baca pesan error?', 'Kasih tips belajar ngoding tiap hari'];
const MAX_STEPS = 8;
const IC: Record<Ic, string> = { web: 'globe', page: 'globe', file: 'file-code', list: 'folder-open', search: 'search', think: 'lightbulb' };
const PILL_IC: Record<Kind, string> = { think: 'lightbulb', web: 'globe', code: 'code-xml', run: 'play', write: 'pen-line', done: 'check' };
const jam = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '');
const uid = () => Math.random().toString(36).slice(2, 10);
const sleep = (ms: number) => new Promise(r => window.setTimeout(r, ms));
const textOf = (m: OrviMsg) => m.steps.map(s => (s.k === 'text' ? s.text : s.k === 'edit' && s.status === 'diterapkan' ? `\n[mengubah ${s.path}]\n` : '')).join('').trim();

/** Riwayat lama (jawaban terstruktur) → langkah Markdown; persetujuan dan langkah yang menggantung dianggap selesai/ditolak. */
function load(key: string): Msg[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]') as Record<string, unknown>[];
    return raw.map(m => {
      if (m.peran !== 'orvi') return m as unknown as Msg;
      const j = m.jawaban as { ringkas?: string; bagian?: { judul: string; isi: string }[]; contoh?: { bahasa: string; kode: string } | null } | undefined;
      if (j) {
        const md = [j.ringkas || '', ...(j.bagian || []).map(b => `**${b.judul}**\n${b.isi}`), j.contoh ? `\`\`\`${j.contoh.bahasa}\n${j.contoh.kode}\n\`\`\`` : ''].filter(Boolean).join('\n\n');
        return { id: String(m.id), peran: 'orvi', steps: [{ id: uid(), k: 'text', text: md }], sumber: String(m.sumber || ''), vote: m.vote } as OrviMsg;
      }
      const o = m as unknown as OrviMsg;
      return { ...o, live: false, steps: (o.steps || []).map(s => (s.k === 'tool' ? { ...s, live: false, open: false }
        : (s.k === 'edit' || s.k === 'run') && s.status === 'tunggu' ? { ...s, status: 'ditolak' } : s)) as Step[] };
    });
  } catch { return []; }
}

/** Orvi lagi ngapain (dari langkah terakhir pesan yang sedang berjalan). */
function activity(m: OrviMsg): { k: Kind; label: string } {
  const last = m.steps[m.steps.length - 1];
  if (!last) return { k: 'think', label: 'Orvi lagi mikir' };
  if (last.k === 'text') return { k: 'write', label: 'Nulis jawaban' };
  if (last.k === 'tool') return last.live ? { k: last.ic === 'web' || last.ic === 'page' ? 'web' : 'code', label: last.pill || last.label } : { k: 'think', label: 'Orvi lagi mikir' };
  if (last.k === 'edit') return last.status === 'tunggu' ? { k: 'code', label: 'Nunggu persetujuanmu' } : { k: 'think', label: 'Orvi lagi mikir' };
  if (last.status === 'tunggu') return { k: 'code', label: 'Nunggu izin menjalankan' };
  if (last.status === 'diizinkan' && last.out === undefined) return { k: 'run', label: 'Menjalankan proyek' };
  return { k: 'think', label: 'Orvi lagi mikir' };
}
function doneLabel(m: OrviMsg): string {
  const src = sources(m).length, edits = m.steps.filter(s => s.k === 'edit' && s.status === 'diterapkan').length;
  return edits ? `Beres · ${edits} perubahan` : src ? `Selesai · ${src} sumber` : 'Selesai';
}
/** Sumber yang dipakai: halaman yang dibuka, atau (kalau tidak ada) hasil teratas pencarian terakhir. */
function sources(m: OrviMsg): WebHasil[] {
  const tools = m.steps.filter((s): s is ToolStep => s.k === 'tool');
  const pages = tools.filter(s => s.ic === 'page' && !s.gagal && s.url).map(s => ({ judul: host(s.url), url: s.url! }));
  const list = pages.length ? pages : (tools.filter(s => s.ic === 'web' && s.hasil?.length).pop()?.hasil || []).slice(0, 3);
  return list.filter((s, i, a) => a.findIndex(x => host(x.url) === host(s.url)) === i).slice(0, 4);
}

const copyText = (t: string) => { (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast({ kind: 'success', icon: 'copy', title: 'Disalin', ms: 1400 })).catch(() => {}); };

/** Markdown dari model (disanitasi). Selama mengalir, kata yang baru masuk muncul dari blur: tiap kata dicatat waktu lahirnya,
    jadi animasinya tetap lanjut walau HTML-nya dirender ulang tiap frame. Blok kode dapat tombol Salin setelah selesai. */
function Md({ text, live }: { text: string; live: boolean }) {
  // penanda kutipan internal model (【1†L4】) dibuang, termasuk yang belum tertutup di ujung teks yang masih mengalir
  const html = useMemo(() => renderMarkdown(text.replace(/【[^】]*】/g, '').replace(/【[^】]*$/, '')), [text]);
  const ref = useRef<HTMLDivElement>(null);
  const born = useRef<number[]>([]);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    if (!live) {
      el.querySelectorAll('pre').forEach(pre => {
        if (pre.querySelector('.orvi-copy')) return;
        const b = document.createElement('button');
        b.className = 'orvi-copy'; b.type = 'button'; b.textContent = 'Salin'; b.setAttribute('aria-label', 'Salin kode');
        b.onclick = () => copyText(pre.querySelector('code')?.textContent || pre.textContent || '');
        pre.appendChild(b);
      });
      return;
    }
    if (!isFull()) return;
    const now = performance.now(), b = born.current, FADE = 480;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.parentElement?.closest('pre') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    const nodes: Text[] = []; while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    let idx = 0;
    for (const t of nodes) {
      const parts = t.data.split(/(\s+)/), words = parts.filter(p => p && !/^\s+$/.test(p)).length;
      let fresh = false;
      for (let j = 0; j < words; j++) { if (b[idx + j] === undefined) b[idx + j] = now; if (now - b[idx + j] < FADE) fresh = true; }
      if (fresh) {
        const frag = document.createDocumentFragment(); let w = idx;
        for (const p of parts) {
          if (!p) continue;
          if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); continue; }
          const age = now - b[w++];
          if (age >= FADE) { frag.appendChild(document.createTextNode(p)); continue; }
          const s = document.createElement('span'); s.className = 'orvi-w'; s.textContent = p; s.style.animationDelay = `-${Math.round(age)}ms`; frag.appendChild(s);
        }
        t.replaceWith(frag);
      }
      idx += words;
    }
  }, [html, live]);
  return <div ref={ref} className={`orvi-md${live ? ' is-live' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Tutup dengan tinggi menyusut (dipakai hasil pencarian yang dilipat). */
function Fold({ open, children }: { open: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(open);
  useEffect(() => {
    if (open) { setShow(true); return; }
    const el = ref.current;
    if (el && isFull()) gsap.to(el, { height: 0, opacity: 0, marginTop: -6, duration: .45, ease: 'power3.inOut', onComplete: () => setShow(false) });
    else setShow(false);
  }, [open]);
  return show ? <div ref={ref} className="orvi-fold">{children}</div> : null;
}

function ToolRow({ s }: { s: ToolStep }) {
  const was = useRef(s.live);
  const [pop, setPop] = useState(false);
  useEffect(() => { if (was.current && !s.live) setPop(true); was.current = s.live; }, [s.live]);
  return (
    <div className={`orvi-tool${s.gagal ? ' is-bad' : ''}${s.live ? ' is-live' : ''}`} data-step={s.id}>
      <div className="orvi-tool-row">
        {s.live ? <span className="orvi-spin" /> : <span className={`orvi-tick${s.gagal ? ' bad' : ''}${pop ? ' pop' : ''}`}>
          {s.gagal ? <Icon name="x" size={14} /> : <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</span>}
        <span className="orvi-tool-lbl"><Icon name={IC[s.ic || 'list']} size={14} />{s.label}</span>
      </div>
      {s.ic === 'web' && s.hasil?.length ? (
        <Fold open={!!s.open}>
          <div className="orvi-res">{s.hasil.slice(0, 4).map((h, i) => (
            <a key={h.url} href={h.url} target="_blank" rel="noreferrer" style={{ ['--i' as string]: i, ['--h' as string]: hue(host(h.url)) } as CSSProperties}>
              <i>{host(h.url).charAt(0).toUpperCase()}</i><span><b>{h.judul || host(h.url)}</b><small>{host(h.url)}</small></span></a>))}</div>
        </Fold>) : null}
      {s.ic === 'page' && s.live && (
        <div className="orvi-page"><div className="orvi-page-url"><Icon name="lock" size={14} /><span>{host(s.url)}</span><span className="ld"><i /></span></div>
          <div className="orvi-page-body"><i /><i /><i /><i /><i /><span className="beam" /></div></div>)}
    </div>
  );
}

function EditCard({ s, onAnswer, onUndo, allowAll }: { s: Extract<Step, { k: 'edit' }>; onAnswer: (ok: boolean, all?: boolean) => void; onUndo: () => void; allowAll: boolean }) {
  const lines = useMemo(() => diff(s.before ?? '', s.after), [s.before, s.after]);
  const add = lines.filter(l => l.k === '+').length, del = lines.filter(l => l.k === '-').length;
  const [all, setAll] = useState(allowAll);
  const [enter] = useState(s.status === 'tunggu');
  let ch = 0;
  return (
    <div className={`orvi-edit is-${s.status}${enter ? ' is-enter' : ''}`} data-step={s.id}>
      <div className="orvi-edit-bar"><Icon name={s.before === null ? 'file-plus' : 'plus-minus'} size={14} /><b>{s.path}</b>
        <small>{s.before === null ? 'berkas baru' : <><span className="add">+{add}</span> <span className="del">−{del}</span></>}</small></div>
      <div className="orvi-diff" aria-label={`Perubahan ${s.path}`}>
        {lines.map((l, i) => (l.k === '…' ? <div key={i} className="dl gap">⋯</div>
          : <div key={i} className={`dl k${l.k === '+' ? 'a' : l.k === '-' ? 'd' : 'c'}`} style={l.k !== ' ' ? { ['--i' as string]: Math.min(ch++, 14) } as CSSProperties : undefined}>
            <span className="n">{l.n ?? ''}</span><span className="m">{l.k}</span><code>{l.t || ' '}</code></div>))}
      </div>
      <div className="orvi-edit-acts">
        {s.status === 'tunggu' ? <>
          <button className="btn btn-sm btn-primary orvi-beckon" onClick={() => onAnswer(true, all)}><Icon name="check" />Terapkan</button>
          <button className="btn btn-sm" onClick={() => onAnswer(false)}><Icon name="x" />Tolak</button>
          <label className="orvi-all"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} />Izinkan semua di obrolan ini</label>
        </> : s.status === 'diterapkan' ? <><span className="orvi-st ok is-pop"><Icon name="check" size={14} />Diterapkan</span>
          <button className="btn btn-sm btn-ghost" onClick={onUndo}><Icon name="rotate-ccw" />Urungkan</button></>
          : <span className="orvi-st">{s.status === 'ditolak' ? 'Ditolak' : s.status === 'diurungkan' ? 'Diurungkan' : s.note || 'Gagal diterapkan'}</span>}
      </div>
    </div>
  );
}

function RunCard({ s, onAnswer }: { s: Extract<Step, { k: 'run' }>; onAnswer: (ok: boolean) => void }) {
  const out = s.out === undefined ? null : (s.out || '(tanpa keluaran)').split('\n').slice(-60);
  return (
    <div className={`orvi-edit is-${s.status}`} data-step={s.id}>
      <div className="orvi-edit-bar"><Icon name="play" size={14} /><b>Jalankan proyek</b>{s.ok && <small className="orvi-okc">✓ berhasil</small>}</div>
      {s.status === 'diizinkan' && !out && <div className="orvi-runbar"><i /></div>}
      {out && <div className="orvi-run-out">{out.map((l, i) => <div key={i} style={{ ['--i' as string]: Math.min(i, 20) } as CSSProperties}>{l || ' '}</div>)}</div>}
      <div className="orvi-edit-acts">{s.status === 'tunggu' ? <>
        <button className="btn btn-sm btn-primary orvi-beckon" onClick={() => onAnswer(true)}><Icon name="play" />Jalankan</button>
        <button className="btn btn-sm" onClick={() => onAnswer(false)}><Icon name="x" />Jangan</button></>
        : <span className={`orvi-st${s.status === 'diizinkan' ? ' ok' : ''}`}>{s.status === 'diizinkan' ? (out ? 'Sudah dijalankan' : 'Menjalankan…') : 'Tidak dijalankan'}</span>}</div>
    </div>
  );
}

const ORVI_MOOD: Record<Kind | '', Mood> = { think: 'think', web: 'focus', code: 'focus', run: 'happy', write: 'happy', done: 'happy', '': 'happy' };

/** Maskot Orvi di samping jawaban: aura warna, alat yang mengorbit, memantul tiap ganti jenis kerjaan, gelembung pikiran. */
function Av({ kind }: { kind: Kind | '' }) {
  const ref = useRef<HTMLSpanElement>(null), prev = useRef(kind);
  useEffect(() => {
    if (prev.current === kind) return; prev.current = kind;
    const body = ref.current?.querySelector('.orvi-av-body');
    if (body && isFull()) gsap.fromTo(body, { scaleX: 1.22, scaleY: .82 }, { scaleX: 1, scaleY: 1, duration: .8, ease: 'elastic.out(1, .35)' });
  }, [kind]);
  useEffect(() => {
    if (kind !== 'think' || !isFull()) return;
    const t = window.setInterval(() => {
      const el = ref.current; if (!el) return;
      const o = document.createElement('i'), s = 4 + Math.random() * 6; o.className = 'orvi-orb';
      o.style.width = o.style.height = `${s}px`; o.style.left = `${45 + Math.random() * 40}%`; o.style.setProperty('--dx', `${6 + Math.random() * 18}px`);
      el.appendChild(o); o.addEventListener('animationend', () => o.remove());
    }, 280);
    return () => window.clearInterval(t);
  }, [kind]);
  return (
    <span ref={ref} className={`orvi-av${kind ? ` is-${kind}` : ''}`}>
      <span className="orvi-av-body"><Orvi size={30} mood={ORVI_MOOD[kind]} force /></span>
      <svg className="orvi-av-tool t-web" viewBox="0 0 24 24"><circle cx="10" cy="10" r="6" /><path d="M14.5 14.5 20 20" /></svg>
      <span className="orvi-av-tool t-code">{'{ }'}</span>
      <svg className="orvi-av-tool t-spark" viewBox="0 0 24 24"><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" /></svg>
    </span>
  );
}

/** Pil status di atas obrolan: teks menggulung saat berganti, lebarnya ikut menyesuaikan. */
function Pill({ k, label }: { k: Kind | null; label: string }) {
  const box = useRef<HTMLSpanElement>(null), lbl = useRef<HTMLSpanElement>(null), on = useRef(false);
  useLayoutEffect(() => {
    const b = box.current, l = lbl.current; if (!b || !l) return;
    const full = isFull();
    if (!k) { if (on.current) { on.current = false; gsap.to(b, { opacity: 0, y: -8, scale: .9, duration: full ? .3 : 0, ease: 'power2.in' }); } return; }
    const cur = l.lastElementChild as HTMLElement | null;
    if (!on.current || !cur) {
      l.replaceChildren(Object.assign(document.createElement('span'), { textContent: label })); on.current = true;
      gsap.fromTo(b, { opacity: 0, y: -10, scale: .85 }, { opacity: 1, y: 0, scale: 1, duration: full ? .55 : 0, ease: 'back.out(2)' });
      return;
    }
    if (cur.textContent === label) return;
    if (!full) { cur.textContent = label; return; }
    const w0 = l.offsetWidth, nx = Object.assign(document.createElement('span'), { textContent: label });
    nx.style.position = 'absolute'; nx.style.left = '0'; nx.style.top = '0'; l.appendChild(nx);
    const w1 = nx.offsetWidth;
    gsap.fromTo(l, { width: w0 }, { width: w1, duration: .4, ease: 'power3.inOut', overwrite: true, onComplete: () => { l.style.width = ''; } });
    gsap.to(cur, { yPercent: -100, opacity: 0, duration: .35, ease: 'power3.out', onComplete: () => cur.remove() });
    gsap.fromTo(nx, { yPercent: 100, opacity: 0 }, { yPercent: 0, opacity: 1, duration: .35, ease: 'power3.out', onComplete: () => { nx.style.position = ''; } });
  }, [k, label]);
  return (
    <div className="orvi-pill-wrap" aria-live="polite">
      <span ref={box} className="orvi-pill" data-k={k || ''} style={{ opacity: 0 }}>
        <span className="ic" key={k || '-'}><Icon name={PILL_IC[k || 'think']} size={14} /></span>
        <span className="lbl" ref={lbl} />
        <span className="dots"><i /><i /><i /></span>
      </span>
    </div>
  );
}

type CardProps = { m: OrviMsg; kind: Kind | ''; fresh: boolean; justDone: boolean; allowAll: boolean; onVote: (v: 'naik' | 'turun', alasan?: string) => void;
  onAnswer: (stepId: string, ok: boolean, all?: boolean) => void; onUndo: (stepId: string) => void };

function OrviCard({ m, kind, fresh, justDone, onVote, onAnswer, onUndo, allowAll }: CardProps) {
  const [why, setWhy] = useState(false);
  const lastText = [...m.steps].reverse().find(s => s.k === 'text')?.id;
  const empty = !m.steps.length;
  const src = m.live ? [] : sources(m);
  return (
    <div className={`orvi-msg orvi-from-orvi${fresh ? ' is-fresh' : ''}`} data-msg={m.id}>
      <Av kind={kind} />
      <div className="orvi-card-wrap">
        <div className="orvi-card">
          {empty && m.live && <div className="orvi-thinking"><span className="orvi-shine">Lagi mikir…</span></div>}
          {m.steps.map(s => (s.k === 'text' ? <Md key={s.id} text={s.text} live={!!m.live && s.id === lastText} />
            : s.k === 'tool' ? <ToolRow key={s.id} s={s} />
              : s.k === 'edit' ? <EditCard key={s.id} s={s} allowAll={allowAll} onAnswer={(ok, all) => onAnswer(s.id, ok, all)} onUndo={() => onUndo(s.id)} />
                : <RunCard key={s.id} s={s} onAnswer={ok => onAnswer(s.id, ok)} />))}
          {src.length > 0 && (
            <div className={`orvi-srcs${justDone ? ' is-fresh' : ''}`}>{src.map((s, i) => (
              <a key={s.url} className="orvi-src" href={s.url} target="_blank" rel="noreferrer" title={s.url} style={{ ['--i' as string]: i, ['--h' as string]: hue(host(s.url)) } as CSSProperties}>
                <i>{host(s.url).charAt(0).toUpperCase()}</i>{host(s.url)}</a>))}</div>)}
          {m.stop && <p className="orvi-ragu"><Icon name="square" size={14} />Dihentikan.</p>}
        </div>
        {!m.live && !empty && (
          <div className={`orvi-fb${justDone ? ' is-fresh' : ''}`}>
            {m.vote ? <small className="orvi-thx"><Icon name="heart" size={14} />{m.vote === 'naik' ? 'Makasih! Orvi jadi tahu jawaban kayak gini yang pas.' : 'Makasih, dicatat buat bikin Orvi lebih baik.'}</small>
              : why ? <><small>Kurangnya di mana?</small>{['Salah', 'Gak nyambung', 'Kepanjangan'].map(r => <button key={r} className="orvi-chip" onClick={() => onVote('turun', r)}>{r}</button>)}</>
                : <>
                  <button className="orvi-ic" title="Membantu" aria-label="Membantu" onClick={() => onVote('naik')}><Icon name="thumbs-up" size={14} /></button>
                  <button className="orvi-ic" title="Kurang tepat" aria-label="Kurang tepat" onClick={() => setWhy(true)}><Icon name="thumbs-down" size={14} /></button>
                  <button className="orvi-ic" title="Salin jawaban" aria-label="Salin jawaban" onClick={() => copyText(textOf(m))}><Icon name="copy" size={14} /></button>
                </>}
          </div>
        )}
      </div>
    </div>
  );
}

/** Baris kode baru terbang dari kartu perubahan ke barisnya di editor Sandbox. */
function flyLines(src: HTMLElement[], to: DOMRect): Promise<void> {
  const r0 = src[0].getBoundingClientRect();
  const box = document.createElement('div'); box.className = 'orvi-diff orvi-fly-lines';
  Object.assign(box.style, { left: `${r0.left}px`, top: `${r0.top}px`, width: `${Math.min(r0.width, 460)}px` });
  src.forEach(el => box.appendChild(el.cloneNode(true)));
  document.body.appendChild(box);
  return new Promise(res => {
    gsap.timeline({ onComplete: () => { box.remove(); res(); } })
      .to(box, { x: to.left - r0.left, duration: .8, ease: 'power3.inOut' }, 0)
      .to(box, { y: to.top - r0.top, duration: .8, ease: 'back.in(1.1)' }, 0)
      .to(box, { scale: 1.06, duration: .4, yoyo: true, repeat: 1 }, 0)
      .to(box, { opacity: 0, duration: .22 }, .68);
  });
}

export default function TanyaOrvi() {
  const { data: me } = useMe();
  const key = `orvi-chat:${me?.id ?? 0}`;
  const [msgs, setMsgs] = useState<Msg[]>(() => load(key));
  const [konteks, setKonteks] = useState<Konteks | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [kuota, setKuota] = useState<Kuota | null>(null);
  const [allowAll, setAllowAll] = useState(false);
  const [pakaiAlat, setPakaiAlat] = useState(true);
  const [done, setDone] = useState<{ id: string; label: string } | null>(null);
  const tools = useOrviTools(s => s.tools);
  const app = useRef<HTMLDivElement>(null), log = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null);
  const pending = useOrviAsk(s => s.pending);
  const abort = useRef<AbortController | null>(null);
  const waiters = useRef(new Map<string, (ok: boolean) => void>());
  const allowRef = useRef(false); allowRef.current = allowAll;
  const msgsRef = useRef(msgs); msgsRef.current = msgs;
  const stick = useRef(true);
  const fresh = useRef(new Set<string>());
  const fly = useRef<{ id: string; from: DOMRect } | null>(null);

  const has = msgs.length > 0;
  // tombol di title bar dibuat sekali per keadaan: elemen baru tiap render bikin judul jendela diperbarui terus (loop)
  const titleTools = useMemo(() => (has ? <button className="btn btn-ghost btn-sm" title="Mulai obrolan baru"
    onClick={() => { abort.current?.abort(); setMsgs([]); setKonteks(null); setAllowAll(false); }}><Icon name="plus" />Obrolan baru</button> : undefined), [has]);
  useWinTitle('Orvi AI', 'asisten', titleTools);
  useEffect(() => { if (!busy) try { localStorage.setItem(key, JSON.stringify(msgs.slice(-40))); } catch { /* mode privat */ } }, [msgs, key, busy]);
  useEffect(() => { api.get<Kuota>('/api/orvi/kuota').then(setKuota).catch(() => {}); }, []);
  useEffect(() => () => abort.current?.abort(), []);
  // ikut turun selama pengguna ada di bawah; kalau dia menggulir ke atas, biarkan
  useEffect(() => { const el = log.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [msgs]);
  const onScroll = () => { const el = log.current; if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; };

  // pesan yang baru dikirim terbang dari kolom ketik ke gelembungnya
  useLayoutEffect(() => {
    const f = fly.current, root = app.current; if (!f || !root) return;
    fly.current = null;
    const bubble = root.querySelector<HTMLElement>(`[data-msg="${f.id}"] .orvi-bubble`); if (!bubble || !isFull()) return;
    const base = root.getBoundingClientRect(), to = bubble.getBoundingClientRect();
    const cl = bubble.cloneNode(true) as HTMLElement; cl.classList.add('orvi-flyer');
    Object.assign(cl.style, { left: `${f.from.left - base.left + 12}px`, top: `${f.from.top - base.top + (f.from.height - to.height) / 2}px`, width: `${to.width}px` });
    root.appendChild(cl); bubble.style.visibility = 'hidden';
    gsap.timeline({ onComplete: () => { cl.remove(); bubble.style.visibility = ''; } })
      .fromTo(cl, { scale: .75, opacity: .5 }, { scale: 1, opacity: 1, duration: .5, ease: 'power3.out' }, 0)
      .to(cl, { x: to.left - base.left - (f.from.left - base.left + 12), duration: .5, ease: 'power3.inOut' }, 0)
      .to(cl, { y: to.top - base.top - (f.from.top - base.top + (f.from.height - to.height) / 2), duration: .5, ease: 'back.out(1.1)' }, 0);
  }, [msgs]);

  const patch = (id: string, fn: (m: OrviMsg) => OrviMsg) => setMsgs(v => v.map(m => (m.id === id && m.peran === 'orvi' ? fn(m) : m)));
  const patchStep = (id: string, sid: string, p: Partial<Step>) => patch(id, m => ({ ...m, steps: m.steps.map(s => (s.id === sid ? { ...s, ...p } as Step : s)) }));
  // langkah baru melipat hasil pencarian yang masih terbuka (kecuali waktu membuka salah satu halamannya)
  const addStep = (id: string, s: Step) => patch(id, m => ({ ...m, steps: [...m.steps.map(x => (x.k === 'tool' && x.open && !(s.k === 'tool' && s.ic === 'page') ? { ...x, open: false } : x)), s] }));
  /** Tunggu jawaban pengguna di kartu (Terapkan/Tolak), kecuali "izinkan semua" sudah dicentang. */
  const askUser = (sid: string, signal: AbortSignal) => (allowRef.current ? Promise.resolve(true) : new Promise<boolean>(res => {
    waiters.current.set(sid, res);
    signal.addEventListener('abort', () => { waiters.current.delete(sid); res(false); }, { once: true });
  }));
  const stepEl = (sid: string) => app.current?.querySelector<HTMLElement>(`[data-step="${sid}"]`) || null;

  const history = (): ApiMsg[] => msgsRef.current.filter(m => m.peran !== 'info').slice(-12)
    .map(m => (m.peran === 'user' ? { role: 'user' as const, content: m.teks } : { role: 'assistant' as const, content: textOf(m as OrviMsg) }))
    .filter(m => m.content);

  /** Setelah perubahan diterapkan: baris barunya terbang ke editor Sandbox lalu menyala hijau di sana. */
  const landEdit = async (sid: string, t: OrviTools, path: string, before: string | null, after: string) => {
    const lines = diff(before ?? '', after), first = lines.find(l => l.k === '+'), count = lines.filter(l => l.k === '+').length;
    const line = first?.n ?? 1;
    const src = [...(stepEl(sid)?.querySelectorAll<HTMLElement>('.dl.ka') || [])].slice(0, 6);
    const to = t.lineRect ? await t.lineRect(path, line) : null;
    if (to && src.length && isFull()) await flyLines(src, to);
    t.flash?.(path, line, Math.max(1, Math.min(count, 40)));
  };

  /** Jalankan satu alat dari model. Hasilnya (teks) dikirim balik ke model. */
  const runTool = async (c: ToolCall, oid: string, signal: AbortSignal): Promise<string> => {
    const a = args(c);
    if (WEB_TOOLS.has(c.name)) {
      const sid = uid(), page = c.name === 'buka_halaman';
      addStep(oid, page ? { id: sid, k: 'tool', ic: 'page', live: true, label: toolLabel(c), pill: `Baca ${host(a.url)}`, url: a.url }
        : { id: sid, k: 'tool', ic: 'web', live: true, open: true, label: toolLabel(c), pill: 'Nyari di web' });
      const out = await webTool(c);
      patchStep(oid, sid, page ? { live: false, gagal: out.gagal, url: out.url || a.url, label: out.gagal ? `Gagal membuka ${host(a.url)}` : `Membaca ${host(out.url)}` }
        : { live: false, gagal: out.gagal, hasil: out.hasil, label: `${toolLabel(c)} · ${out.hasil?.length || 0} hasil` });
      return out.teks;
    }
    const t = useOrviTools.getState().tools;
    if (!t) { addStep(oid, { id: uid(), k: 'tool', label: 'Sandbox sudah ditutup', gagal: true }); return 'Sandbox sudah ditutup pengguna. Jelaskan saja tanpa mengubah berkas.'; }
    if (c.name === 'daftar_berkas' || c.name === 'baca_berkas' || c.name === 'cari') {
      const sid = uid(), ic: Ic = c.name === 'baca_berkas' ? 'file' : c.name === 'cari' ? 'search' : 'list';
      addStep(oid, { id: sid, k: 'tool', ic, live: true, label: toolLabel(c), pill: c.name === 'baca_berkas' ? `Baca ${a.path || 'berkas'}` : c.name === 'cari' ? 'Cari di kode' : 'Lihat berkas' });
      if (c.name === 'baca_berkas') t.scan?.(a.path || '');
      const out = readTool(c, t);
      if (isFull()) await sleep(c.name === 'baca_berkas' ? 650 : 350);  // biar langkahnya sempat kelihatan
      patchStep(oid, sid, { live: false, gagal: out.startsWith('Berkas "') });
      return out;
    }
    if (c.name === 'jalankan') {
      const sid = uid();
      addStep(oid, { id: sid, k: 'run', status: 'tunggu' });
      if (!(await askUser(sid, signal))) { patchStep(oid, sid, { status: 'ditolak' }); return 'Pengguna tidak mengizinkan proyek dijalankan.'; }
      patchStep(oid, sid, { status: 'diizinkan' });
      const out = await t.run();
      const ok = /✓ selesai/.test(out);
      patchStep(oid, sid, { out, ok });
      if (ok) requestAnimationFrame(() => burst(stepEl(sid), { count: 18 }));
      return out || '(tanpa keluaran)';
    }
    const p = proposal(c, t);
    if ('error' in p) { addStep(oid, { id: uid(), k: 'tool', ic: 'file', label: `${toolLabel(c)}: ${p.error.split('.')[0]}`, gagal: true }); return p.error; }
    const sid = uid();
    addStep(oid, { id: sid, k: 'edit', proj: t.id, path: p.path, before: p.before, after: p.after, status: 'tunggu' });
    if (!(await askUser(sid, signal))) { patchStep(oid, sid, { status: 'ditolak' }); return `Pengguna menolak perubahan ${p.path}. Tanyakan maunya gimana.`; }
    const cur = useOrviTools.getState().tools;
    const err = cur && cur.id === t.id ? cur.write(p.path, p.after) : 'Sandbox proyek ini sudah ditutup.';
    patchStep(oid, sid, err ? { status: 'gagal', note: err } : { status: 'diterapkan' });
    if (!err && cur) await landEdit(sid, cur, p.path, p.before, p.after);
    return err ? `Gagal: ${err}` : `Perubahan ${p.path} diterapkan.`;
  };

  const ask = async (q: string, k: Konteks | null = konteks) => {
    const pertanyaan = q.trim(); if (!pertanyaan || busy) return;
    const ctl = new AbortController(); abort.current = ctl;
    const oid = uid(), mid = uid();
    const pesan: ApiMsg[] = [...history(), { role: 'user', content: pertanyaan }];
    const from = input.current?.getBoundingClientRect();
    if (from && document.activeElement === input.current) fly.current = { id: mid, from };
    fresh.current.add(mid); fresh.current.add(oid);
    setMsgs(v => [...v, { id: mid, peran: 'user', teks: pertanyaan }, { id: oid, peran: 'orvi', steps: [], sumber: '', live: true }]);
    setText(''); setBusy(true); setDone(null); stick.current = true;
    // waktu mikir sebelum keluaran pertama; kalau lama, dicatat jadi langkah "Mikir · N detik"
    const t0 = performance.now(); let noted = false;
    const noteThought = () => {
      if (noted) return; noted = true;
      const s = (performance.now() - t0) / 1000;
      if (s >= 1.5) addStep(oid, { id: uid(), k: 'tool', ic: 'think', label: `Mikir · ${Math.round(s)} detik` });
    };
    // teks masuk ke antrean lalu dikeluarkan sedikit demi sedikit tiap frame (efek mengetik). Layanan yang sangat cepat
    // mengirim jawaban dalam beberapa potong besar; tanpa ini teksnya melompat. Makin panjang antrean, makin cepat keluarnya.
    let buf = '', raf = 0, textId = '';
    const append = (add: string) => {
      noteThought();
      const tid = textId || (textId = uid());
      patch(oid, m => {
        const last = m.steps[m.steps.length - 1];
        if (last && last.k === 'text' && last.id === tid) return { ...m, steps: [...m.steps.slice(0, -1), { ...last, text: last.text + add }] };
        return { ...m, steps: [...m.steps.map(x => (x.k === 'tool' && x.open ? { ...x, open: false } : x)), { id: tid, k: 'text', text: add }] };
      });
    };
    const pump = () => {
      raf = 0; if (!buf) return;
      const n = document.hidden ? buf.length : Math.max(2, Math.ceil(buf.length / 18));
      append(buf.slice(0, n)); buf = buf.slice(n);
      if (buf) raf = requestAnimationFrame(pump);
    };
    const flush = () => { cancelAnimationFrame(raf); raf = 0; if (buf) { append(buf); buf = ''; } };
    const drain = () => new Promise<void>(res => { const tick = () => (buf && !document.hidden && !ctl.signal.aborted ? requestAnimationFrame(tick) : (flush(), res())); tick(); });
    let token = '', ok = false;
    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        const t = pakaiAlat ? useOrviTools.getState().tools : null;
        let calls: ToolCall[] = [], said = '', failed = '';
        textId = '';
        await streamStep({ pesan, konteks: k || undefined, alat: !!t, proyek: t?.title, token: token || undefined }, ctl.signal, ev => {
          if (ev.sumber) patch(oid, m => ({ ...m, sumber: ev.sumber! }));
          if (ev.t) { buf += ev.t; said += ev.t; if (!raf) raf = requestAnimationFrame(pump); }
          if (ev.alat) { calls = ev.alat; token = ev.token || token; noteThought(); }
          if (ev.kuota) setKuota(ev.kuota);
          if (ev.error) failed = ev.pesan || 'Orvi lagi rame banget. Coba lagi sebentar ya.';
        });
        await drain();
        if (failed) { const f = failed; setMsgs(v => [...v, { id: uid(), peran: 'info', jenis: 'rame', teks: f, ulang: pertanyaan }]); break; }
        if (!calls.length) { ok = true; break; }
        pesan.push({ role: 'assistant', content: said, tool_calls: calls });
        for (const c of calls) pesan.push({ role: 'tool', tool_call_id: c.id, content: await runTool(c, oid, ctl.signal) });
        if (ctl.signal.aborted) { patch(oid, m => ({ ...m, stop: true })); break; }
      }
    } catch (e) {
      flush();
      if (ctl.signal.aborted) patch(oid, m => ({ ...m, stop: true }));
      else {
        const d = e instanceof ApiError && typeof e.detail === 'object' ? (e.detail as unknown as { kode?: string; pesan?: string; reset_at?: string }) : {};
        setMsgs(v => v.filter(m => !(m.id === oid && m.peran === 'orvi' && !m.steps.length)));
        if (d.kode === 'batas') setMsgs(v => [...v, { id: uid(), peran: 'info', jenis: 'batas', teks: d.pesan || '', reset: d.reset_at }]);
        else if (d.kode === 'pelan') setMsgs(v => [...v, { id: uid(), peran: 'info', jenis: 'pelan', teks: d.pesan || 'Pelan-pelan dikit ya.' }]);
        else setMsgs(v => [...v, { id: uid(), peran: 'info', jenis: 'rame', teks: d.pesan || (e instanceof ApiError && e.offline ? 'Koneksi terputus.' : 'Orvi lagi rame banget.'), ulang: pertanyaan }]);
      }
    } finally {
      patch(oid, m => ({ ...m, live: false, steps: m.steps.map(x => (x.k === 'tool' && (x.live || x.open) ? { ...x, live: false, open: false } : x)) }));
      const m = msgsRef.current.find(x => x.id === oid) as OrviMsg | undefined;
      if (ok && m) { setDone({ id: oid, label: doneLabel(m) }); window.setTimeout(() => setDone(d => (d?.id === oid ? null : d)), 2200); }
      abort.current = null; setBusy(false); input.current?.focus();
    }
  };

  const answer = (sid: string, ok: boolean, all?: boolean) => {
    if (ok && all) setAllowAll(true);
    const w = waiters.current.get(sid); waiters.current.delete(sid); w?.(ok);
  };
  const undo = (oid: string, sid: string) => {
    const m = msgs.find(x => x.id === oid) as OrviMsg | undefined, s = m?.steps.find(x => x.id === sid);
    const t = useOrviTools.getState().tools;
    if (!s || s.k !== 'edit') return;
    if (!t || t.id !== s.proj) { toast({ kind: 'warning', icon: 'folder-open', title: 'Buka proyeknya dulu', body: 'Urungkan bekerja kalau Sandbox proyek itu sedang terbuka.' }); return; }
    if (s.before === null) t.remove(s.path); else t.write(s.path, s.before);
    patchStep(oid, sid, { status: 'diurungkan' });
  };

  // pertanyaan/konteks dari Sandbox, bab, atau Spotlight
  useEffect(() => {
    if (!pending) return;
    useOrviAsk.getState().set(null);
    if (pending.konteks) setKonteks(pending.konteks);
    if (pending.pertanyaan) void ask(pending.pertanyaan, pending.konteks || null); else input.current?.focus();
  }, [pending?.t]); // eslint-disable-line react-hooks/exhaustive-deps

  // apa yang sedang dikerjakan: pil status, cahaya jendela, ekspresi Orvi
  const liveMsg = msgs.find((m): m is OrviMsg => m.peran === 'orvi' && !!m.live);
  const act = liveMsg ? activity(liveMsg) : done ? { k: 'done' as Kind, label: done.label } : null;
  useEffect(() => {
    const w = app.current?.closest<HTMLElement>('.os-win'); if (!w) return;
    if (act && act.k !== 'done') { w.classList.add('orvi-glow'); w.dataset.orviK = act.k; } else w.classList.remove('orvi-glow');
  }, [act?.k]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { app.current?.closest('.os-win')?.classList.remove('orvi-glow'); useOrviTools.getState().setWorking(null); }, []);
  // tombol Orvi AI di Sandbox yang sedang dikerjakan ikut menyala
  const workingOn = act && act.k !== 'done' && pakaiAlat ? tools?.id ?? null : null;
  useEffect(() => { useOrviTools.getState().setWorking(workingOn); }, [workingOn]);

  const vote = (id: string, nilai: 'naik' | 'turun', alasan = '') => {
    setMsgs(v => v.map(m => (m.id === id && m.peran === 'orvi' ? { ...m, vote: nilai } : m)));
    const m = msgs.find(x => x.id === id);
    void api.post('/api/orvi/umpan-balik', { nilai, alasan, sumber: m && m.peran === 'orvi' ? m.sumber : '' }).catch(() => {});
  };
  const submit = (e: FormEvent) => { e.preventDefault(); void ask(text); };
  const low = kuota && !kuota.unlimited && kuota.sisa !== null && kuota.sisa <= 5;
  const ctxLabel = konteks && (konteks.berkas ? `${konteks.berkas}${konteks.baris ? ` · baris ${konteks.baris}` : ''}` : konteks.bab ? `Bab: ${konteks.bab}` : '');
  const linked = !!tools && pakaiAlat;
  const info = (m: Extract<Msg, { peran: 'info' }>): ReactNode => (
    <div key={m.id} className="orvi-info-row"><div className={`orvi-info orvi-info-${m.jenis}`}>
      <span className="orvi-av"><Orvi size={30} mood={m.jenis === 'batas' ? 'sleep' : 'think'} force /></span>
      <div><b>{m.jenis === 'batas' ? 'Batas Orvi AI tercapai' : m.jenis === 'pelan' ? 'Sebentar ya' : 'Orvi lagi rame'}</b>
        <p>{m.teks}{m.jenis === 'batas' && m.reset ? ` Balik penuh jam ${jam(m.reset)}.` : ''}{m.jenis === 'batas' ? ' Penjelasan error di tab Masalah tetap jalan.' : ''}</p>
        {m.ulang && <button className="btn btn-sm btn-primary" onClick={() => { setMsgs(v => v.filter(x => x.id !== m.id)); void ask(m.ulang!); }}><Icon name="refresh-cw" />Coba lagi</button>}
      </div>
    </div></div>
  );

  return (
    <div className="orvi-app" ref={app}>
      {(ctxLabel || low || tools) && (
        <div className="orvi-top">
          {tools && (pakaiAlat
            ? <span className="orvi-ctx is-linked" title="Orvi bisa membaca proyek ini dan mengusulkan perubahan"><Icon name="folder-open" size={14} />Terhubung ke <b>{tools.title}</b>
              <button aria-label="Putuskan dari proyek" title="Putuskan" onClick={() => setPakaiAlat(false)}><Icon name="x" size={14} /></button></span>
            : <button className="orvi-chip" onClick={() => setPakaiAlat(true)}><Icon name="folder-open" size={14} />Hubungkan ke {tools.title}</button>)}
          {ctxLabel && <span className="orvi-ctx"><Icon name="file-code" size={14} /><b>{ctxLabel}</b><button aria-label="Lepas konteks" onClick={() => setKonteks(null)}><Icon name="x" size={14} /></button></span>}
          <span className="grow" />
          {low && <span className={`orvi-quota${kuota!.sisa === 0 ? ' is-empty' : ''}`}><Icon name={kuota!.sisa === 0 ? 'clock' : 'zap'} size={14} />
            {kuota!.sisa === 0 ? `Batas tercapai · ${jam(kuota!.reset_at)}` : `Sisa ${kuota!.sisa}${kuota!.reset_at ? ` · balik penuh ${jam(kuota!.reset_at)}` : ''}`}</span>}
        </div>
      )}
      <div className="orvi-logwrap">
        <Pill k={act?.k ?? null} label={act?.label ?? ''} />
        <div className="orvi-log" ref={log} onScroll={onScroll} aria-live="polite">
          {!msgs.length && (
            <div className="orvi-hello">
              <Orvi size={86} mood="happy" force />
              <h2>Halo, aku Orvi.</h2>
              <p>{linked ? <>Aku bisa lihat proyek <b>{tools!.title}</b>. Minta aku jelasin, benerin error, atau bikin fitur baru. Setiap perubahan kamu cek dulu sebelum diterapkan.</>
                : 'Tanya apa aja: konsep ngoding, error yang bikin bingung, ide proyek, berita terbaru, atau hal lain. Buka Sandbox kalau mau aku bantu langsung di kodenya.'}</p>
              <div className="orvi-saran">{(linked ? ['Jelasin proyek ini', 'Ada bug gak di kodeku?', 'Tambahin komentar biar gampang dibaca'] : SARAN)
                .map(s => <button key={s} className="orvi-chip" onClick={() => void ask(s)}>{s}</button>)}</div>
            </div>
          )}
          {msgs.map(m => (m.peran === 'user' ? <div key={m.id} className={`orvi-msg orvi-from-me${fresh.current.has(m.id) ? ' is-fresh' : ''}`} data-msg={m.id}><div className="orvi-bubble">{m.teks}</div></div>
            : m.peran === 'orvi' ? <OrviCard key={m.id} m={m} allowAll={allowAll} fresh={fresh.current.has(m.id)} justDone={done?.id === m.id}
              kind={m.live ? activity(m).k : done?.id === m.id ? 'done' : ''} onVote={(v, a) => vote(m.id, v, a)} onAnswer={answer} onUndo={sid => undo(m.id, sid)} /> : info(m)))}
        </div>
      </div>
      <form className="orvi-form" onSubmit={submit}>
        <textarea ref={input} rows={1} value={text} placeholder={linked ? `Minta Orvi soal ${tools!.title}…` : 'Tanya apa aja…'} aria-label="Pesan untuk Orvi" maxLength={4000}
          onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(text); } }} />
        {busy ? <button className="btn orvi-send is-stop" type="button" onClick={() => abort.current?.abort()} aria-label="Hentikan" title="Hentikan"><Icon name="square" />
          <svg className="orvi-send-ring" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" /></svg></button>
          : <button className="btn btn-primary orvi-send" type="submit" disabled={!text.trim()} aria-label="Kirim"><Icon name="send" /></button>}
      </form>
      <p className="orvi-foot"><Icon name="info" size={14} />Orvi bisa keliru. Cek lagi jawabannya sebelum dipakai.</p>
    </div>
  );
}
