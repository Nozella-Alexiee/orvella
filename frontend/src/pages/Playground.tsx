import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import '../playground/playground.css';
import { api, ApiError } from '../api/client';
import { useApi } from '../api/hooks';
import { Icon } from '../design/Icon';
import { LangIcon } from '../design/LangIcon';
import { Orvi } from '../design/Orvi';
import { toast } from '../design/toast';
import { LoadError, Modal, SaveState, Skel } from '../design/ui';
import { useAutosave, useHeartbeat } from '../lib/hooks';
import { LANG_BY_ID } from '../lib/langs';
import { NotebookView } from '../playground/NotebookView';
import { ProgramView } from '../playground/ProgramView';
import { STACKS } from '../playground/stacks';
import type { LangsInfo, List, ListItem, Notebook } from '../playground/types';

const WebWorkspace = lazy(() => import('../playground/WebWorkspace'));

type NewSpec = { kind: 'notebook' | 'program' | 'web'; lang?: string; template?: string; stack?: string };
const PICK_ORDER = ['python', 'javascript', 'html', 'css', 'c', 'cpp', 'rust', 'java', 'go', 'kotlin', 'php', 'sql'];

function itemIcon(i: Pick<ListItem, 'kind' | 'lang'>, size = 18) {
  if (i.kind === 'web') return <LangIcon id={STACKS[i.lang]?.icons[0] || 'html'} size={size} />;
  return <LangIcon id={i.lang || 'javascript'} size={size} />;
}

/** "Mau bikin apa?": a program in any language, a JavaScript notebook, or a web project. */
function Picker({ info, onPick, busy }: { info?: LangsInfo; onPick: (s: NewSpec) => void; busy: boolean }) {
  const enabled = (id: string) => id === 'html' || id === 'css' || (info?.langs.find(l => l.id === id)?.enabled ?? true);
  return (
    <div>
      <section className="pick-sec">
        <div className="row between"><span className="eyebrow">Program satu berkas</span><span className="t-xs t-faint">12 bahasa · jalan di sandbox</span></div>
        <div className="pick-grid">
          {PICK_ORDER.map(id => {
            const l = LANG_BY_ID[id];
            return (
              <button key={id} className="pick-lang" disabled={busy || !enabled(id)} style={{ ['--lc' as string]: `var(--lang-${id}, var(--lilac))` }}
                onClick={() => onPick({ kind: 'program', lang: id })}>
                <LangIcon id={id} size={32} /><span><b>{l.name}</b><br /><small>{enabled(id) ? l.rt : 'dinonaktifkan'}</small></span>
              </button>
            );
          })}
        </div>
      </section>
      <section className="pick-sec">
        <div className="row between"><span className="eyebrow">Proyek web</span><span className="t-xs t-faint">jalankan server, lihat hasilnya di browser mini</span></div>
        <div className="pick-wide">
          {Object.entries(STACKS).map(([id, s]) => (
            <button key={id} className="pick-lang" disabled={busy || !info?.runner} style={{ ['--lc' as string]: s.color }} onClick={() => onPick({ kind: 'web', stack: id })}>
              <span className="pick-icons">{s.icons.map(ic => <LangIcon key={ic} id={ic} size={28} />)}</span>
              <span><b>{s.name}</b><br /><small>{s.hint}</small></span>
            </button>
          ))}
        </div>
      </section>
      <section className="pick-sec">
        <div className="row between"><span className="eyebrow">Notebook</span><span className="t-xs t-faint">sel-sel JavaScript, jalan di browser</span></div>
        <div className="pick-wide">
          <button className="pick-lang" disabled={busy} onClick={() => onPick({ kind: 'notebook' })}><LangIcon id="javascript" size={28} /><span><b>Notebook kosong</b><br /><small>coret-coret ide</small></span></button>
          <button className="pick-lang" disabled={busy} onClick={() => onPick({ kind: 'notebook', template: 'tebak-angka' })}><Icon name="gamepad-2" /><span><b>Tebak angka</b><br /><small>contoh game kecil</small></span></button>
        </div>
      </section>
    </div>
  );
}

