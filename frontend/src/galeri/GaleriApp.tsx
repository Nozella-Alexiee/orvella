/* Galeri (Orvella OS): proyek Sandbox yang diterbitkan teman sekelas (atau publik).
   /galeri = grid kartu dengan pratinjau hidup · /galeri/:id = detail: bintang, remix, kode, dan replay. */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import { useApi } from '../api/hooks';
import { Icon } from '../design/Icon';
import { LangIcon } from '../design/LangIcon';
import { Orvi } from '../design/Orvi';
import { toast } from '../design/toast';
import { burst, pop, sound } from '../fx';
import '../os/ide.css';
import { useWin, useWinTitle } from '../os/Window';
import { langOfPath } from '../playground/stacks';
import { ReplayPlayer } from '../sandbox/Replay';
import { SandboxEditor } from '../sandbox/SandboxEditor';
import { SrcDocFrame } from '../sandbox/SrcDocFrame';
import { buildStatic } from '../sandbox/web';
import { projectLang, type Project, type ProjectCard, type ReplaySession } from '../sandbox/types';

type Scope = 'class' | 'public' | 'mine';
const hue = (id: number) => `hsl(${(id * 67) % 360} 62% 46%)`;

function Thumb({ p }: { p: ProjectCard }) {
  const doc = useMemo(() => (p.preview ? buildStatic(p.preview) : null), [p.preview]);
  if (doc) return <div className="gl-thumb"><SrcDocFrame title={`Pratinjau ${p.title}`} doc={doc} sandbox="allow-scripts" /></div>;
  return <div className="gl-thumb is-code" style={{ ['--tc' as string]: `var(--lang-${projectLang(p)}, var(--os-violet))` }}><LangIcon id={projectLang(p)} size={46} /><span>{p.kind === 'web' ? `Web · ${p.stack}` : p.lang}</span></div>;
}

function StarButton({ p, onChange }: { p: Pick<ProjectCard, 'id' | 'stars' | 'starred' | 'mine'>; onChange: (s: { stars: number; starred: boolean }) => void }) {
  const [busy, setBusy] = useState(false);
  const toggle = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const el = e.currentTarget;
    setBusy(true);
    try {
      const r = p.starred ? await api.del<{ stars: number; starred: boolean }>(`/api/gallery/${p.id}/star`) : await api.put<{ stars: number; starred: boolean }>(`/api/gallery/${p.id}/star`);
      onChange(r);
      if (r.starred) { sound('pop'); pop(el); burst(el, { count: 8, colors: ['#FFB224', '#FFD27A'] }); }
    } catch (err) { toast({ kind: 'danger', icon: 'star', title: 'Belum bisa', body: err instanceof ApiError ? err.message : 'Coba lagi.' }); }
    finally { setBusy(false); }
  };
  return <button className={`gl-star${p.starred ? ' is-on' : ''}`} aria-pressed={p.starred} aria-label={p.starred ? 'Batal beri bintang' : 'Beri bintang'} disabled={busy} onClick={e => void toggle(e)}>
    <Icon name="star" />{p.stars}</button>;
}

function useRemix() {
  const nav = useNavigate();
  const qc = useQueryClient();
  return async (p: Pick<ProjectCard, 'id' | 'title'>) => {
    try {
      const r = await api.post<Project>(`/api/gallery/${p.id}/remix`);
      sound('whoosh'); void qc.invalidateQueries({ queryKey: ['/api/sandbox'] });
      toast({ kind: 'success', icon: 'git-branch', title: 'Remix siap', body: `Salinan "${p.title}" ada di Sandbox-mu. Ubah sesukamu.` });
      nav(`/sandbox/${r.id}`);
    } catch (e) { toast({ kind: 'danger', icon: 'git-branch', title: 'Belum bisa remix', body: e instanceof ApiError ? e.message : 'Coba lagi.' }); }
  };
}

