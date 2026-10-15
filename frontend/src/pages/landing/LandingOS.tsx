/* Landing publik bergaya Orvella OS: wallpaper hidup, section sebagai jendela kaca, dan dock
   sebagai navigasi. Pengguna yang sudah masuk langsung diarahkan ke desktopnya. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router';
import { useMe } from '../../api/hooks';
import { homeFor, Boot } from '../../app/common';
import { Icon } from '../../design/Icon';
import { LangChip, LangIcon } from '../../design/LangIcon';
import { Orvi, type OrviHandle } from '../../design/Orvi';
import { PhaseRing } from '../../design/PhaseRing';
import { motion, sound } from '../../fx';
import { GoogleButton, PublicShell } from '../public/Public';

const SECTIONS = [
  { id: 'atas', label: 'Beranda', icon: 'house', color: 'var(--os-sun)' },
  { id: 'coba', label: 'Coba sekarang', icon: 'sparkles', color: 'var(--os-violet)' },
  { id: 'fase', label: '4 fase', icon: 'target', color: 'var(--os-sky)' },
  { id: 'bahasa', label: '12 bahasa', icon: 'code-xml', color: 'var(--os-mint)' },
  { id: 'bareng', label: 'Belajar bareng', icon: 'users', color: 'var(--os-coral)' },
  { id: 'sekolah', label: 'Mentor & sekolah', icon: 'school', color: 'var(--os-slate)' },
] as const;
const LANGS = ['python', 'javascript', 'html', 'css', 'c', 'cpp', 'rust', 'java', 'go', 'sql', 'kotlin', 'php'];

function Win({ id, icon, color, title, sub, children, className = '' }: { id?: string; icon: string; color: string; title: string; sub?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`pub-win ${className}`} style={{ ['--app' as string]: color }} aria-labelledby={id ? `${id}-t` : undefined}>
      <div className="os-win-bar pub-win-bar"><span className="os-win-glyph"><Icon name={icon} /></span>
        <div className="os-win-title"><b id={id ? `${id}-t` : undefined}>{title}</b>{sub && <span>{sub}</span>}</div>
        <span className="pub-ctl" aria-hidden="true"><i /><i /><i /></span></div>
      <div className="pub-win-body">{children}</div>
    </section>
  );
}

/* ---- Coba sekarang: satu konsep, tiga cara komputer melihatnya ---- */
type Cell = { name: string; value: string; note?: string; fresh?: boolean };
type Step = { line: number; cells: Cell[]; objs?: { v: string; names: string[]; fresh?: boolean }[]; out?: string; say: string };
const DEMO: Record<'python' | 'cpp' | 'rust', { label: string; lines: string[]; steps: Step[] }> = {
  python: { label: 'Python', lines: ['x = 4', 'y = x', 'x = x * 2', 'print(x, y)'], steps: [
    { line: 0, cells: [], objs: [{ v: '4', names: ['x'], fresh: true }], say: 'Python membuat objek 4, lalu menempelkan nama x padanya.' },
    { line: 1, cells: [], objs: [{ v: '4', names: ['x', 'y'] }], say: 'y = x tidak menyalin apa pun: y ikut menunjuk objek yang sama.' },
    { line: 2, cells: [], objs: [{ v: '4', names: ['y'] }, { v: '8', names: ['x'], fresh: true }], say: 'x * 2 menghasilkan objek baru 8. Nama x pindah ke sana, y tetap di 4.' },
    { line: 3, cells: [], objs: [{ v: '4', names: ['y'] }, { v: '8', names: ['x'] }], out: '8 4', say: 'Keluarannya 8 4.' },
  ] },
  cpp: { label: 'C++', lines: ['int x = 4;', 'int y = x;', 'x = x * 2;', 'cout << x << " " << y;'], steps: [
    { line: 0, cells: [{ name: 'x', value: '4', note: 'int · 4 byte', fresh: true }], say: 'Di C++, variabel adalah kotak memori. Kotak x berisi 4.' },
    { line: 1, cells: [{ name: 'x', value: '4', note: 'int' }, { name: 'y', value: '4', note: 'salinan', fresh: true }], say: 'y = x menyalin nilainya ke kotak baru bernama y.' },
    { line: 2, cells: [{ name: 'x', value: '8', note: 'ditimpa', fresh: true }, { name: 'y', value: '4', note: 'int' }], say: 'Isi kotak x ditimpa jadi 8. Kotak y tidak ikut berubah.' },
    { line: 3, cells: [{ name: 'x', value: '8' }, { name: 'y', value: '4' }], out: '8 4', say: 'Keluarannya 8 4, sama seperti Python, tapi caranya berbeda.' },
  ] },
  rust: { label: 'Rust', lines: ['let mut x = 4;', 'let y = x;', 'x = x * 2;', 'println!("{} {}", x, y);'], steps: [
    { line: 0, cells: [{ name: 'x', value: '4', note: 'i32 · mut', fresh: true }], say: 'let mut membuat x yang boleh diubah. Tanpa mut, baris ke-3 akan ditolak kompiler.' },
    { line: 1, cells: [{ name: 'x', value: '4', note: 'i32 · mut' }, { name: 'y', value: '4', note: 'Copy', fresh: true }], say: 'i32 bersifat Copy, jadi y mendapat salinan. Untuk String, nilainya berpindah (move)!' },
    { line: 2, cells: [{ name: 'x', value: '8', note: 'ditimpa', fresh: true }, { name: 'y', value: '4', note: 'i32' }], say: 'x diubah jadi 8. y tetap 4 karena punya salinannya sendiri.' },
    { line: 3, cells: [{ name: 'x', value: '8' }, { name: 'y', value: '4' }], out: '8 4', say: 'Keluarannya 8 4. Aturan kepemilikan Rust menjaga memorimu tetap aman.' },
  ] },
};

