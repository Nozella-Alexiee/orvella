/* Lupa kata sandi: minta link lewat email (/lupa-sandi), lalu bikin kata sandi baru dari link itu (/reset-sandi/:token). */
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import './auth.css';
import { api, ApiError } from '../api/client';
import { Icon } from '../design/Icon';
import { toast } from '../design/toast';
import { AuthFrame } from './Auth';

export default function LupaSandi() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) { setErr('Isi email akunmu.'); return; }
    setErr(''); setBusy(true);
    try { const r = await api.post<{ pesan: string }>('/api/auth/lupa', { email }); setSent(r.pesan); }
    catch (e2) { setErr(e2 instanceof ApiError && e2.offline ? 'Koneksi terputus. Coba lagi.' : 'Terjadi kesalahan. Coba lagi.'); }
    finally { setBusy(false); }
  };
  return (
    <AuthFrame title="Lupa kata sandi" say={sent ? 'Cek email kamu ya!' : 'Tenang, bisa dibikin baru kok.'}>
      {sent ? (
        <div className="auth-form">
          <h1 className="pub-title">Cek <em>emailmu</em>.</h1>
          <p className="pub-sub">{sent} Link-nya berlaku 30 menit.</p>
          <p className="pub-switch"><Link className="link" to="/masuk">Balik ke halaman masuk</Link></p>
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit} noValidate>
          <h1 className="pub-title">Lupa kata <em>sandi</em>?</h1>
          <p className="pub-sub">Tulis email akunmu. Kami kirim link buat bikin kata sandi baru.</p>
          <div className="stack gap-4">
            <div className="field"><label className="field-label" htmlFor="lupa-email">Email</label>
              <input id="lupa-email" className={`input input-lg${err ? ' is-invalid' : ''}`} type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
              {err && <span className="field-error"><Icon name="circle-alert" size={14} />{err}</span>}</div>
            <button className={`btn btn-primary btn-xl btn-press w-full${busy ? ' is-loading' : ''}`} type="submit">Kirim link<Icon name="arrow-right" /></button>
          </div>
          <p className="pub-switch">Masuk lewat Google? Gak perlu kata sandi, <Link className="link" to="/masuk">masuk aja di sini</Link>.</p>
        </form>
      )}
    </AuthFrame>
  );
}

export function ResetSandi() {
  const { token = '' } = useParams();
  const nav = useNavigate();
  const [f, setF] = useState({ baru: '', ulang: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (f.baru.length < 8) local.baru = 'Minimal 8 karakter.';
    else if (f.baru !== f.ulang) local.ulang = 'Belum sama dengan kata sandi baru.';
    setErr(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      await api.post('/api/auth/reset', { token, baru: f.baru });
      toast({ kind: 'success', icon: 'lock', title: 'Kata sandi baru tersimpan', body: 'Silakan masuk pakai kata sandi baru.' });
      nav('/masuk', { replace: true });
    } catch (e2) {
      setErr(e2 instanceof ApiError ? (Object.keys(e2.fields).length ? e2.fields : { baru: e2.message }) : { baru: 'Terjadi kesalahan. Coba lagi.' });
    } finally { setBusy(false); }
  };
  const input = (k: 'baru' | 'ulang', label: string) => (
    <div className="field"><label className="field-label" htmlFor={`rs-${k}`}>{label}</label>
      <input id={`rs-${k}`} className={`input input-lg${err[k] ? ' is-invalid' : ''}`} type="password" autoComplete="new-password" value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} />
      {err[k] && <span className="field-error"><Icon name="circle-alert" size={14} />{err[k]}</span>}</div>
  );
  return (
    <AuthFrame title="Kata sandi baru" say="Bikin yang gampang kamu ingat, susah ditebak orang.">
      <form className="auth-form" onSubmit={submit} noValidate>
        <h1 className="pub-title">Kata sandi <em>baru</em>.</h1>
        <p className="pub-sub">Setelah disimpan, semua perangkat yang masih masuk otomatis keluar.</p>
        <div className="stack gap-4">
          {input('baru', 'Kata sandi baru (minimal 8 karakter)')}
          {input('ulang', 'Ulangi kata sandi baru')}
          <button className={`btn btn-primary btn-xl btn-press w-full${busy ? ' is-loading' : ''}`} type="submit">Simpan<Icon name="check" /></button>
        </div>
        <p className="pub-switch"><Link className="link" to="/lupa-sandi">Minta link baru</Link></p>
      </form>
    </AuthFrame>
  );
}
