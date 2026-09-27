import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import '../admin/studio.css';
import '../playground/playground.css';
import { api, ApiError } from '../api/client';
import { useApi } from '../api/hooks';
import { Icon, iconNames } from '../design/Icon';
import { LangIcon } from '../design/LangIcon';
import { Orvi } from '../design/Orvi';
import { toast } from '../design/toast';
import { cx, EmptyState, LoadError, Modal, Skel } from '../design/ui';
import { burst } from '../fx';
import { LANG_BY_ID, LANGS } from '../lib/langs';

type PathCard = { id: number; slug: string; title: string; description: string; language: string; level: string; visibility: 'draft' | 'class' | 'public';
  class_ids: number[]; owner: string; chapters: number; published: number; learners: number; updated: string };
type Klass = { id: number; name: string; learners: number };
type Overview = { paths: PathCard[]; classes: Klass[]; admin: boolean; langs: string[]; levels: string[] };
type ChapterRow = { id: number; number: number; title: string; subtitle: string; icon: string; status: string; version: number; summary: string; problems: number; updated: string };
type Detail = { path: PathCard; chapters: ChapterRow[]; classes: Klass[]; admin: boolean; others: { id: number; title: string; language: string }[] };

const VIS: Record<string, [string, string, string]> = {
  draft: ['badge', 'pen-line', 'Draf · hanya kamu'], class: ['badge badge-success', 'users', 'Terbit ke kelas'], public: ['badge badge-accent', 'globe', 'Katalog umum'],
};

function NewPathModal({ open, onClose, levels }: { open: boolean; onClose: () => void; levels: string[] }) {
  const nav = useNavigate();
  const [title, setTitle] = useState('');
  const [lang, setLang] = useState('python');
  const [level, setLevel] = useState('Pemula');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (title.trim().length < 2 || busy) return;
    setBusy(true);
    try {
      const p = await api.post<PathCard>('/api/studio/paths', { title, language: lang, level, description: desc });
      toast({ kind: 'success', icon: 'sparkles', title: 'Jalur dibuat', body: 'Tambahkan bab pertama, lalu terbitkan ke kelasmu.' });
      onClose(); nav(`/studio/jalur/${p.id}`);
    } catch (e) { toast({ kind: 'danger', icon: 'circle-alert', title: 'Gagal membuat jalur', body: e instanceof ApiError ? e.message : '' }); }
    finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Jalur belajar baru" width={720}
      foot={<><button className="btn btn-ghost" onClick={onClose}>Batal</button><button className={cx('btn btn-primary btn-press', busy && 'is-loading')} disabled={title.trim().length < 2} onClick={create}>Buat jalur</button></>}>
      <div className="stack gap-4">
        <div className="field"><label className="field-label" htmlFor="np-t">Judul</label><input id="np-t" className="input input-lg" value={title} onChange={e => setTitle(e.target.value)} placeholder="Misalnya: Python untuk Pemula" autoFocus /></div>
        <div className="field"><span className="field-label">Bahasa</span>
          <div className="pick-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' }}>
            {LANGS.map(l => (
              <button key={l.id} className="pick-lang" style={{ ['--lc' as string]: `var(--lang-${l.id}, var(--lilac))`, padding: 10, gap: 6, ...(lang === l.id ? { borderColor: `var(--lang-${l.id}, var(--marigold))`, boxShadow: '0 4px 0 color-mix(in oklab, var(--marigold) 35%, transparent)' } : {}) }}
                aria-pressed={lang === l.id} onClick={() => setLang(l.id)}><LangIcon id={l.id} size={26} /><b style={{ fontSize: 14 }}>{l.name}</b></button>
            ))}
          </div>
        </div>
        <div className="field"><span className="field-label">Level</span><div className="segmented">{levels.map(l => <button key={l} aria-pressed={level === l} onClick={() => setLevel(l)}>{l}</button>)}</div></div>
        <div className="field"><label className="field-label" htmlFor="np-d">Deskripsi singkat</label><textarea id="np-d" className="textarea" rows={2} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Apa yang akan dipelajari siswa di jalur ini?" /></div>
      </div>
    </Modal>
  );
}

