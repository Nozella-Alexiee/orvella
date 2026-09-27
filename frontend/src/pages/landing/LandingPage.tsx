import { useEffect, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { LogoMark } from '../../design/LogoMark';
import { LangIcon, LangChip } from '../../design/LangIcon';
import { mountLanding } from './landing';
import './landing.css';

/* Landing Orvella (dari design/mockups/landing.html). Markup statis di sini, perilaku di landing.ts. */
export default function LandingPage() {
  useEffect(() => {
    document.title = 'Orvella · Pahami dulu, baru ngoding';
    return mountLanding();
  }, []);
  return (
    <div className="lp-root">
      <a className="skip" href="#utama">Lewati ke konten</a>
      
      
      <header className="nav" id="nav">
        <div className="wrap nav-in">
          <Link className="logo" to="/" aria-label="Orvella, beranda"><LogoMark /><span className="logo-word">Orvella</span></Link>
          <nav className="nav-links" aria-label="Utama">
            <a href="#cara">Cara belajar</a>
            <a href="#editor">Bahasa</a>
            <a href="#orvi">Kenalan Orvi</a>
            <a href="#mentor">Untuk mentor</a>
            <a href="#sekolah">Untuk sekolah</a>
          </nav>
          <div className="nav-end">
            <button className="btn btn-ghost btn-icon" id="themeBtn" type="button" aria-label="Ganti tema terang/malam"><i data-lucide="moon" /></button>
            <Link className="btn btn-ghost hide-sm" to="/masuk">Masuk</Link>
            <Link className="btn btn-primary" to="/daftar" data-magnetic=".25">Mulai gratis</Link>
          </div>
        </div>
      </header>
      
      <main id="utama">
      
      <section className="hero" aria-labelledby="hero-title">
        <canvas className="hero-field" id="heroField" aria-hidden="true" />
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <span className="eyebrow-chip"><span className="live-dot"><i></i></span>12 bahasa pemrograman · penjelasan berbahasa Indonesia</span>
            <h1 id="hero-title" data-split="">
              <span className="swash">Pahami<svg viewBox="0 0 300 30" preserveAspectRatio="none" aria-hidden="true"><path id="swashPath" d="M4 20 C 60 8, 140 6, 200 12 S 280 22, 296 10"/></svg></span> dulu,<br />baru ngoding<span className="hero-dot">.</span>
            </h1>
            <p className="lead">Orvella menjelaskan tiap konsep lewat animasi yang bisa kamu sentuh, melatihmu sampai kuat, lalu mengujimu dengan kuis dan tantangan kode sungguhan. Di Python, C++, Rust, web, dan bahasa lain yang ingin kamu kuasai.</p>
            <div className="row hero-cta">
              <Link className="btn btn-primary btn-lg" to="/daftar" data-magnetic=".3">Mulai belajar gratis <i data-lucide="arrow-right" /></Link>
              <a className="btn btn-ghost btn-lg" href="#cara"><i data-lucide="play-circle" /> Lihat cara kerjanya</a>
            </div>
            <p className="small faint hero-note">Sudah punya kelas? Masuk dengan <b className="muted">kode kelas</b> dari mentormu.</p>
          </div>
      
          <div className="hero-visual">
            <div className="orbit-stage" id="orbit">
              <svg className="orbit-lines" aria-hidden="true"><ellipse id="ringIn"/><ellipse id="ringOut"/></svg>
              <div className="orbit-orvi" id="heroOrvi"></div>
              
              <div className="orb-tip" id="orbTip" hidden></div>
            </div>
            <div className="code-card hero-code" id="heroCode" aria-live="polite">
              <div className="code-head">
                <span id="hcLang"></span>
                <span className="hc-rt" id="hcRt"></span>
                <button className="btn btn-sun btn-sm" id="hcRun" type="button" style={{ marginLeft: 'auto' }}><i data-lucide="play" /> Jalankan</button>
              </div>
              <div className="code-body" id="hcBody"></div>
              <div className="out" id="hcOut"><span className="out-label">Keluaran</span><span className="faint-out">Tekan Jalankan untuk mencoba.</span></div>
            </div>
          </div>
        </div>
        <div className="wrap hero-hint small faint"><i data-lucide="mouse-pointer-click" /> Arahkan kursor ke bahasa di orbit untuk mengintip kodenya, klik untuk mencoba.</div>
      </section>
      
      
      <section className="section coba" id="coba" aria-labelledby="coba-title">
        <div className="wrap">
          <header className="sec-head">
            <span className="eyebrow"><i data-lucide="flask-conical" /> Coba sekarang, tanpa daftar</span>
            <h2 id="coba-title">Satu konsep, tiga cara komputer melihatnya.</h2>
            <p className="lead">Variabel terlihat mirip di layar, tapi tiap bahasa memperlakukannya berbeda. Jalankan kodenya baris per baris, lalu lihat memorinya bergerak.</p>
          </header>
      
          <div className="segmented coba-tabs" id="cobaTabs" role="tablist" aria-label="Pilih bahasa">
            <button type="button" role="tab" data-p="python" aria-pressed="true">Python</button>
            <button type="button" role="tab" data-p="cpp" aria-pressed="false">C++</button>
            <button type="button" role="tab" data-p="rust" aria-pressed="false">Rust</button>
          </div>
      
          <div className="coba-grid">
            <div className="coba-left">
              <div className="code-card">
                <div className="code-head"><span id="cbLang"></span><span className="file" id="cbFile"></span><span className="badge badge-lilac" style={{ marginLeft: 'auto' }} id="cbStepBadge">baris 0/4</span></div>
                <div className="code-body" id="cbCode"></div>
                <div className="out" id="cbOut"><span className="out-label">Keluaran</span></div>
              </div>
              <div className="stepper">
                <div className="row stepper-btns">
                  <button className="btn btn-sm btn-icon" id="cbPrev" type="button" aria-label="Mundur satu baris"><i data-lucide="undo-2" /></button>
                  <button className="btn btn-primary" id="cbNext" type="button">Baris berikutnya <i data-lucide="chevron-right" /></button>
                  <button className="btn btn-ghost btn-sm" id="cbReset" type="button"><i data-lucide="rotate-ccw" /> Ulang</button>
                </div>
                <label className="scrub" htmlFor="cbScrub">
                  <span className="scrub-label"><i data-lucide="history" /> Mesin Waktu Kode</span>
                  <input type="range" id="cbScrub" min="0" max="4" step="1" defaultValue="0" />
                  <span className="scrub-ticks" aria-hidden="true"><span>mulai</span><span>1</span><span>2</span><span>3</span><span>4</span></span>
                </label>
              </div>
            </div>
      
            <div className="coba-right">
              <div className="mem-stage" id="memStage" data-lang="python">
                <svg className="mem-links" id="memLinks" aria-hidden="true">
                  <defs><marker id="arrowHead" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" className="arrow-fill"/></marker></defs>
                </svg>
                <span className="mem-zone mem-zone-a" id="zoneA">Label</span>
                <span className="mem-zone mem-zone-b" id="zoneB">Objek</span>
                <p className="mem-empty" id="memEmpty">Memori masih kosong.</p>
              </div>
              <div className="explain">
                <div className="explain-orvi" id="cbOrvi"></div>
                <div className="explain-text">
                  <p id="cbExplain"></p>
                  <button className="btn btn-sun btn-sm" id="cbFix" type="button" hidden><i data-lucide="wand-sparkles" /> Perbaiki dengan <code>.clone()</code></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      
      <section className="section phases" id="cara" aria-labelledby="cara-title">
        <div className="wrap">
          <header className="sec-head">
            <span className="eyebrow"><i data-lucide="orbit" /> Cara belajar di Orvella</span>
            <h2 id="cara-title">Empat fase di tiap bab. Kamu baru diuji setelah benar-benar paham.</h2>
          </header>
          <div className="ph-grid">
            <div className="ph-steps" id="phSteps">
              <article className="ph-step is-active" data-phase="pahami" data-i="0">
                <span className="ph-num">Fase 1 dari 4</span>
                <h3 className="ph-name">Pahami</h3>
                <p>Konsep dijelaskan dulu lewat animasi yang bisa kamu sentuh: geser angka, seret nilai, dan jalankan kode baris per baris.</p>
                <ul className="ph-list"><li>Animasi memori yang berbeda untuk tiap bahasa</li><li>Mesin Waktu Kode untuk maju-mundur per langkah</li><li>Tanpa nilai, tanpa tekanan</li></ul>
                <div className="ph-mini" data-demo="pahami"></div>
              </article>
              <article className="ph-step" data-phase="perkuat" data-i="1">
                <span className="ph-num">Fase 2 dari 4</span>
                <h3 className="ph-name">Perkuat</h3>
                <p>Latihan pendek yang menyesuaikan diri. Kalau kamu salah, Orvi memberi petunjuk bertahap lalu menambahkan soal serupa.</p>
                <ul className="ph-list"><li>10 tipe latihan, termasuk susun kode dan tebak output</li><li>Petunjuk bertingkat, bukan langsung jawaban</li><li>Soal serupa muncul saat kamu keliru</li></ul>
                <div className="ph-mini" data-demo="perkuat"></div>
              </article>
              <article className="ph-step" data-phase="kuis" data-i="2">
                <span className="ph-num">Fase 3 dari 4</span>
                <h3 className="ph-name">Kuis</h3>
                <p>Sepuluh soal berwaktu sebagai gerbang. Kamu butuh 70% untuk membuka Uji, dan boleh mengulang dengan soal baru.</p>
                <ul className="ph-list"><li>Combo dan fakta seru tentang bahasanya</li><li>Pembahasan untuk semua soal</li><li>Petunjuk dikunci selama kuis</li></ul>
                <div className="ph-mini" data-demo="kuis"></div>
              </article>
              <article className="ph-step" data-phase="uji" data-i="3">
                <span className="ph-num">Fase 4 dari 4</span>
                <h3 className="ph-name">Uji</h3>
                <p>Tantangan kode sungguhan di bahasa pilihanmu, diperiksa tes otomatis. Mentor juga bisa memberi ulangan berwaktu.</p>
                <ul className="ph-list"><li>Dikompilasi dan dijalankan di server terisolasi</li><li>Tes terlihat dan tes tersembunyi</li><li>Error compiler ditandai tepat di barisnya</li></ul>
                <div className="ph-mini" data-demo="uji"></div>
              </article>
            </div>
            <div className="ph-visual" aria-hidden="true">
              <div className="ph-ring-wrap" id="phRing">
                <svg viewBox="-200 -200 400 400" className="ph-ring-svg">
                  <circle className="ph-track" r="170"/>
                  <path className="ph-arc" data-i="0" d=""/><path className="ph-arc" data-i="1" d=""/><path className="ph-arc" data-i="2" d=""/><path className="ph-arc" data-i="3" d=""/>
                  <text className="ph-ring-lbl" data-i="0">Pahami</text><text className="ph-ring-lbl" data-i="1">Perkuat</text><text className="ph-ring-lbl" data-i="2">Kuis</text><text className="ph-ring-lbl" data-i="3">Uji</text>
                </svg>
                <div className="ph-walker" id="phWalker"></div>
                <div className="ph-demo-slot" id="phDemo"></div>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      
      <section className="section editor-band" id="editor" aria-labelledby="ed-title">
        <div className="wrap">
          <header className="sec-head sec-head-dark">
            <span className="eyebrow"><i data-lucide="terminal-square" /> Satu editor untuk semua</span>
            <h2 id="ed-title">Satu editor. Banyak bahasa. Semuanya jalan sungguhan.</h2>
            <p className="lead">Python, C, C++, Rust, Java, Go, dan SQL dijalankan di server yang terisolasi. HTML dan CSS langsung tampil di pratinjau. Error dari compiler ditandai di barisnya, lalu Orvi membantu menjelaskannya.</p>
          </header>
      
          <div className="ed-shell">
            <div className="ed-top">
              <div className="ed-tabs" role="tablist" aria-label="Contoh bahasa">
                <button type="button" role="tab" data-ed="cpp" aria-selected="true"><span className="ed-mono"><LangIcon id="cpp" size={18} /></span>main.cpp</button>
                <button type="button" role="tab" data-ed="rust" aria-selected="false"><span className="ed-mono"><LangIcon id="rust" size={18} /></span>main.rs</button>
                <button type="button" role="tab" data-ed="web" aria-selected="false"><span className="ed-mono"><LangIcon id="html" size={18} /></span>index.html + gaya.css</button>
              </div>
              <div className="ed-actions" id="edActions">
                <div className="ed-seg" role="group" aria-label="Versi kode">
                  <button type="button" data-v="bug" aria-pressed="true">Versi bug</button>
                  <button type="button" data-v="ok" aria-pressed="false">Versi benar</button>
                </div>
                <button className="btn btn-sun btn-sm" id="edRun" type="button"><i data-lucide="play" /> Jalankan</button>
              </div>
            </div>
      
            <div className="ed-main" id="edCompiled">
              <div className="ed-code"><div className="code-body" id="edCode"></div></div>
              <div className="ed-side">
                <div className="pipe" id="edPipe">
                  <div className="pipe-step" data-s="0"><span className="ps-ico"></span><span><b>Kompilasi</b><small id="edCmd">g++ -std=c++20 main.cpp</small></span><span className="ps-bar"><i></i></span></div>
                  <div className="pipe-step" data-s="1"><span className="ps-ico"></span><span><b>Tautkan</b><small>ld · pustaka standar</small></span><span className="ps-bar"><i></i></span></div>
                  <div className="pipe-step" data-s="2"><span className="ps-ico"></span><span><b>Jalankan</b><small>batas 2 detik · 256 MB</small></span><span className="ps-bar"><i></i></span></div>
                </div>
                <div className="ed-out" id="edOut"><span className="out-label">Terminal</span><span className="dim">Tekan Jalankan untuk mengompilasi.</span></div>
                <div className="ed-explain" id="edExplain" hidden>
                  <div className="ed-orvi" id="edOrvi"></div>
                  <p id="edExplainText"></p>
                </div>
              </div>
            </div>
      
            <div className="ed-main ed-web" id="edWeb" hidden>
              <div className="ed-code">
                <div className="web-files" role="tablist" aria-label="Berkas">
                  <button type="button" data-f="html" aria-selected="true">index.html</button>
                  <button type="button" data-f="css" aria-selected="false">gaya.css</button>
                </div>
                <label className="sr-only" htmlFor="webSrc">Isi berkas</label>
                <textarea id="webSrc" spellCheck={false} />
              </div>
              <div className="ed-side">
                <div className="web-preview">
                  <div className="wp-bar"><span></span><span></span><span></span><em>pratinjau · diperbarui saat kamu mengetik</em></div>
                  <iframe id="webFrame" title="Pratinjau HTML dan CSS" sandbox="" />
                </div>
              </div>
            </div>
          </div>
      
          <div className="rt-grid" id="rtGrid" aria-label="Runtime yang tersedia"></div>
        </div>
      </section>
      
      
      <section className="section studio" id="mentor" aria-labelledby="st-title">
        <div className="wrap">
          <header className="sec-head">
            <span className="eyebrow"><i data-lucide="blocks" /> Untuk mentor</span>
            <h2 id="st-title">Mentor menyusun materi sendiri, tanpa menulis JSON.</h2>
            <p className="lead">Susun bab dari blok: penjelasan, animasi memori, kode yang bisa dijalankan, soal, sampai tantangan dengan tes otomatis. Lihat pratinjaunya persis seperti siswa, lalu terbitkan ke kelasmu.</p>
          </header>
          <div className="st-shell">
            <div className="st-palette">
              <p className="st-cap">Seret blok ke bab, atau klik untuk menambah</p>
              <button type="button" className="st-block" data-b="teks"><i data-lucide="text" /><span><b>Penjelasan</b><small>teks + gambar</small></span></button>
              <button type="button" className="st-block" data-b="animasi"><i data-lucide="box" /><span><b>Animasi memori</b><small>kotak, label, pointer</small></span></button>
              <button type="button" className="st-block" data-b="kode"><i data-lucide="code-xml" /><span><b>Kode interaktif</b><small>bisa dijalankan siswa</small></span></button>
              <button type="button" className="st-block" data-b="soal"><i data-lucide="list-checks" /><span><b>Soal</b><small>10 tipe latihan</small></span></button>
              <button type="button" className="st-block" data-b="tantangan"><i data-lucide="flag" /><span><b>Tantangan kode</b><small>dengan tes otomatis</small></span></button>
            </div>
            <div className="st-outline" id="stOutline">
              <div className="st-ol-head">
                <LangChip id="python" />
                <div><b>Bab 3 · Perulangan</b><small>Fase Pahami · draf v2 · tersimpan</small></div>
              </div>
              <ol className="st-list" id="stList" />
              <p className="st-drop" id="stDrop">Lepas di sini</p>
            </div>
            <div className="st-preview">
              <div className="phone">
                <div className="phone-top"><span className="phase-tag" data-phase="pahami">Pahami</span><span className="tiny faint">Bab 3</span></div>
                <div className="phone-feed" id="stFeed"></div>
              </div>
              <div className="st-publish">
                <div className="st-orvi" id="stOrvi"></div>
                <button className="btn btn-primary btn-sm" id="stPublish" type="button"><i data-lucide="send" /> Terbitkan ke XII RPL 1</button>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      
      <section className="section meet" id="orvi" aria-labelledby="meet-title">
        <div className="wrap meet-grid">
          <div className="meet-stage">
            <div className="meet-halo" aria-hidden="true"></div>
            <div className="meet-orvi" id="meetOrvi" title="Seret atau colek Orvi"></div>
            <p className="meet-hint small faint"><i data-lucide="hand" /> Seret, lempar, atau colek Orvi.</p>
          </div>
          <div className="meet-copy">
            <span className="eyebrow"><i data-lucide="sparkles" /> Teman belajarmu</span>
            <h2 id="meet-title">Kenalan sama Orvi.</h2>
            <p className="lead">Orvi itu bola cahaya kecil yang menemanimu belajar. Bulan mungil yang terus mengelilinginya namanya <b>Pip</b>. Pip yang menunjuk bagian penting dan membawa nilai ke kotak variabel.</p>
            <p className="muted">Orvi tidak pernah bilang kamu bodoh. Kalau jawabanmu belum tepat, dia menunjukkan barisnya dan memberi petunjuk yang cukup untuk kamu coba lagi.</p>
            <div className="mood-row" role="group" aria-label="Coba ekspresi Orvi">
              <button className="btn btn-sm" type="button" data-mood="happy">Senang</button>
              <button className="btn btn-sm" type="button" data-mood="think">Mikir</button>
              <button className="btn btn-sm" type="button" data-mood="oops">Kaget</button>
              <button className="btn btn-sm" type="button" data-mood="focus">Fokus</button>
              <button className="btn btn-sm" type="button" data-mood="sleep">Tidur</button>
              <button className="btn btn-sm btn-sun" type="button" data-mood="cheer">Pesta</button>
            </div>
            <button className="btn btn-soft btn-sm" id="meetPoint" type="button"><i data-lucide="pointer" /> Suruh Pip menunjuk tombol daftar</button>
          </div>
        </div>
      </section>
      
      
      <section className="section roles" id="sekolah" aria-labelledby="roles-title">
        <div className="wrap">
          <header className="sec-head">
            <span className="eyebrow"><i data-lucide="school" /> Untuk sekolah</span>
            <h2 id="roles-title">Satu tempat untuk siswa, mentor, dan sekolah.</h2>
          </header>
          <div className="roles-grid">
            <article className="role" data-tilt="4">
              <span className="role-ico" style={{ '--rc': 'var(--pahami-fill)' } as CSSProperties}><i data-lucide="graduation-cap" /></span>
              <h3>Siswa</h3>
              <ul><li>Jalur belajar per bahasa, dari nol</li><li>Empat fase di tiap bab</li><li>Playground bebas untuk 12 bahasa</li><li>Proyek dengan review mentor</li></ul>
            </article>
            <article className="role" data-tilt="4">
              <span className="role-ico" style={{ '--rc': 'var(--perkuat-fill)' } as CSSProperties}><i data-lucide="presentation" /></span>
              <h3>Mentor</h3>
              <ul><li>Studio Materi berbasis blok</li><li>Bank soal dengan statistik jawaban</li><li>Review kode per baris</li><li>Sinyal siswa yang butuh bantuan</li></ul>
            </article>
            <article className="role" data-tilt="4">
              <span className="role-ico" style={{ '--rc': 'var(--kuis-fill)' } as CSSProperties}><i data-lucide="building-2" /></span>
              <h3>Sekolah</h3>
              <ul><li>Akun dan kelas dalam satu panel</li><li>Pilih bahasa yang aktif dan batas eksekusinya</li><li>Laporan kemajuan per kelas</li><li>Bisa dipasang di server sekolah dengan Docker</li></ul>
            </article>
          </div>
        </div>
      </section>
      
      
      <section className="cta" aria-labelledby="cta-title">
        <div className="wrap cta-in">
          <div className="cta-orvi" id="ctaOrvi"></div>
          <div>
            <h2 id="cta-title">Orbit pertamamu dimulai hari ini.</h2>
            <p>Pilih bahasa, pahami konsep pertamanya, dan jalankan program pertamamu dalam 10 menit.</p>
          </div>
          <Link className="btn btn-primary btn-lg" id="ctaBtn" to="/daftar" data-magnetic=".3">Mulai gratis <i data-lucide="arrow-right" /></Link>
        </div>
      </section>
      </main>
      
      <footer className="foot">
        <div className="wrap foot-in">
          <div className="stack" style={{ '--gap': '10px' } as CSSProperties}>
            <Link className="logo" to="/"><LogoMark /><span className="logo-word">Orvella</span></Link>
            <p className="small faint">Belajar ngoding dari paham.</p>
          </div>
          <nav className="foot-cols" aria-label="Kaki halaman">
            <div><b>Produk</b><a href="#cara">Cara belajar</a><a href="#editor">Bahasa</a><a href="#orvi">Orvi</a></div>
            <div><b>Untuk</b><a href="#coba">Siswa</a><a href="#mentor">Mentor</a><a href="#sekolah">Sekolah</a></div>
            <div><b>Bantuan</b><Link to="/masuk">Masuk</Link><Link to="/daftar">Daftar</Link><a href="#sekolah">Kontak sekolah</a></div>
          </nav>
        </div>
        <div className="wrap foot-base small faint"><span>© 2026 Orvella</span><span>Dibuat di Indonesia</span></div>
      </footer>
    </div>
  );
}