export default function Playground() {
  const { notebookId } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const list = useApi<List>('/api/notebooks');
  const info = useApi<LangsInfo>('/api/langs', { staleTime: 60_000 });
  const nbQ = useApi<Notebook>(notebookId ? `/api/notebooks/${notebookId}` : null, { staleTime: 0 });
  useHeartbeat(nbQ.data?.attached?.id ?? null);
  const [nb, setNb] = useState<Notebook | null>(null);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [save, schedule] = useAutosave<Notebook>(n => api.put(`/api/notebooks/${n.id}`, n.kind === 'notebook' ? { title: n.title, cells: n.cells } : n.kind === 'program' ? { title: n.title, files: n.files } : { title: n.title })
    .then(() => qc.invalidateQueries({ queryKey: ['/api/notebooks'] })), 700);

  const create = async (spec: NewSpec) => {
    if (busy) return;
    setBusy(true);
    try {
      const n = await api.post<Notebook>('/api/notebooks', spec);
      qc.invalidateQueries({ queryKey: ['/api/notebooks'] });
      setPicker(false);
      nav(`/playground/${n.id}`);
    } catch (e) {
      toast({ kind: 'danger', icon: 'circle-alert', title: 'Belum bisa dibuat', body: e instanceof ApiError ? e.message : 'Coba lagi sebentar.' });
    } finally { setBusy(false); }
  };

  const showPicker = !notebookId && (params.get('baru') || (list.data && !list.data.items.length));
  const redirected = useRef(false);
  useEffect(() => { // /playground → open the latest item
    if (notebookId || !list.data || showPicker || redirected.current) return;
    redirected.current = true;
    nav(`/playground/${list.data.items[0].id}`, { replace: true });
  }, [list.data, notebookId, showPicker, nav]);
  useEffect(() => { if (nbQ.data) setNb(nbQ.data); }, [nbQ.data]);

  const update = (next: Notebook) => { setNb(next); schedule(next); };
  const attach = async (chapterId: number | null) => {
    if (!nb) return;
    const r = await api.put<Notebook>(`/api/notebooks/${nb.id}`, chapterId ? { attached_chapter_id: chapterId } : { detach: true });
    setNb({ ...nb, attached: r.attached });
  };
  const remove = async () => {
    if (!nb) return;
    await api.del(`/api/notebooks/${nb.id}`);
    setConfirmDel(false);
    redirected.current = false;
    qc.invalidateQueries({ queryKey: ['/api/notebooks'] });
    nav('/playground', { replace: true });
  };

  if (list.error || nbQ.error) return <main className="page"><LoadError onRetry={() => { list.refetch(); nbQ.refetch(); }} /></main>;

  const wide = nb && nb.kind !== 'notebook' && notebookId;
  const web = !!(nb && nb.kind === 'web' && notebookId && String(nb.id) === notebookId);
  const kindLabel = (k: string) => (k === 'program' ? 'program' : k === 'web' ? 'proyek web' : 'notebook');

  return (
    <main className="page" style={{ maxWidth: wide ? 1440 : 1180 }}>
      <div className={web ? 'pg is-web' : 'pg'}>
        <aside className="nb-list" aria-label="Isi playground">
          <button className="btn btn-sun btn-lg btn-press mb-3" onClick={() => setPicker(true)}><Icon name="plus" />Baru</button>
          {list.data?.items.map(n => (
            <Link key={n.id} className="nb-item" to={`/playground/${n.id}`} aria-current={String(n.id) === notebookId ? 'page' : undefined}>
              {itemIcon(n)}<span className="grow">{n.title}<br /><span className="nb-kind">{kindLabel(n.kind)}</span></span>
            </Link>
          ))}
          <div className="eyebrow mt-6" style={{ padding: '0 12px' }}>Tentang playground</div>
          <p className="t-xs t-faint mt-2" style={{ padding: '0 12px', lineHeight: 1.6 }}>Ngoding bebas tanpa nilai, dalam bahasa apa saja. Semua bantuan Orvi terbuka.</p>
        </aside>

        {showPicker ? (
          <section>
            <div className="pg-hero"><Orvi size="lg" mood="happy" /><h1 className="mt-3">Mau ngoding apa hari ini?</h1>
              <p className="t-muted mt-2">Pilih bahasa, proyek web, atau notebook. Tidak ada nilai, tidak ada yang salah.</p></div>
            <div className="card card-pad mt-6"><Picker info={info.data} onPick={create} busy={busy} /></div>
          </section>
        ) : !nb || String(nb.id) !== notebookId ? (
          <section><Skel h={34} w={260} /><Skel h={48} w="70%" className="mt-4" /><Skel h={360} r={20} className="mt-6" /></section>
        ) : (
          <section style={{ minWidth: 0 }}>
            <div className="row between wrap gap-3">
              <div className="row gap-2" style={{ alignItems: 'center' }}>
                {web && <Link className="btn btn-ghost btn-sm" to="/playground?baru=1" aria-label="Kembali ke playground"><Icon name="arrow-left" />Playground</Link>}
                {itemIcon(nb, 22)}
                <span className="badge">{nb.kind === 'program' ? `${LANG_BY_ID[nb.lang]?.name ?? nb.lang} · satu berkas` : nb.kind === 'web' ? `${STACKS[nb.lang]?.name ?? 'Web'} · proyek web` : 'Notebook JavaScript'}</span>
              </div>
              <div className="row gap-2">
                <SaveState state={save === 'saved' || save === 'idle' ? 'idle' : save} idle="Tersimpan otomatis" />
                <button className="btn btn-ghost btn-icon btn-sm" aria-label="Hapus" title="Hapus" onClick={() => setConfirmDel(true)}><Icon name="trash-2" /></button>
              </div>
            </div>
            <input className="nb-title mt-3" value={nb.title} aria-label="Judul" onChange={e => update({ ...nb, title: e.target.value })} />
            {nb.kind === 'program' ? <ProgramView key={nb.id} nb={nb} update={update} info={info.data} />
              : nb.kind === 'web' ? <Suspense fallback={<Skel h={420} r={20} className="mt-6" />}><WebWorkspace key={nb.id} nb={nb} update={update} /></Suspense>
              : <NotebookView key={nb.id} nb={nb} update={update} attachable={list.data?.attachable ?? []} onAttach={attach} onTemplate={t => create({ kind: 'notebook', template: t })} />}
          </section>
        )}
      </div>

      <Modal open={picker} onClose={() => setPicker(false)} title="Mau bikin apa?" width={760}>
        <Picker info={info.data} onPick={create} busy={busy} />
      </Modal>
      <Modal open={confirmDel} onClose={() => setConfirmDel(false)} title={`Hapus ${nb ? kindLabel(nb.kind) : ''} ini?`} role="alertdialog"
        foot={<><button className="btn btn-ghost" onClick={() => setConfirmDel(false)}>Batal</button><button className="btn btn-no btn-press" onClick={remove}>Hapus</button></>}>
        <p>“{nb?.title}” dan semua isinya akan dihapus permanen.</p>
      </Modal>
    </main>
  );
}

