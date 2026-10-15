/* Ganti kata sandi (Pengaturan › Akun). Akun khusus Google boleh membuat kata sandi pertama tanpa kata sandi lama.
   Setelah berhasil, sesi di perangkat lain keluar; sesi ini tetap masuk. */
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import type { Me } from '../api/types';
import { Icon } from '../design/Icon';
import { toast } from '../design/toast';

export function PasswordForm({ me }: { me: Me }) {
  const qc = useQueryClient();
  const has = me.has_password !== false;
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ lama: '', baru: '', ulang: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (has && !f.lama) local.lama = 'Isi kata sandi lama.';
    if (f.baru.length < 8) local.baru = 'Minimal 8 karakter.';
    else if (f.baru !== f.ulang) local.ulang = 'Belum sama dengan kata sandi baru.';
    setErr(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      await api.post('/api/me/password', { lama: f.lama, baru: f.baru });
      await qc.invalidateQueries({ queryKey: ['/api/me'] });
      setF({ lama: '', baru: '', ulang: '' }); setOpen(false);
      toast({ kind: 'success', icon: 'lock', title: has ? 'Kata sandi diganti' : 'Kata sandi dibuat', body: 'Perangkat lain yang masih masuk otomatis keluar.' });
    } catch (e2) { setErr(e2 instanceof ApiError && Object.keys(e2.fields).length ? e2.fields : { baru: 'Belum tersimpan. Coba lagi.' }); }
    finally { setBusy(false); }
  };
  const input = (k: 'lama' | 'baru' | 'ulang', label: string, auto: string) => (
    <div className="field" key={k}><label className="field-label" htmlFor={`pw-${k}`}>{label}</label>
      <input id={`pw-${k}`} className={`input${err[k] ? ' is-invalid' : ''}`} type="password" autoComplete={auto} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} />
      {err[k] && <span className="field-error"><Icon name="circle-alert" size={14} />{err[k]}</span>}</div>
  );
  return (
    <div className="set-row mt-4">
      <div className="grow"><div className="t-h4">Kata sandi</div>
        <div className="t-sm t-muted">{has ? 'Ganti kata sandi buat masuk pakai email.' : 'Akunmu masuk lewat Google. Kamu bisa bikin kata sandi kalau mau masuk pakai email juga.'}</div>
        {open && (
          <form className="stack gap-3 mt-3" style={{ maxWidth: 380 }} onSubmit={submit} noValidate>
            {has && input('lama', 'Kata sandi lama', 'current-password')}
            {input('baru', 'Kata sandi baru (minimal 8 karakter)', 'new-password')}
            {input('ulang', 'Ulangi kata sandi baru', 'new-password')}
            <div className="row gap-2"><button className={`btn btn-primary btn-press${busy ? ' is-loading' : ''}`} type="submit">Simpan</button>
              <button className="btn btn-ghost" type="button" onClick={() => { setOpen(false); setErr({}); }}>Batal</button></div>
          </form>
        )}
      </div>
      {!open && <button className="btn btn-secondary btn-press" onClick={() => setOpen(true)}>{has ? 'Ganti' : 'Bikin kata sandi'}</button>}
    </div>
  );
}
