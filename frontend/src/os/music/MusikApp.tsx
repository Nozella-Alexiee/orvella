/* App Musik: pilih Spotify atau Apple Music, tempel link atau pilih playlist pilihan sekolah,
   lalu masuk di pemutar resminya. Pemutarnya sendiri hidup di MusicHost. */
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { Icon } from '../../design/Icon';
import { sound, shake } from '../../fx';
import { useWinTitle } from '../Window';
import { slot } from './MusicHost';
import { signInSpotify, useMusic, type Track } from './store';

const PROV = { spotify: { name: 'Spotify', c: '#1ED760' }, apple: { name: 'Apple Music', c: '#FF4E6B' } } as const;

export default function MusikApp() {
  const m = useMusic();
  const [prov, setProv] = useState<'spotify' | 'apple'>(m.current?.provider || 'spotify');
  const [url, setUrl] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const slotRef = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useWinTitle('Musik', m.current ? m.current.title : 'Spotify · Apple Music');
  useEffect(() => { void m.load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { slot.el = slotRef.current; return () => { if (slot.el === slotRef.current) slot.el = null; }; });

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const t = await api.get<Track>(`/api/music/resolve?url=${encodeURIComponent(url.trim())}`);
      m.save(t); m.play(t); setUrl(''); sound('drop');
      setMsg({ ok: true, text: `${t.title} dimuat. Tekan putar di pemutar, lalu masuk kalau diminta.` });
      setProv(t.provider);
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : 'Link belum bisa dibaca.' });
      shake(input.current); sound('no');
    } finally { setBusy(false); }
  };
  if (!m.enabled) return <div className="os-mz"><div className="os-mz-off"><Icon name="radio" size={20} /><b>Musik dimatikan oleh admin sekolah.</b></div></div>;
  const [blocked, setBlocked] = useState(false);
  const signIn = () => { setBlocked(!signInSpotify()); sound('tap'); };
  // kartu masuk: belum pernah masuk, atau pemutar ternyata masih memberi cuplikan 30 detik
  const needLogin = prov === 'spotify' && (!m.signedIn || m.preview);
  const lists = [...m.saved, ...m.curated].filter((t, i, a) => t.provider === prov && a.findIndex(x => x.open_url === t.open_url) === i);
  return (
    <div className="os-mz" style={{ ['--pc' as string]: PROV[prov].c }}>
      <div className="os-mz-top">
        <div className="os-seg" role="tablist" aria-label="Layanan musik">
          {(Object.keys(PROV) as (keyof typeof PROV)[]).map(p => (
            <button key={p} role="tab" aria-pressed={prov === p} onClick={() => setProv(p)}><i className="os-mz-dot" style={{ background: PROV[p].c }} />{PROV[p].name}</button>
          ))}
        </div>
      </div>
      {needLogin && (
        <div className="os-mz-login">
          <span className="os-mz-login-ic"><Icon name="log-in" size={20} /></span>
          <div><b>{m.preview && m.signedIn ? 'Masih cuplikan 30 detik' : 'Masuk ke Spotify'}</b>
            <p>{m.preview && m.signedIn ? 'Pemutar belum membaca akunmu. Masuk lagi, lalu tutup jendela loginnya.' : 'Biar lagunya diputar penuh, bukan cuplikan 30 detik. Bisa pakai akun gratis.'}</p>
            {blocked && <p className="os-mz-err">Jendela login diblokir browser. <a href="https://accounts.spotify.com/login" target="_blank" rel="noreferrer">Buka di tab baru</a>, lalu klik <button className="os-mz-linkbtn" onClick={() => m.markSignedIn()}>Sudah masuk</button>.</p>}
          </div>
          <button className="btn os-mz-login-btn" onClick={signIn}><Icon name="log-in" />Masuk dengan Spotify</button>
        </div>
      )}
      {prov === 'spotify' && m.signedIn && !m.preview && (
        <p className="os-mz-in"><Icon name="circle-check" size={14} />Sudah masuk Spotify di browser ini.
          <button className="os-mz-linkbtn" onClick={() => m.markSignedIn()}>Muat ulang pemutar</button>
          <button className="os-mz-linkbtn" onClick={signIn}>Ganti akun</button></p>
      )}
      <div className="os-mz-player">
        <div ref={slotRef} className="os-mz-slot" data-empty={!m.current || undefined}>
          {!m.current && <div className="os-mz-empty"><Icon name="radio" size={20} /><b>Pilih playlist di bawah</b><span>atau tempel link {PROV[prov].name}.</span></div>}
        </div>
        <p className="os-mz-note"><Icon name="info" size={14} />
          <span>{prov === 'apple' ? 'Tekan Masuk di pemutar Apple Music supaya lagu diputar penuh. Lagu penuh butuh langganan Apple Music.'
            : 'Kamu masuk di halaman resmi Spotify, jadi Orvella tidak pernah melihat kata sandimu. Di Safari atau Brave, izinkan cookie pihak ketiga kalau lagunya tetap cuplikan.'}</span></p>
      </div>
      <form className="os-mz-link" onSubmit={add}>
        <label className="os-field"><span>Tempel link playlist, album, atau lagu {PROV[prov].name}</span>
          <div className="row gap-2">
            <input ref={input} className="input grow" type="url" value={url} onChange={e => setUrl(e.target.value)} spellCheck={false}
              placeholder={prov === 'spotify' ? 'https://open.spotify.com/playlist/…' : 'https://music.apple.com/id/playlist/…'} aria-label="Link musik" />
            <button className="btn btn-primary" disabled={busy}><Icon name={busy ? 'loader-circle' : 'plus'} />Putar</button>
          </div>
        </label>
        {msg && <small className={msg.ok ? 'os-mz-ok' : 'os-mz-err'} role="status">{msg.text}</small>}
      </form>
      <div className="os-mz-lists">
        <span className="os-eyebrow">{prov === 'spotify' ? 'Pilihan untuk ngoding' : 'Tersimpan'}</span>
        <div className="os-mz-grid">
          {lists.length ? lists.map(t => (
            <button key={t.open_url} className={`os-mz-card${m.current?.open_url === t.open_url ? ' is-on' : ''}`} onClick={() => { m.play(t); sound('tap'); }}>
              {t.thumb ? <img src={t.thumb} alt="" /> : <span className="os-mz-art"><Icon name="radio" /></span>}
              <b>{t.title}</b><small>{t.kind === 'playlist' ? 'Playlist' : t.kind === 'album' ? 'Album' : 'Lagu'}</small>
            </button>
          )) : <small className="t-faint">Belum ada. Tempel link {PROV[prov].name} di atas.</small>}
        </div>
      </div>
    </div>
  );
}