/** Studio Materi · daftar jalur milik mentor (admin: semua). */
export function StudioHome() {
  const q = useApi<Overview>('/api/studio/overview', { staleTime: 0 });
  const [creating, setCreating] = useState(false);
  if (q.error) return <main className="page"><LoadError onRetry={() => q.refetch()} /></main>;
  return (
    <main className="page page-wide">
      <div className="st-hero">
        <div><div className="eyebrow">Studio Materi</div><h1 className="big-serif mt-2" style={{ fontSize: 44 }}>Bikin materi, <em>bahasa apa saja</em>.</h1>
          <p className="t-muted mt-2" style={{ maxWidth: 620 }}>Susun jalur belajar dari teks, video YouTube berjeda, kode yang bisa dijalankan, animasi memori, soal cepat, sampai challenge dengan robot penguji. Terbitkan langsung ke kelasmu.</p></div>
        <div className="row gap-2" style={{ alignItems: 'center' }}><Orvi size="md" mood="happy" /><button className="btn btn-sun btn-lg btn-press" onClick={() => setCreating(true)}><Icon name="plus" />Jalur baru</button></div>
      </div>
      {!q.data ? <div className="st-grid">{[0, 1, 2].map(i => <Skel key={i} h={190} r={22} />)}</div> : (
        <div className="st-grid">
          {q.data.paths.map(p => {
            const [cls, ic, label] = VIS[p.visibility];
            return (
              <Link key={p.id} to={`/studio/jalur/${p.id}`} className="st-card" style={{ ['--lc' as string]: `var(--lang-${p.language}, var(--lilac))` }}>
                <div className="row between"><LangIcon id={p.language} size={36} /><span className={cls}><Icon name={ic} />{label}</span></div>
                <h3>{p.title}</h3>
                <p className="t-sm t-muted" style={{ margin: 0 }}>{p.description || `${LANG_BY_ID[p.language]?.name} · ${p.level}`}</p>
                <div className="st-meta"><span><Icon name="book-open" size={14} /> {p.published}/{p.chapters} bab terbit</span><span><Icon name="users" size={14} /> {p.learners} siswa</span><span>{p.level}</span><span>diubah {p.updated}</span></div>
              </Link>
            );
          })}
          <button className="st-card st-new" onClick={() => setCreating(true)}><Icon name="plus" /><b>Jalur baru</b><span className="t-xs">Python, C++, Rust, Web, dan lainnya</span></button>
        </div>
      )}
      {q.data && !q.data.paths.length && <p className="t-sm t-faint mt-4">Belum ada jalur. Mulai dari satu bab pendek: satu video, dua soal, satu challenge.</p>}
      <NewPathModal open={creating} onClose={() => { setCreating(false); q.refetch(); }} levels={q.data?.levels || ['Pemula', 'Menengah', 'Mahir']} />
    </main>
  );
}