function GaleriList() {
  const nav = useNavigate();
  const [scope, setScope] = useState<Scope>('class');
  const [sort, setSort] = useState<'new' | 'stars'>('new');
  const q = useApi<{ items: ProjectCard[]; public: boolean; next: number | null }>(`/api/gallery?scope=${scope}&sort=${sort}`);
  const [local, setLocal] = useState<Record<number, { stars: number; starred: boolean }>>({});
  const remix = useRemix();
  useWinTitle('Galeri', scope === 'mine' ? 'terbitanku' : scope === 'public' ? 'semua sekolah' : 'teman sekelas');
  return (
    <div className="gl">
      <header className="gl-head">
        <div><h2>Pamerkan proyekmu, remix proyek teman.</h2><p>Proyek yang diterbitkan dari Sandbox tampil di sini dengan pratinjau hidup.</p></div>
        <div className="gl-filters">
          <div className="os-seg" role="group" aria-label="Siapa">
            <button aria-pressed={scope === 'class'} onClick={() => setScope('class')}><Icon name="users" size={14} />Kelasku</button>
            <button aria-pressed={scope === 'public'} onClick={() => setScope('public')}><Icon name="globe" size={14} />Publik</button>
            <button aria-pressed={scope === 'mine'} onClick={() => setScope('mine')}><Icon name="user" size={14} />Punyaku</button>
          </div>
          <div className="os-seg" role="group" aria-label="Urutan">
            <button aria-pressed={sort === 'new'} onClick={() => setSort('new')}>Terbaru</button>
            <button aria-pressed={sort === 'stars'} onClick={() => setSort('stars')}><Icon name="star" size={14} />Bintang</button>
          </div>
        </div>
      </header>
      {scope === 'public' && q.data && !q.data.public && <p className="gl-note"><Icon name="lock" size={14} />Galeri publik belum dibuka admin sekolah. Untuk sekarang, proyek hanya tampil untuk teman sekelas.</p>}
      {q.isLoading && <div className="gl-grid">{[0, 1, 2, 3].map(i => <div key={i} className="gl-card os-skel" style={{ height: 250 }} />)}</div>}
      {q.data && !q.data.items.length && (
        <div className="gl-empty"><Orvi size={110} mood="happy" force /><div><b>{scope === 'mine' ? 'Kamu belum menerbitkan proyek.' : 'Galeri masih sepi.'}</b>
          <p>Buka proyek di Sandbox, lalu tekan <b>Terbitkan</b>. Atau seret ikon proyek dari desktop ke Galeri di dock.</p>
          <button className="btn btn-primary" onClick={() => nav('/sandbox')}><Icon name="code-xml" />Buka Sandbox</button></div></div>
      )}
      <div className="gl-grid">
        {q.data?.items.map(p0 => {
          const p = { ...p0, ...local[p0.id] };
          return (
            <article key={p.id} className="gl-card" role="button" tabIndex={0} onClick={() => nav(`/galeri/${p.id}`)} onKeyDown={e => { if (e.key === 'Enter') nav(`/galeri/${p.id}`); }}>
              <Thumb p={p} />
              <div className="gl-meta">
                <b>{p.title}</b>
                <span className="gl-owner"><span className="os-av" style={{ background: hue(p.owner.id) }}>{p.owner.initials}</span>{p.owner.name}{p.owner.class ? ` · ${p.owner.class}` : ''}</span>
                <div className="gl-acts">
                  <StarButton p={p} onChange={s => setLocal(l => ({ ...l, [p.id]: s }))} />
                  {!p.mine && <button className="btn btn-sm" onClick={e => { e.stopPropagation(); void remix(p); }}><Icon name="git-branch" />Remix</button>}
                  <small>{p.updated}</small>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function GaleriDetail({ id }: { id: number }) {
  const nav = useNavigate();
  const q = useApi<Project>(`/api/gallery/${id}`);
  const sessions = useApi<{ items: ReplaySession[] }>(q.data?.replay ? `/api/sandbox/${id}/replay` : null);
  const [stars, setStars] = useState<{ stars: number; starred: boolean } | null>(null);
  const [file, setFile] = useState<string | null>(null);
  const [replay, setReplay] = useState<ReplaySession | null>(null);
  const remix = useRemix();
  const p = q.data;
  useWinTitle('Galeri', p?.title || 'memuat…');
  const doc = useMemo(() => (p && p.kind === 'web' && p.stack === 'static' ? buildStatic(p.files) : null), [p]);
  if (q.isLoading) return <div className="os-win-loading"><Icon name="loader-circle" className="spin" /></div>;
  if (!p) return <div className="gl"><p className="gl-note">{q.error?.message || 'Proyek tidak ditemukan.'}</p></div>;
  const paths = Object.keys(p.files).sort();
  const f = file && p.files[file] !== undefined ? file : p.entry || paths.find(x => /index\.html$|server\.js$|app\.py$|main\.py$/.test(x)) || paths[0];
  const st = { ...p, ...stars };
  return (
    <div className="gl gl-detail">
      <button className="btn btn-sm btn-ghost" onClick={() => nav('/galeri')}><Icon name="arrow-left" />Galeri</button>
      <div className="gl-d-grid">
        <section className="gl-d-view">
          {doc ? <SrcDocFrame title={`Pratinjau ${p.title}`} doc={doc} sandbox="allow-scripts allow-modals allow-forms" />
            : <div className="gl-d-code">
                <div className="ide-tabs">{paths.map(x => <span key={x} className="ide-tab" role="tab" aria-selected={x === f} onClick={() => setFile(x)}>{x}</span>)}<span className="fill" /></div>
                <div className="ide-editors"><SandboxEditor path={f} initial={x => p.files[x] ?? ''} readOnly label="Kode" /></div>
              </div>}
          {replay && <ReplayPlayer nid={p.id} session={replay} title={p.title} close={() => setReplay(null)} />}
        </section>
        <aside className="gl-d-info">
          <h2>{p.title}</h2>
          <span className="gl-owner"><span className="os-av" style={{ background: hue(p.owner.id) }}>{p.owner.initials}</span>{p.owner.name}{p.owner.class ? ` · ${p.owner.class}` : ''}</span>
          {p.remix_of && <small className="gl-remix-of"><Icon name="git-branch" size={14} />remix dari <a href={`/galeri/${p.remix_of.id}`} onClick={e => { e.preventDefault(); nav(`/galeri/${p.remix_of!.id}`); }}>{p.remix_of.title}</a> · {p.remix_of.owner.name}</small>}
          {p.description ? <p>{p.description}</p> : <p className="t-faint">Tanpa deskripsi.</p>}
          <div className="gl-acts">
            <StarButton p={st} onChange={setStars} />
            {p.mine ? <button className="btn btn-primary" onClick={() => nav(`/sandbox/${p.id}`)}><Icon name="code-xml" />Buka di Sandbox</button>
              : <button className="btn btn-primary" onClick={() => void remix(p)}><Icon name="git-branch" />Remix ke Sandbox-ku</button>}
          </div>
          {p.replay && (
            <div className="gl-replays"><span className="os-eyebrow"><Icon name="clapperboard" size={14} />Cara dibuat</span>
              {sessions.data?.items.length ? sessions.data.items.slice(0, 4).map(s => (
                <button key={s.session} className="gl-rp" onClick={() => setReplay(s)}><Icon name="circle-play" /><span>Tonton sesi {s.ago}</span><small>{s.events} perubahan</small></button>
              )) : <small className="t-faint">Belum ada rekaman.</small>}
            </div>
          )}
          <div className="gl-files"><span className="os-eyebrow"><Icon name="folder" size={14} />{paths.length} berkas</span>
            {paths.map(x => <button key={x} aria-current={!doc && x === f} onClick={() => setFile(x)} disabled={!!doc}><LangIcon id={langOfPath(x)} size={14} />{x}</button>)}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function GaleriApp() {
  const { id } = useParams();
  const win = useWin();
  return <div className={`gl-root${win ? '' : ' is-page'}`}>{id ? <GaleriDetail id={Number(id)} /> : <GaleriList />}</div>;
}