function MemoryDemo() {
  const [lang, setLang] = useState<keyof typeof DEMO>('python');
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const d = DEMO[lang], s = d.steps[i];
  useEffect(() => { setI(0); setPlaying(false); }, [lang]);
  useEffect(() => {
    if (!playing) return;
    if (i >= d.steps.length - 1) { setPlaying(false); return; }
    const t = setTimeout(() => { setI(x => x + 1); sound('tick'); }, motion() === 'off' ? 300 : 1400);
    return () => clearTimeout(t);
  }, [playing, i, d.steps.length]);
  return (
    <div className="pub-demo">
      <div className="os-seg" role="tablist" aria-label="Bahasa">
        {(Object.keys(DEMO) as (keyof typeof DEMO)[]).map(k => <button key={k} role="tab" aria-selected={lang === k} aria-pressed={lang === k} onClick={() => setLang(k)}><LangIcon id={k} size={16} />{DEMO[k].label}</button>)}
      </div>
      <div className="pub-demo-grid">
        <div className="pub-demo-code cm-host">
          {d.lines.map((l, n) => <div key={n} className={`pub-demo-line${n === s.line ? ' is-now' : ''}${n < s.line ? ' is-done' : ''}`}><span className="n">{n + 1}</span><code>{l}</code></div>)}
          {s.out && <div className="pub-demo-out"><span>keluaran</span><b>{s.out}</b></div>}
        </div>
        <div className="pub-demo-mem" aria-live="polite">
          <span className="os-eyebrow">Memori</span>
          {s.objs ? (
            <div className="pub-objs">{s.objs.map(o => (
              <div key={o.v} className={`pub-obj${o.fresh ? ' is-fresh' : ''}`}><span className="tags">{o.names.map(nm => <i key={nm}>{nm}</i>)}</span><b>{o.v}</b><small>objek int</small></div>
            ))}</div>
          ) : (
            <div className="pub-cells">{s.cells.map(c => (
              <div key={c.name} className={`pub-cell${c.fresh ? ' is-fresh' : ''}`}><span>{c.name}</span><b>{c.value}</b>{c.note && <small>{c.note}</small>}</div>
            ))}</div>
          )}
          <p className="pub-demo-say"><Orvi size={40} mood={i === d.steps.length - 1 ? 'happy' : 'think'} force />{s.say}</p>
        </div>
      </div>
      <div className="pub-demo-ctl">
        <button className="btn btn-sm" aria-label="Langkah sebelumnya" disabled={i === 0} onClick={() => setI(x => x - 1)}><Icon name="arrow-left" /></button>
        <button className="btn btn-sm btn-primary" onClick={() => { if (i >= d.steps.length - 1) setI(0); setPlaying(p => !p); }}><Icon name={playing ? 'pause' : 'play'} />{playing ? 'Jeda' : i >= d.steps.length - 1 ? 'Ulangi' : 'Jalankan baris per baris'}</button>
        <button className="btn btn-sm" aria-label="Langkah berikutnya" disabled={i >= d.steps.length - 1} onClick={() => { setI(x => x + 1); sound('tick'); }}><Icon name="arrow-right" /></button>
        <span className="pub-demo-step">Langkah {i + 1} dari {d.steps.length}</span>
      </div>
    </div>
  );
}