/** Studio · satu jalur: pengaturan, terbitkan ke kelas, dan daftar bab (urutan bisa diseret). */
export function StudioPath() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useApi<Detail>(`/api/studio/paths/${id}`, { staleTime: 0 });
  const [order, setOrder] = useState<ChapterRow[]>([]);
  const [drag, setDrag] = useState<number | null>(null);
  const [newCh, setNewCh] = useState(false);
  const [chTitle, setChTitle] = useState('');
  const [chIcon, setChIcon] = useState('box');
  const [copyOf, setCopyOf] = useState<ChapterRow | null>(null);
  const [meta, setMeta] = useState<{ title: string; description: string; level: string } | null>(null);
  const [classes, setClasses] = useState<number[]>([]);
  const pubBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!q.data) return;
    setOrder(q.data.chapters);
    setMeta({ title: q.data.path.title, description: q.data.path.description, level: q.data.path.level });
    setClasses(q.data.path.class_ids);
  }, [q.data]);

  const patch = async (body: object, okMsg?: string) => {
    try {
      await api.patch(`/api/studio/paths/${id}`, body);
      if (okMsg) toast({ kind: 'success', icon: 'check', title: okMsg });
      q.refetch(); qc.invalidateQueries({ queryKey: ['/api/studio/overview'] });
    } catch (e) { toast({ kind: 'danger', icon: 'circle-alert', title: 'Belum bisa disimpan', body: e instanceof ApiError ? e.message : '' }); }
  };
  const drop = async (to: number) => {
    if (drag === null || drag === to) { setDrag(null); return; }
    const next = [...order];
    const [m] = next.splice(drag, 1);
    next.splice(to, 0, m);
    setOrder(next.map((c, i) => ({ ...c, number: i + 1 })));
    setDrag(null);
    try { await api.post(`/api/studio/paths/${id}/order`, { ids: next.map(c => c.id) }); } catch { q.refetch(); }
  };
  const addChapter = async () => {
    if (!chTitle.trim()) return;
    const r = await api.post<{ id: number }>(`/api/studio/paths/${id}/chapters`, { title: chTitle, icon: chIcon });
    setNewCh(false); setChTitle('');
    nav(`/studio/bab/${r.id}`);
  };
  const copyTo = async (pathId: number) => {
    if (!copyOf) return;
    try {
      const r = await api.post<{ id: number }>(`/api/studio/chapters/${copyOf.id}/copy`, { path_id: pathId });
      toast({ kind: 'success', icon: 'copy', title: 'Bab disalin', body: 'Sesuaikan kode dan contoh untuk bahasa tujuan, lalu terbitkan.' });
      setCopyOf(null); nav(`/studio/bab/${r.id}`);
    } catch (e) { toast({ kind: 'danger', icon: 'circle-alert', title: 'Gagal menyalin', body: e instanceof ApiError ? e.message : '' }); }
  };
  const remove = async (c: ChapterRow) => {
    if (!confirm(`Hapus “${c.title}”?`)) return;
    try { await api.del(`/api/studio/chapters/${c.id}`); q.refetch(); }
    catch (e) { toast({ kind: 'danger', icon: 'circle-alert', title: 'Tidak bisa dihapus', body: e instanceof ApiError ? e.message : '' }); }
  };

  if (q.error) return <main className="page"><LoadError onRetry={() => q.refetch()} message={q.error instanceof ApiError ? q.error.message : undefined} /></main>;
  if (!q.data || !meta) return <main className="page page-wide"><Skel h={44} w={420} /><Skel h={320} r={20} className="mt-6" /></main>;
  const d = q.data, p = d.path;
  const published = order.filter(c => c.version).length;
  const [vcls, vic, vlabel] = VIS[p.visibility];
  return (
    <main className="page page-wide">
      <Link to="/studio" className="btn btn-ghost btn-sm"><Icon name="arrow-left" />Studio</Link>
      <div className="st-hero mt-2">
        <div className="row gap-3" style={{ alignItems: 'center' }}>
          <LangIcon id={p.language} size={52} />
          <div><div className="eyebrow">{LANG_BY_ID[p.language]?.name} · {p.level} · <span className={vcls} style={{ verticalAlign: 1 }}><Icon name={vic} />{vlabel}</span></div>
            <input className="nb-title" style={{ fontSize: 38 }} value={meta.title} onChange={e => setMeta({ ...meta, title: e.target.value })} onBlur={() => meta.title !== p.title && patch({ title: meta.title })} aria-label="Judul jalur" /></div>
        </div>
        <button className="btn btn-sun btn-lg btn-press" onClick={() => setNewCh(true)}><Icon name="plus" />Bab baru</button>
      </div>

      <div className="st-layout">
        <section>
          {!order.length ? (
            <div className="card"><EmptyState icon="book-open" title="Belum ada bab" action={<button className="btn btn-primary btn-press" onClick={() => setNewCh(true)}><Icon name="plus" />Bab pertama</button>}>
              Satu bab = 4 fase: Pahami (materi), Perkuat (latihan), Kuis, dan Uji (challenge/ulangan).</EmptyState></div>
          ) : order.map((c, i) => (
            <div key={c.id} className={cx('st-ch', drag === i && 'is-drag')} draggable onDragStart={() => setDrag(i)} onDragOver={e => e.preventDefault()} onDrop={() => drop(i)}>
              <span className="grip" title="Seret untuk mengubah urutan"><Icon name="grip-vertical" /></span>
              <span className="num">{i + 1}</span>
              <div style={{ minWidth: 0 }}>
                <Link to={`/studio/bab/${c.id}`} className="t-h4" style={{ display: 'block' }}>{c.title}</Link>
                <div className="t-xs t-muted mt-1">{c.summary} · diubah {c.updated}
                  {c.problems > 0 && <span className="t-danger"> · {c.problems} hal belum lengkap</span>}</div>
              </div>
              <div className="row gap-1" style={{ alignItems: 'center' }}>
                {c.version ? <span className="badge badge-success">v{c.version}</span> : <span className="badge">draf</span>}
                <Link className="btn btn-secondary btn-sm btn-press" to={`/studio/bab/${c.id}`}><Icon name="pencil" />Ubah</Link>
                <button className="btn btn-ghost btn-icon btn-sm" title="Salin ke jalur lain" aria-label="Salin ke jalur lain" onClick={() => setCopyOf(c)}><Icon name="copy" /></button>
                {!c.version && <button className="btn btn-ghost btn-icon btn-sm" title="Hapus" aria-label="Hapus" onClick={() => remove(c)}><Icon name="trash-2" /></button>}
              </div>
            </div>
          ))}
        </section>

        <aside className="stack gap-4">
          <div className="card card-pad">
            <span className="eyebrow">Terbitkan</span>
            <p className="t-sm t-muted mt-2">{published ? `${published} bab sudah terbit.` : 'Terbitkan minimal satu bab dulu (tombol Terbitkan di editor bab).'} Pilih kelas yang boleh melihat jalur ini.</p>
            <div className="st-cls mt-3">
              {d.classes.map(k => <button key={k.id} className="chip" aria-pressed={classes.includes(k.id)} onClick={() => setClasses(c => (c.includes(k.id) ? c.filter(x => x !== k.id) : [...c, k.id]))}>{k.name} · {k.learners}</button>)}
              {!d.classes.length && <span className="t-xs t-faint">Kamu belum punya kelas.</span>}
            </div>
            <div className="stack gap-2 mt-4">
              <button ref={pubBtn} className="btn btn-ok btn-press" disabled={!classes.length}
                onClick={async () => { await patch({ visibility: 'class', class_ids: classes }, 'Jalur terbit ke kelas'); burst(pubBtn.current); }}><Icon name="send" />Terbitkan ke kelas</button>
              {d.admin && <button className="btn btn-secondary btn-press" onClick={() => patch({ visibility: 'public' }, 'Jalur masuk katalog umum')}><Icon name="globe" />Masukkan ke katalog umum</button>}
              {p.visibility !== 'draft' && <button className="btn btn-ghost btn-sm" onClick={() => patch({ visibility: 'draft' }, 'Jalur kembali jadi draf')}>Tarik kembali jadi draf</button>}
            </div>
          </div>
          <div className="card card-pad stack gap-3">
            <span className="eyebrow">Info jalur</span>
            <textarea className="textarea" rows={3} value={meta.description} placeholder="Deskripsi untuk katalog" onChange={e => setMeta({ ...meta, description: e.target.value })} onBlur={() => meta.description !== p.description && patch({ description: meta.description })} />
            <div className="segmented">{['Pemula', 'Menengah', 'Mahir'].map(l => <button key={l} aria-pressed={meta.level === l} onClick={() => { setMeta({ ...meta, level: l }); patch({ level: l }); }}>{l}</button>)}</div>
            <div className="t-xs t-faint">{p.learners} siswa sudah membuka jalur ini · pemilik {p.owner}</div>
          </div>
        </aside>
      </div>

      <Modal open={newCh} onClose={() => setNewCh(false)} title="Bab baru"
        foot={<><button className="btn btn-ghost" onClick={() => setNewCh(false)}>Batal</button><button className="btn btn-primary btn-press" disabled={!chTitle.trim()} onClick={addChapter}>Buat &amp; buka editor</button></>}>
        <div className="stack gap-4">
          <div className="field"><label className="field-label" htmlFor="nc-t">Judul bab</label><input id="nc-t" className="input input-lg" autoFocus value={chTitle} onChange={e => setChTitle(e.target.value)} placeholder="Misalnya: Variabel dan Tipe Data" onKeyDown={e => e.key === 'Enter' && addChapter()} /></div>
          <div className="field"><label className="field-label" htmlFor="nc-i">Ikon di peta</label><select id="nc-i" className="select" value={chIcon} onChange={e => setChIcon(e.target.value)}>{iconNames.map(n => <option key={n}>{n}</option>)}</select></div>
        </div>
      </Modal>
      <Modal open={!!copyOf} onClose={() => setCopyOf(null)} title={`Salin “${copyOf?.title}” ke…`}>
        <div className="stack gap-2">
          {d.others.map(o => <button key={o.id} className="btn btn-secondary" style={{ justifyContent: 'flex-start' }} onClick={() => copyTo(o.id)}><LangIcon id={o.language} size={20} />{o.title}</button>)}
          {!d.others.length && <p className="t-sm t-muted">Buat dulu jalur lain (misalnya versi C++ atau Rust), lalu salin bab ini ke sana.</p>}
        </div>
      </Modal>
    </main>
  );
}
