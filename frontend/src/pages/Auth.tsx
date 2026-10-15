import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import './auth.css';
import { api, ApiError } from '../api/client';
import { useMe } from '../api/hooks';
import type { Me } from '../api/types';
import { Icon } from '../design/Icon';
import { toast } from '../design/toast';
import { Orvi } from '../design/Orvi';
import { GOOGLE_ERRORS, GoogleButton, PublicShell } from './public/Public';
import { Boot, homeFor } from '../app/common';

/** Jendela login Orvella OS di atas wallpaper (dipakai Masuk, Daftar, dan Onboarding). */
export function AuthFrame({ children, title = 'Masuk', say, wide }: { children: React.ReactNode; title?: string; say?: string; wide?: boolean }) {
  return (
    <PublicShell cta={false} className="pub-auth">
      <main className="pub-login-wrap">
        <section className={`pub-login${wide ? ' is-wide' : ''}`} aria-label={title}>
          <div className="os-win-bar pub-login-bar"><span className="os-win-glyph"><Icon name="log-in" /></span><div className="os-win-title"><b>{title}</b><span>orvella</span></div></div>
          <div className="pub-login-body">
            {say && <div className="pub-login-orvi"><Orvi size={96} mood="happy" force /><span className="pub-say">{say}</span></div>}
            {children}
            <p className="pub-terms">Dengan melanjutkan, kamu setuju dengan <Link className="link" to="/syarat">Syarat</Link> dan <Link className="link" to="/privasi">Kebijakan Privasi</Link> Orvella.</p>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}

const soon = () => toast({ kind: 'accent', icon: 'info', title: 'Segera hadir', body: 'Masuk dengan akun sekolah sedang disiapkan. Pakai Google atau email dulu, ya.' });

export default function Auth({ mode }: { mode: 'login' | 'register' }) {
  const { data: me, isLoading } = useMe();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const galat = params.get('galat');
  useEffect(() => { if (galat) toast({ kind: 'danger', icon: 'circle-alert', title: 'Belum bisa masuk', body: GOOGLE_ERRORS[galat] || 'Coba lagi, ya.', ms: 9000 }); }, [galat]);
  if (isLoading) return <Boot />;
  if (me) return <Navigate to={params.get('next') || homeFor(me.role)} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!pw) local.password = 'Kata sandi tidak boleh kosong.';
    else if (mode === 'register' && pw.length < 8) local.password = 'Minimal 8 karakter.';
    if (mode === 'register' && !name.trim()) local.name = 'Nama panggilan tidak boleh kosong.';
    if (!email.trim()) local.email = 'Email tidak boleh kosong.';
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      const u = mode === 'login'
        ? await api.post<Me>('/api/auth/login', { email, password: pw })
        : await api.post<Me>('/api/auth/register', { name, email, password: pw });
      qc.setQueryData(['/api/me'], u);
      nav(u.role === 'learner' && !u.onboarded ? '/mulai/tujuan' : params.get('next') || homeFor(u.role), { replace: true });
    } catch (err) {
      setErrors(err instanceof ApiError && Object.keys(err.fields).length ? err.fields : { password: err instanceof ApiError && err.offline ? 'Koneksi terputus. Coba lagi.' : 'Terjadi kesalahan. Coba lagi.' });
    } finally {
      setBusy(false);
    }
  };

  const field = (id: string, label: string, value: string, set: (v: string) => void, type = 'text', extra?: React.ReactNode, auto?: string) => (
    <div className="field">
      <div className="row between"><label className="field-label" htmlFor={id}>{label}</label>{extra}</div>
      <input id={id} className={`input input-lg${errors[id] ? ' is-invalid' : ''}`} type={type} value={value} onChange={e => set(e.target.value)} autoComplete={auto}
        aria-invalid={!!errors[id]} aria-describedby={errors[id] ? `${id}-err` : undefined} />
      {errors[id] && <span className="field-error" id={`${id}-err`}><Icon name="circle-alert" size={14} />{errors[id]}</span>}
    </div>
  );

  return (
    <AuthFrame title={mode === 'login' ? 'Masuk' : 'Daftar'} say={mode === 'login' ? 'Hai! Masuk dulu, lalu coba Sandbox.' : 'Halo, aku Orvi. Yuk bikin akun!'}>
      {mode === 'login' ? (
        <form className="auth-form" onSubmit={submit} noValidate>
          <h1 className="pub-title">Selamat datang <em>lagi</em>.</h1>
          <p className="pub-sub">Desktop belajarmu sudah menunggu.</p>
          <div className="pub-oauth"><GoogleButton next={params.get('next') || ''} /><button type="button" className="btn btn-lg pub-school" onClick={soon}><Icon name="school" />Akun sekolah</button></div>
          <div className="sep">atau dengan email</div>
          <div className="stack gap-4">
            {field('email', 'Email', email, setEmail, 'email', null, 'email')}
            {field('password', 'Kata sandi', pw, setPw, 'password', <Link className="link t-xs" to="/lupa-sandi">Lupa?</Link>, 'current-password')}
            <button className={`btn btn-primary btn-xl btn-press w-full mt-2${busy ? ' is-loading' : ''}`} type="submit">Masuk<Icon name="arrow-right" /></button>
          </div>
          <p className="pub-switch">Belum punya akun? <Link className="link" to="/daftar">Daftar gratis</Link></p>
        </form>
      ) : (
        <form className="auth-form" onSubmit={submit} noValidate>
          <h1 className="pub-title">Mulai <em>orbitmu</em>.</h1>
          <p className="pub-sub">Gratis untuk Bab 1–3. Tidak perlu kartu.</p>
          <div className="pub-oauth"><GoogleButton label="Daftar dengan Google" /><button type="button" className="btn btn-lg pub-school" onClick={soon}><Icon name="school" />Akun sekolah</button></div>
          <div className="sep">atau dengan email</div>
          <div className="stack gap-4">
            {field('name', 'Nama panggilan', name, setName, 'text', null, 'nickname')}
            {field('email', 'Email', email, setEmail, 'email', null, 'email')}
            {field('password', 'Kata sandi', pw, setPw, 'password', <span className="t-xs t-faint">minimal 8 karakter</span>, 'new-password')}
            <button className={`btn btn-primary btn-xl btn-press w-full mt-2${busy ? ' is-loading' : ''}`} type="submit">Buat akun<Icon name="arrow-right" /></button>
          </div>
          <p className="pub-switch">Sudah punya akun? <Link className="link" to="/masuk">Masuk</Link></p>
        </form>
      )}
    </AuthFrame>
  );
}