/* ---- Kenalan sama Orvi: klik mood ---- */
const MOODS: [string, 'happy' | 'think' | 'oops' | 'cheer' | 'sleep', string][] = [
  ['Senang', 'happy', 'Bener! Gas soal berikutnya?'], ['Mikir', 'think', 'Hmm, coba lihat baris 3. Nilai x berubah di situ.'],
  ['Kaget', 'oops', 'Belum pas. Sini aku tunjukin barisnya.'], ['Pesta', 'cheer', 'Bab kelar! Keempat busur cincinnya nyala.'], ['Tidur', 'sleep', 'Zzz… Aku ketiduran kalau kamu lama gak ngetik.'],
];
function MeetOrvi() {
  const o = useRef<OrviHandle>(null);
  const [mood, setMood] = useState<(typeof MOODS)[number][1]>('happy');
  return (
    <div className="pub-orvi">
      <div className="pub-orvi-stage"><Orvi ref={o} size={190} mood={mood} force follow /></div>
      <div>
        <p className="pub-lead">Orvi itu bola cahaya kecil yang nemenin kamu ngoding. Bulan mungil yang muter di sekelilingnya namanya <b>Pip</b>. Dia yang nunjuk bagian penting dan bawa nilai ke kotak variabel.</p>
        <p className="pub-lead">Orvi gak bakal ngatain kamu. Kalau jawabanmu belum pas, dia tunjukin barisnya dan kasih petunjuk secukupnya.</p>
        <div className="pub-moods">{MOODS.map(([label, m, line]) => (
          <button key={m} className="os-chip" aria-pressed={mood === m} onClick={() => { setMood(m); sound('pop'); o.current?.say(line, { side: 'right', ms: 2600 }); }}>{label}</button>
        ))}</div>
      </div>
    </div>
  );
}

/* ---- hero: jendela Sandbox mini yang "diketik" ---- */
const HERO_CODE = ['<main class="kartu">', '  <h1>Nadia</h1>', '  <p>Suka Python</p>', '  <button>Suka ♥</button>', '</main>'];
function HeroWindow() {
  const [n, setN] = useState(motion() === 'off' ? HERO_CODE.length : 0);
  useEffect(() => {
    if (n >= HERO_CODE.length) return;
    const t = setTimeout(() => setN(x => x + 1), n === 0 ? 700 : 520);
    return () => clearTimeout(t);
  }, [n]);
  return (
    <div className="pub-hero-art" aria-hidden="true">
      <div className="pub-mini" style={{ ['--app' as string]: 'var(--os-mint)' }}>
        <div className="os-win-bar"><span className="os-win-glyph"><Icon name="code-xml" /></span><div className="os-win-title"><b>Sandbox</b><span>kartu-profil / index.html</span></div>
          <span className="pub-mini-run"><Icon name="play" />Jalankan</span></div>
        <div className="pub-mini-body">
          <div className="pub-mini-code cm-host">{HERO_CODE.slice(0, n).map((l, i) => <div key={i}><span className="n">{i + 1}</span><code>{l}</code></div>)}<span className="pub-caret" /></div>
          <div className="pub-mini-prev">
            <div className={`pub-mini-card${n >= 2 ? ' is-on' : ''}`}><span className="av">N</span>{n >= 2 && <b>Nadia</b>}{n >= 3 && <small>Suka Python</small>}{n >= 4 && <i>Suka ♥</i>}</div>
          </div>
        </div>
      </div>
      <div className="pub-hero-orvi"><Orvi size={150} mood={n >= HERO_CODE.length ? 'cheer' : 'happy'} force /></div>
    </div>
  );
}

