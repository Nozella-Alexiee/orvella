/* /s/:kode — tautan undangan ngoding bareng. Bergabung sebagai anggota proyek, lalu buka Sandbox-nya. */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, ApiError } from '../api/client';
import { Boot } from '../app/common';
import { AuthFrame } from './Auth';

export default function KolabJoin() {
  const { kode = '' } = useParams();
  const nav = useNavigate();
  const [err, setErr] = useState('');
  useEffect(() => {
    api.post<{ project: number }>(`/api/kolab/gabung/${encodeURIComponent(kode)}`)
      .then(r => nav(`/sandbox/${r.project}`, { replace: true }))
      .catch(e => setErr(e instanceof ApiError ? e.message : 'Tautan belum bisa dibuka.'));
  }, [kode, nav]);
  if (!err) return <Boot />;
  return (
    <AuthFrame title="Ngoding bareng" say="Yah, tautannya nggak bisa dipakai.">
      <p style={{ margin: '0 0 16px', lineHeight: 1.5 }}>{err}</p>
      <Link className="btn btn-primary" to="/beranda">Ke desktop</Link>
    </AuthFrame>
  );
}
