/* Beranda sebagai desktop: sapaan, widget yang bisa diatur (seret untuk menyusun, buang,
   tambah dari laci), dan ikon proyek Sandbox yang bisa diseret ke dock. */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { api } from '../api/client';
import { useApi, useMe, useRefreshMe } from '../api/hooks';
import type { Home } from '../api/types';
import { Icon } from '../design/Icon';
import { LangIcon } from '../design/LangIcon';
import { PhaseRing } from '../design/PhaseRing';
import { toast } from '../design/toast';
import { Html } from '../lib/html';
import { greeting, todayLabel, useHeartbeat } from '../lib/hooks';
import { confettiAt, motion, pop, ring, shake, sound, ticker } from '../fx';
import { usePrefs } from '../state/prefs';
import { draggable, target } from './dnd';
import { TemanWidget } from './Friends';
import { controller, useMusic } from './music/store';
import { useOs } from './OsLayout';
import { useWM } from './wm';
import { JamWidget, NoteWidget, OrviWidget, PomodoroWidget, TekaWidget } from './widgets';

gsap.registerPlugin(Flip);
type Quest = { id: string; icon: string; title: string; n: number; of: number; xp: number; claimed: boolean };
type HomeOS = Home & { quests: { day: string; items: Quest[] } };
type Proj = { id: number; title: string; kind: string; lang: string; stack: string | null; updated: string; visibility: string; stars: number };

const WIDGETS: Record<string, { label: string; icon: string; size: string }> = {
  lanjut: { label: 'Lanjut belajar', icon: 'graduation-cap', size: 'w2 h2' },
  orvi: { label: 'Orvi AI', icon: 'orvi-ai', size: 'w2' },
  streak: { label: 'Beruntun', icon: 'activity', size: '' },
  target: { label: 'Target', icon: 'target', size: '' },
  teman: { label: 'Teman online', icon: 'users', size: 'w2 h2' },
  quest: { label: 'Quest harian', icon: 'award', size: 'w2' },
  musik: { label: 'Musik', icon: 'radio', size: 'w2' },
  proyek: { label: 'Proyek Sandbox', icon: 'code-xml', size: 'w2' },
  mentor: { label: 'Pesan mentor', icon: 'message-circle', size: 'w2' },
  kuis: { label: 'Kuis harian', icon: 'zap', size: '' },
  teka: { label: 'Tebak output', icon: 'braces', size: 'w2 h2' },
  catatan: { label: 'Catatan tempel', icon: 'sticky-note', size: 'h2' },
  fokus: { label: 'Timer fokus', icon: 'timer', size: '' },
  jam: { label: 'Jam', icon: 'clock', size: '' },
};
const DEFAULT = ['lanjut', 'orvi', 'teka', 'streak', 'fokus', 'teman', 'catatan', 'target', 'quest', 'musik', 'proyek', 'jam', 'mentor', 'kuis'];
const readOrder = () => {
  try {
    const v = JSON.parse(localStorage.getItem('orvella-widgets') || 'null');
    if (!Array.isArray(v)) return DEFAULT;
    const o = v.filter((x: string) => WIDGETS[x]) as string[];
    // susunan lama (sebelum widget yang bisa dimainkan): selipkan Tebak output dan Timer fokus sekali saja
    if (localStorage.getItem('orvella-widgets-v') !== '2') {
      if (!o.includes('teka')) o.splice(o.indexOf('lanjut') + 1, 0, 'teka');
      if (!o.includes('fokus')) o.splice(Math.min(o.length, 3), 0, 'fokus');
      localStorage.setItem('orvella-widgets-v', '2');
      localStorage.setItem('orvella-widgets', JSON.stringify(o));
    }
    // v3: widget Orvi AI muncul sekali di susunan lama (kalau dibuang setelahnya, tetap dibuang)
    if (localStorage.getItem('orvella-widgets-v') !== '3') {
      if (!o.includes('orvi')) o.splice(Math.max(0, o.indexOf('lanjut')) + 1, 0, 'orvi');
      localStorage.setItem('orvella-widgets-v', '3');
      localStorage.setItem('orvella-widgets', JSON.stringify(o));
    }
    return o;
  } catch { return DEFAULT; }
};
const LIVE = new Set(['teman', 'musik', 'teka', 'catatan', 'fokus', 'jam']);  // punya data sendiri, tidak menunggu /api/home
const readSort = () => { try { return localStorage.getItem('orvella-icons') === 'nama' ? 'nama' : 'baru'; } catch { return 'baru'; } };
const nearLight = (x: number, y: number) => { const L = (window as unknown as { __osLight?: { x: number; y: number } }).__osLight; return !!L && Math.hypot(x - L.x, y - L.y) < 46; };