export default function LandingOS() {
  const { data: me, isLoading } = useMe();
  const [cur, setCur] = useState('atas');
  useEffect(() => { document.title = 'Orvella · Learn. Build. Collaborate.'; }, []);
  useEffect(() => {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) setCur(e.target.id); }), { rootMargin: '-45% 0px -50% 0px' });
    SECTIONS.forEach(s => { const el = document.getElementById(s.id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [isLoading]);
  if (isLoading) return <Boot />;
  if (me) return <Navigate to={homeFor(me.role)} replace />;
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: motion() === 'off' ? 'auto' : 'smooth', block: 'start' });
  const links = <>{SECTIONS.slice(1).map(s => <button key={s.id} className="os-mb-item os-mb-menu" onClick={() => go(s.id)}>{s.label}</button>)}</>;

  return (
    <PublicShell nav={links} className="pub-landing">
      <main className="pub-main">
        <section id="atas" className="pub-hero">
          <div className="pub-hero-copy">
            <span className="pub-chip"><Icon name="sparkles" size={14} />12 bahasa · penjelasan berbahasa Indonesia</span>
            <h1>Learn. Build. <em>Collaborate.</em></h1>
            <p>Stop hafalan sintaks. Di Orvella kamu jalanin kodenya baris per baris, lihat isi memorinya gerak, latihan sampai lancar, lalu diuji pakai kode beneran. Semuanya di desktop belajarmu sendiri.</p>
            <div className="pub-hero-cta">
              <Link className="btn btn-lg pub-primary" to="/daftar">Mulai belajar gratis<Icon name="arrow-right" /></Link>
              <GoogleButton label="Masuk dengan Google" />
            </div>
            <small>Sudah punya akun? <Link to="/masuk">Masuk</Link> · Gratis untuk Bab 1–3</small>
          </div>
          <HeroWindow />
        </section>

        <Win id="coba" icon="sparkles" color="var(--os-violet)" title="Coba sekarang" sub="tanpa daftar">
          <h2>Variabelnya sama, isi memorinya beda.</h2>
          <p className="pub-lead">Di layar kelihatannya mirip, tapi tiap bahasa nyimpen variabel dengan caranya sendiri. Jalanin baris per baris, lihat memorinya gerak.</p>
          <MemoryDemo />
        </Win>

        <Win id="fase" icon="target" color="var(--os-sky)" title="Cara belajar" sub="di tiap bab">
          <div className="pub-fase">
            <PhaseRing values={[1, 1, .6, 0]} size={220} stroke={18}><Orvi size={100} mood="focus" force /></PhaseRing>
            <div>
              <h2>4 fase tiap bab. Gak ada yang dilompatin.</h2>
              <div className="pub-phases">
                {([['pahami', '1', 'Pahami', 'Konsepnya dijelasin lewat animasi yang bisa kamu mainin: geser angka, seret nilai, jalanin kode baris per baris.'],
                  ['perkuat', '2', 'Perkuat', 'Latihan pendek yang nyesuaiin sama kamu. Salah? Orvi kasih petunjuk pelan-pelan, terus soal yang mirip.'],
                  ['kuis', '3', 'Kuis', '10 soal berwaktu. Dapet 70% buat buka Uji. Belum lolos? Ulang aja, soalnya baru.'],
                  ['uji', '4', 'Uji', 'Tantangan kode beneran, dicek robot penguji. Mentor juga bisa kasih ulangan berwaktu.']] as const).map(([ph, n, t, d]) => (
                  <div key={ph} className="pub-phase" data-phase={ph}><span className="no">{n}</span><div><b>{t}</b><p>{d}</p></div></div>
                ))}
              </div>
            </div>
          </div>
        </Win>

        <Win id="bahasa" icon="code-xml" color="var(--os-mint)" title="Sandbox" sub="12 bahasa · jalan beneran">
          <h2>Satu editor, 12 bahasa, semuanya jalan beneran.</h2>
          <p className="pub-lead">Kodemu dijalanin di server yang terisolasi: tanpa internet, ada batas waktu dan memori. Error ditandai di barisnya, terus Orvi bantu jelasin. Proyek web plus database juga bisa langsung kamu jalanin dan lihat hasilnya.</p>
          <div className="pub-langs">{LANGS.map(l => <LangChip key={l} id={l} />)}</div>
          <div className="pub-pipe"><span><Icon name="hammer" />Kompilasi</span><Icon name="arrow-right" /><span><Icon name="play" />Jalankan</span><Icon name="arrow-right" /><span><Icon name="shield-check" />batas 2 detik · 256 MB · tanpa jaringan</span></div>
          <div className="pub-feats">
            {([['history', 'Mesin waktu', 'Simpan snapshot, balik ke versi mana aja.'], ['clapperboard', 'Replay', 'Putar ulang proses ngodingnya, huruf demi huruf.'],
              ['database', 'Database sendiri', 'SQLite atau MySQL per proyek. Unduh dan impor sebagai .sql.'], ['image', 'Galeri', 'Pamerin proyekmu, kasih bintang, remix punya temen.']] as const).map(([ic, t, d]) => (
              <div key={t} className="pub-feat"><Icon name={ic} /><b>{t}</b><p>{d}</p></div>
            ))}
          </div>
        </Win>

        <Win id="bareng" icon="users" color="var(--os-coral)" title="Belajar bareng" sub="teman sekelas">
          <h2>Lebih seru bareng temen sekelas.</h2>
          <div className="pub-together">
            {([['users', 'var(--os-mint)', 'Ngoding bareng', 'Kursor dan ketikan temen muncul langsung di editormu. Mentor bisa ikut nonton dan kasih komentar.'],
              ['swords', 'var(--os-coral)', 'Duel 1 lawan 1', '5 soal, 5 menit. Adu cepet sama temen sekelas, progres lawan kelihatan live.'],
              ['presentation', 'var(--os-sky)', 'Kuis langsung', 'Mentor nayangin kuis di proyektor, kamu jawab dari HP pakai kode gabung.'],
              ['hand', 'var(--os-sun)', 'Angkat tangan', 'Mentok? Angkat tangan, mentor langsung lihat kodemu di layarnya.']] as const).map(([ic, c, t, d]) => (
              <div key={t} className="pub-tg" style={{ ['--c' as string]: c }}><span className="ic"><Icon name={ic} /></span><b>{t}</b><p>{d}</p></div>
            ))}
          </div>
        </Win>

        <Win icon="sparkles" color="var(--os-sun)" title="Kenalan sama Orvi" sub="teman belajarmu">
          <MeetOrvi />
        </Win>

        <Win id="sekolah" icon="school" color="var(--os-slate)" title="Untuk mentor & sekolah">
          <h2>Satu tempat untuk siswa, mentor, dan sekolah.</h2>
          <div className="pub-cols">
            {([['graduation-cap', 'Siswa', ['Jalur belajar per bahasa, dari nol', 'Empat fase di tiap bab', 'Sandbox bebas untuk 12 bahasa', 'Proyek dengan review mentor']],
              ['presentation', 'Mentor', ['Studio Materi berbasis blok, tanpa menulis JSON', 'Bank soal dengan statistik jawaban', 'Review kode per baris, lengkap dengan replay', 'Sinyal siswa yang butuh bantuan']],
              ['building-2', 'Sekolah', ['Akun dan kelas dalam satu panel', 'Pilih bahasa yang aktif dan batas eksekusinya', 'Laporan kemajuan per kelas', 'Bisa dipasang di server sekolah dengan Docker']]] as const).map(([ic, t, items]) => (
              <div key={t} className="pub-col"><span className="ic"><Icon name={ic} /></span><b>{t}</b><ul>{items.map(x => <li key={x}><Icon name="check" size={14} />{x}</li>)}</ul></div>
            ))}
          </div>
        </Win>

        <section className="pub-cta">
          <Orvi size={120} mood="cheer" force />
          <div><h2>Orbit pertamamu mulai hari ini.</h2><p>Pilih bahasa, kenalan sama konsep pertamanya, terus jalanin program pertamamu dalam 10 menit.</p></div>
          <div className="pub-cta-btns"><Link className="btn btn-lg pub-primary" to="/daftar">Mulai gratis<Icon name="arrow-right" /></Link><GoogleButton label="Lanjut dengan Google" /></div>
        </section>

        <footer className="pub-foot">
          <span className="pub-foot-brand"><b>Orvella</b> · Learn. Build. Collaborate.</span>
          <span>Instagram <b>@orvella.labs</b></span>
          <span><Link className="link" to="/privasi">Privasi</Link> · <Link className="link" to="/syarat">Syarat</Link></span>
          <span>© 2026 Orvella · Dibuat di Indonesia</span>
        </footer>
      </main>

      <div className="os-dock-wrap pub-dock">
        <nav className="os-dock" aria-label="Pindah bagian">
          {SECTIONS.slice(0, 3).map(s => (
            <button key={s.id} className={`os-dock-app${cur === s.id ? ' is-running' : ''}`} style={{ ['--app' as string]: s.color }} aria-label={s.label} onClick={() => go(s.id)}>
              <Icon name={s.icon} /><span className="os-run" /><span className="os-dock-tip">{s.label}</span></button>
          ))}
          <Link className="os-dock-orvi" to="/daftar" aria-label="Daftar"><Orvi size={64} mood="happy" force follow /></Link>
          {SECTIONS.slice(3).map(s => (
            <button key={s.id} className={`os-dock-app${cur === s.id ? ' is-running' : ''}`} style={{ ['--app' as string]: s.color }} aria-label={s.label} onClick={() => go(s.id)}>
              <Icon name={s.icon} /><span className="os-run" /><span className="os-dock-tip">{s.label}</span></button>
          ))}
        </nav>
      </div>
    </PublicShell>
  );
}