function Ring({ v, size = 64, color = 'var(--os-mint)' }: { v: number; size?: number; color?: string }) {
  const s = 8, r = (size - s) / 2, c = 2 * Math.PI * r;
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ rotate: '-90deg' }} aria-hidden="true"><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--os-panel-2)" strokeWidth={s} /><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={s} strokeLinecap="round" strokeDasharray={`${c * Math.min(1, v)} ${c}`} /></svg>;
}

function QuestWidget({ q }: { q: HomeOS['quests'] }) {
  const refresh = useRefreshMe();
  const [items, setItems] = useState(q.items);
  const chest = useRef<HTMLButtonElement>(null);
  useEffect(() => setItems(q.items), [q.items]);
  const ready = items.some(i => i.n >= i.of && !i.claimed);
  const claim = async () => {
    if (!ready) { shake(chest.current); sound('no'); toast({ icon: 'award', title: 'Peti masih terkunci', body: 'Selesaikan satu quest dulu, lalu buka petinya.' }); return; }
    const r = await api.post<{ xp: number; items: Quest[]; xp_week: number }>('/api/quests/claim');
    setItems(r.items); confettiAt(chest.current); sound('level');
    const xpEl = document.querySelector<HTMLElement>('[data-xp]');
    if (xpEl) { ticker(xpEl, r.xp_week); pop(xpEl); }
    toast({ kind: 'success', icon: 'award', title: `Hadiah quest: +${r.xp} XP`, body: 'Wallpaper Hujan Kode terbuka di 1500 XP.' });
    refresh();
  };
  return (
    <>
      <div className="os-wg-head"><span className="os-eyebrow"><Icon name="award" size={14} />Quest harian · reset 23.59</span>
        <button ref={chest} className={`os-chest more${ready ? ' is-ready' : ''}`} aria-label="Klaim hadiah quest" title="Klaim hadiah" onClick={claim}><Icon name="award" /></button></div>
      <div className="os-quests">
        {items.map(i => (
          <div key={i.id} className={`os-quest${i.n >= i.of ? ' is-done' : ''}`}>
            <span className="os-qi"><Icon name={i.n >= i.of ? 'check' : i.icon === 'git-fork' ? 'git-branch' : i.icon} /></span>
            <div><b>{i.title}</b><div className="os-qbar"><i style={{ width: `${Math.round(100 * i.n / i.of)}%` }} /></div></div>
            <span className="os-qrw">{i.claimed ? 'diklaim' : `${i.n}/${i.of} · +${i.xp} XP`}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function MusikWidget() {
  const cur = useMusic(s => s.current), playing = useMusic(s => s.playing);
  const os = useOs();
  return (
    <>
      <div className="os-wg-head"><span className="os-eyebrow"><Icon name="radio" size={14} />Musik</span></div>
      <div className="os-wgm">
        <span className={`os-mbm-eq big${playing ? ' is-on' : ''}`}><i /><i /><i /><i /><i /></span>
        <div className="grow" style={{ minWidth: 0 }}><b>{cur ? cur.title : 'Belum ada musik'}</b><small>{cur ? (cur.provider === 'spotify' ? 'Spotify' : 'Apple Music') : 'Sambungkan Spotify atau Apple Music'}</small></div>
        {cur?.provider === 'spotify' && controller.c
          ? <button className="os-play" aria-label={playing ? 'Jeda' : 'Putar'} onClick={() => controller.c?.togglePlay()}><Icon name={playing ? 'pause' : 'play'} /></button>
          : <button className="os-play" aria-label="Buka Musik" onClick={() => os?.openApp('musik')}><Icon name={cur ? 'play' : 'plus'} /></button>}
      </div>
    </>
  );
}

function ProyekWidget({ items }: { items: Proj[] }) {
  return (
    <>
      <div className="os-wg-head"><span className="os-eyebrow"><Icon name="code-xml" size={14} />Proyek Sandbox</span><Link className="btn btn-ghost btn-sm more" to="/sandbox?baru=1"><Icon name="plus" />Baru</Link></div>
      <div className="os-projs">
        {items.slice(0, 3).map(p => (
          <Link key={p.id} className="os-proj" to={`/sandbox/${p.id}`}>
            <LangIcon id={p.kind === 'web' ? (p.stack === 'static' ? 'html' : p.stack === 'flask' || p.stack === 'fastapi' ? 'python' : p.stack === 'php' ? 'php' : 'javascript') : p.lang} size={26} />
            <b>{p.title}</b><small>{p.updated}{p.visibility !== 'private' ? ' · terbit' : ''}</small>
          </Link>
        ))}
        {!items.length && <p className="os-empty-s">Belum ada proyek. Buat yang pertama, bebas apa saja.</p>}
      </div>
    </>
  );
}

export function Desktop() {
  const { data: me } = useMe();
  const q = useApi<HomeOS>('/api/home');
  const projs = useApi<{ items: Proj[] }>('/api/sandbox');
  const nav = useNavigate();
  const visible = useWM(s => s.wins.some(w => !w.min));
  const [order, setOrder] = useState<string[]>(readOrder);
  const [edit, setEdit] = useState(false);
  const [sort, setSort] = useState<'baru' | 'nama'>(readSort);
  const [renaming, setRenaming] = useState<number | null>(null);
  const toggleTheme = usePrefs(s => s.toggleTheme);
  const box = useRef<HTMLDivElement>(null);
  const icons = useRef<HTMLDivElement>(null);
  useHeartbeat();
  const save = (o: string[]) => { setOrder(o); try { localStorage.setItem('orvella-widgets', JSON.stringify(o)); } catch { /* */ } };

  // sambutan: widget muncul berurutan
  useLayoutEffect(() => {
    if (!q.data || motion() === 'off' || !box.current) return;
    gsap.from(box.current.querySelectorAll('.os-wg'), { y: 30, opacity: 0, scale: .94, stagger: .05, duration: .55, ease: 'back.out(1.5)', clearProps: 'transform,opacity,scale' });
  }, [!!q.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // bayangan widget mengikuti cahaya wallpaper
  useEffect(() => {
    const f = (e: Event) => {
      const L = (e as CustomEvent<{ x: number; y: number }>).detail;
      box.current?.querySelectorAll<HTMLElement>('.os-wg').forEach(el => {
        const b = el.getBoundingClientRect(), dx = b.left + b.width / 2 - L.x, dy = b.top + b.height / 2 - L.y, d = Math.hypot(dx, dy) || 1;
        el.style.setProperty('--shx', (dx / d * 12).toFixed(1) + 'px'); el.style.setProperty('--shy', (dy / d * 12 + 6).toFixed(1) + 'px');
      });
    };
    addEventListener('os:light', f); return () => removeEventListener('os:light', f);
  }, []);

  // ikon proyek bisa diseret ke dock
  useEffect(() => {
    const offs: (() => void)[] = [];
    icons.current?.querySelectorAll<HTMLElement>('[data-proj]').forEach(el => {
      offs.push(draggable(el, () => ({ type: 'proyek', id: Number(el.dataset.proj), label: el.dataset.name || 'proyek' })));
    });
    return () => offs.forEach(f => f());
  }, [projs.data]);

  // laci widget: chip bisa diseret ke posisi mana pun
  useEffect(() => {
    if (!edit || !box.current) return;
    const offs = [target(box.current, ['widget'], (d, ev) => {
      const over = document.elementsFromPoint(ev.clientX, ev.clientY).find(n => (n as HTMLElement).dataset?.w) as HTMLElement | undefined;
      add(String(d.id), over?.dataset.w);
    }, { hint: d => `Taruh widget ${d.label} di sini` })];
    document.querySelectorAll<HTMLElement>('.os-wg-chip').forEach(c => offs.push(draggable(c, () => ({ type: 'widget', id: c.dataset.id!, label: c.textContent || '' }))));
    return () => offs.forEach(f => f());
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // perintah dari menu klik kanan (os/ContextMenu.tsx)
  useEffect(() => {
    const f = (e: Event) => {
      const d = (e as CustomEvent<{ do: string; id?: string | number }>).detail;
      if (d.do === 'edit') setEdit(true);
      else if (d.do === 'add' && d.id) {
        const id = String(d.id);
        if (order.includes(id)) { const el = box.current?.querySelector<HTMLElement>(`[data-w="${id}"]`); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); pop(el); if (id === 'catatan') el?.querySelector('textarea')?.focus(); }
        else { add(id); sound('pop'); if (id === 'catatan') window.setTimeout(() => box.current?.querySelector<HTMLTextAreaElement>('[data-w="catatan"] textarea')?.focus(), 450); }
      } else if (d.do === 'remove' && d.id) remove(String(d.id));
      else if (d.do === 'tidy') tidy();
      else if (d.do === 'rename' && d.id) setRenaming(Number(d.id));
    };
    addEventListener('os:desk', f); return () => removeEventListener('os:desk', f);
  });

  // ikon desktop dirapikan: urut nama ⇄ terbaru, dengan animasi Flip
  const tidy = () => {
    const st = icons.current ? Flip.getState(icons.current.children) : null;
    const next = sort === 'baru' ? 'nama' : 'baru';
    setSort(next); try { localStorage.setItem('orvella-icons', next); } catch { /* */ }
    sound('whoosh');
    requestAnimationFrame(() => { if (st && motion() !== 'off') Flip.from(st, { duration: .5, ease: 'back.out(1.4)', stagger: .03 }); });
    toast({ icon: 'layout-grid', title: next === 'nama' ? 'Ikon diurutkan menurut nama' : 'Ikon diurutkan dari yang terbaru' });
  };
  const rename = async (id: number, title: string) => {
    setRenaming(null);
    const p = projs.data?.items.find(x => x.id === id);
    if (!p || !title.trim() || title.trim() === p.title) return;
    try { await api.patch(`/api/sandbox/${id}`, { title }); await projs.refetch(); sound('ok'); }
    catch { toast({ kind: 'danger', icon: 'circle-alert', title: 'Nama belum tersimpan' }); }
  };

  // matahari/bulan di wallpaper bisa diklik untuk ganti Siang/Malam
  const onDeskClick = (e: React.MouseEvent) => {
    if ((e.target as Element).closest('.os-wg,.os-dicon,button,a,input,textarea,.os-edit-bar') || !nearLight(e.clientX, e.clientY)) return;
    ring(e.clientX, e.clientY); sound('whoosh');
    const wall = document.querySelector('.os-wall');
    wall?.classList.remove('is-swap'); void (wall as HTMLElement | null)?.offsetWidth; wall?.classList.add('is-swap');
    toggleTheme();
  };
  const onDeskMove = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement, near = !(e.target as Element).closest('.os-wg,.os-dicon') && nearLight(e.clientX, e.clientY);
    if (near !== (el.dataset.sun === '1')) { el.dataset.sun = near ? '1' : ''; el.style.cursor = near ? 'pointer' : ''; el.title = near ? 'Klik untuk ganti Siang/Malam' : ''; }
  };

  const flip = (fn: () => void) => { const st = box.current ? Flip.getState(box.current.children) : null; fn(); requestAnimationFrame(() => { if (st && motion() !== 'off') Flip.from(st, { duration: .4, ease: 'power3.out' }); }); };
  const remove = (id: string) => flip(() => save(order.filter(x => x !== id)));
  const add = (id: string, before?: string) => flip(() => { const o = order.filter(x => x !== id); const i = before ? o.indexOf(before) : -1; o.splice(i < 0 ? o.length : i, 0, id); save(o); });

  // susun ulang lewat seret (mode Atur)
  const onDown = (e: React.PointerEvent) => {
    const el = (e.target as Element).closest<HTMLElement>('.os-wg');
    if (!edit || !el || (e.target as Element).closest('button,a,input,textarea,[contenteditable]')) return;
    e.preventDefault();
    const b = box.current!;
    let sx = e.clientX, sy = e.clientY;
    el.setPointerCapture(e.pointerId); el.classList.add('is-drag');
    el.onpointermove = ev => {
      el.style.translate = `${ev.clientX - sx}px ${ev.clientY - sy}px`;
      const over = document.elementsFromPoint(ev.clientX, ev.clientY).find(n => n.classList?.contains('os-wg') && n !== el);
      if (over) {
        const st = Flip.getState([...b.children].filter(c => c !== el));
        const r0 = el.getBoundingClientRect(), kids = [...b.children];
        b.insertBefore(el, kids.indexOf(over) < kids.indexOf(el) ? over : over.nextSibling);
        const r1 = el.getBoundingClientRect(); sx += r1.left - r0.left; sy += r1.top - r0.top;
        el.style.translate = `${ev.clientX - sx}px ${ev.clientY - sy}px`;
        Flip.from(st, { duration: .3, ease: 'power3.out' });
      }
    };
    el.onpointerup = () => {
      el.onpointermove = el.onpointerup = null; el.classList.remove('is-drag');
      gsap.to(el, { translate: '0px 0px', duration: .3, ease: 'back.out(1.6)', onComplete: () => { el.style.translate = ''; } });
      save([...b.children].map(c => (c as HTMLElement).dataset.w!).filter(Boolean));
    };
  };

  const h = q.data, c = h?.continue;
  const first = me?.name.split(' ')[0] || '';
  const W: Record<string, () => ReactNode> = {
    lanjut: () => c ? (
      <>
        <div className="os-wg-head"><span className="os-eyebrow"><Icon name="graduation-cap" size={14} />Lanjut belajar</span><span className="os-chip more"><LangIcon id={h?.continue?.path ? 'python' : 'python'} size={14} />{c.path.title}</span></div>
        <div className="os-cont">
          <PhaseRing values={c.ring} size={112} stroke={10}><div className="os-cont-n"><b>{c.done}</b>/4</div></PhaseRing>
          <div style={{ minWidth: 0 }}><h3>Bab {c.chapter.number} · {c.chapter.title}</h3><p>{c.phase_label} · sekitar {c.eta} menit lagi</p></div>
        </div>
        <div className="os-ph-pills">{c.phases.map(p => <span key={p.id} className={`os-ph-pill${p.state === 'done' ? ' is-done' : p.id === c.phase ? ' is-now' : ''}`} data-phase={p.id}><Icon name={p.state === 'done' ? 'check' : p.state === 'locked' ? 'lock' : p.icon} size={14} />{p.label}</span>)}</div>
        <div className="os-cont-act"><Link className="btn btn-primary btn-lg" to={c.primary.href}><Icon name="play" />{c.primary.label}</Link><Link className="btn btn-lg" to="/peta"><Icon name="map" />Peta</Link></div>
      </>
    ) : (
      <><div className="os-wg-head"><span className="os-eyebrow"><Icon name="graduation-cap" size={14} />Belajar</span></div>
        <p className="os-empty-s">Semua bab yang terbit sudah selesai. Coba Sandbox atau ulas konsep lama.</p>
        <div className="os-cont-act"><Link className="btn btn-primary" to="/jalur">Semua jalur</Link></div></>
    ),
    streak: () => <><div className="os-wg-head"><span className="os-eyebrow"><Icon name="activity" size={14} />Beruntun</span></div>
      <div className="os-big-n">{h?.streak.days ?? 0}<small>hari</small></div>
      <div className="os-week">{h?.streak.week.map((d, i) => <span key={i}><i className={d.on ? 'on' : d.today ? 'today' : ''} />{d.label[0]}</span>)}</div></>,
    target: () => <><div className="os-wg-head"><span className="os-eyebrow"><Icon name="target" size={14} />Target hari ini</span></div>
      <div className="os-tg"><Ring v={h ? h.goal.minutes / Math.max(1, h.goal.target) : 0} /><p><b className="num">{h?.goal.minutes ?? 0}</b> /{h?.goal.target ?? 20} mnt<br />{h && h.goal.minutes >= h.goal.target ? 'tercapai!' : `${Math.max(0, (h?.goal.target ?? 0) - (h?.goal.minutes ?? 0))} mnt lagi`}</p></div></>,
    teman: () => <TemanWidget />,
    quest: () => h?.quests ? <QuestWidget q={h.quests} /> : null,
    musik: () => <MusikWidget />,
    proyek: () => <ProyekWidget items={projs.data?.items || []} />,
    mentor: () => h?.mentor ? <><div className="os-wg-head"><span className="os-eyebrow"><Icon name="message-circle" size={14} />Pesan mentor</span></div>
      <div className="os-msg"><span className="os-av" style={{ background: 'var(--os-sky)' }}>{h.mentor.mentor.initials}</span><div><Html as="p" html={h.mentor.body} /><small>{h.mentor.mentor.name} · {h.mentor.ago}</small></div></div>
      <Link className="btn btn-sm" to={h.mentor.href}><Icon name="reply" />Balas</Link></>
      : <><div className="os-wg-head"><span className="os-eyebrow"><Icon name="message-circle" size={14} />Pesan mentor</span></div><p className="os-empty-s">Belum ada pesan dari mentor.</p></>,
    kuis: () => <><div className="os-wg-head"><span className="os-eyebrow"><Icon name="zap" size={14} />Kuis harian</span></div>
      <p className="os-kuis-t">{h?.daily_quiz.done_today ? 'Sudah dikerjakan hari ini.' : h?.daily_quiz.available ? `5 soal acak · +${h.daily_quiz.xp} XP` : 'Terbuka setelah kamu belajar satu bab.'}</p>
      {h?.daily_quiz.available && !h.daily_quiz.done_today && <Link className="btn btn-sm btn-primary" to="/kuis-harian"><Icon name="zap" />Mulai</Link>}</>,
    teka: () => <TekaWidget />,
    catatan: () => <NoteWidget />,
    fokus: () => <PomodoroWidget />,
    jam: () => <JamWidget />,
    orvi: () => <OrviWidget />,
  };
  const items = [...(projs.data?.items || [])].slice(0, 4);
  if (sort === 'nama') items.sort((a, b) => a.title.localeCompare(b.title, 'id'));
  const hidden = Object.keys(WIDGETS).filter(k => !order.includes(k));
  return (
    <section className={`os-home${visible ? ' is-covered' : ''}`} aria-label="Beranda" data-ctx="desk" onClick={onDeskClick} onPointerMove={onDeskMove}>
      <div className="os-home-hi">
        <span className="os-date"><Icon name="calendar" size={14} />{todayLabel()}</span>
        <h1>{greeting()}, <em>{first}</em>.</h1>
        {h?.nudge ? <Html as="p" html={h.nudge} /> : <p>Lanjutkan belajar, klaim quest, atau bikin sesuatu yang baru di Sandbox.</p>}
      </div>
      <div className="os-edit-bar" hidden={!edit}>
        <b>Atur widget</b>
        <div className="os-wg-tray" aria-label="Widget yang bisa ditambahkan">
          {hidden.length ? hidden.map(id => <button key={id} className="os-chip os-wg-chip" data-id={id} onClick={() => add(id)}><Icon name={WIDGETS[id].icon} size={14} />{WIDGETS[id].label}</button>)
            : <small>Semua widget sudah terpasang.</small>}
        </div>
        <button className="btn btn-sm" onClick={() => save(DEFAULT)}><Icon name="rotate-ccw" />Susunan awal</button>
        <button className="btn btn-sm btn-primary" onClick={() => setEdit(false)}><Icon name="check" />Selesai</button>
      </div>
      <div ref={box} className={`os-widgets${edit ? ' is-edit' : ''}`} data-tour="widgets" onPointerDown={onDown}>
        {order.map(id => (
          <article key={id} className={`os-wg ${WIDGETS[id].size} os-wg-${id}`} data-w={id} data-ctx="widget" aria-label={WIDGETS[id].label}>
            {q.isLoading && !LIVE.has(id) ? <div className="os-skel" /> : W[id]()}
            {edit && <button className="os-wg-x" aria-label={`Buang widget ${WIDGETS[id].label}`} onClick={() => remove(id)}><Icon name="x" /></button>}
          </article>
        ))}
      </div>
      {!edit && <button className="os-edit-btn" onClick={() => setEdit(true)}><Icon name="layout-grid" size={14} />Atur widget</button>}
      <div ref={icons} className="os-desk-icons" role="list" aria-label="Ikon desktop">
        <button role="listitem" className="os-dicon" onDoubleClick={() => nav('/orvi')} onKeyDown={e => { if (e.key === 'Enter') nav('/orvi'); }} title="Klik dua kali untuk ngobrol dengan Orvi">
          <span className="os-dicon-app is-orvi"><Icon name="orvi-ai" size={20} /></span><span className="os-dicon-name">Orvi AI</span></button>
        {items.map(p => (
          <button key={p.id} role="listitem" className="os-dicon" data-proj={p.id} data-name={p.title} data-ctx="proyek" data-flip-id={`p${p.id}`} onDoubleClick={() => nav(`/sandbox/${p.id}`)}
            onKeyDown={e => { if (e.key === 'Enter' && renaming !== p.id) nav(`/sandbox/${p.id}`); if (e.key === 'F2') setRenaming(p.id); }} title="Klik dua kali untuk membuka, atau seret ke Sandbox/Galeri di dock">
            <span className="os-dicon-file"><LangIcon id={p.kind === 'web' ? 'html' : p.lang} size={30} /></span>
            {renaming === p.id
              ? <input className="os-dicon-rename" defaultValue={p.title} autoFocus maxLength={160} aria-label="Nama proyek" onFocus={e => e.currentTarget.select()}
                  onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}
                  onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') void rename(p.id, e.currentTarget.value); if (e.key === 'Escape') setRenaming(null); }}
                  onBlur={e => void rename(p.id, e.currentTarget.value)} />
              : <span className="os-dicon-name">{p.title}</span>}
          </button>
        ))}
        <button role="listitem" className="os-dicon" onDoubleClick={() => nav('/sandbox')} onKeyDown={e => { if (e.key === 'Enter') nav('/sandbox'); }}><span className="os-dicon-folder" /><span className="os-dicon-name">Proyek saya</span></button>
        <button role="listitem" className="os-dicon" onDoubleClick={() => nav('/galeri')} onKeyDown={e => { if (e.key === 'Enter') nav('/galeri'); }}><span className="os-dicon-app"><Icon name="image" size={20} /></span><span className="os-dicon-name">Galeri</span></button>
      </div>
    </section>
  );
}
