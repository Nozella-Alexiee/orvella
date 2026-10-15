/* Unduh & impor proyek Sandbox sebagai .zip (berkas + orvella.json + database.sql kalau ada).
   Zip dibuat dan dibaca di server supaya isi database proyek web ikut terbawa. */
import { ApiError } from '../api/client';
import { toast } from '../design/toast';
import { download } from './DbPanel';
import type { Project } from './types';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'proyek';

export async function exportProject(p: Pick<Project, 'id' | 'title'>) {
  try {
    const res = await fetch(`/api/sandbox/${p.id}/export`, { credentials: 'same-origin' });
    if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => null))?.detail || 'Belum bisa diunduh.');
    const withDb = res.headers.get('X-Orvella-Database') === '1';
    download(`${slug(p.title)}.zip`, await res.blob(), 'application/zip');
    toast({ kind: 'success', icon: 'download', title: 'Proyek diunduh', body: withDb ? 'Berkas kode dan isi database ada di dalam .zip. Impor di Sandbox mana pun.' : 'Semua berkas ada di dalam .zip. Impor lagi lewat Proyek saya → Impor.' });
  } catch (e) {
    toast({ kind: 'danger', icon: 'download', title: 'Belum bisa diunduh', body: e instanceof ApiError ? e.message : 'Coba lagi sebentar.' });
  }
}

/** Unggah .zip jadi proyek baru. Mengembalikan proyek baru, atau null kalau gagal (toast sudah ditampilkan). */
export async function importProject(file: File): Promise<Project | null> {
  if (!file.name.toLowerCase().endsWith('.zip')) { toast({ kind: 'danger', icon: 'file-x', title: 'Bukan berkas .zip', body: 'Impor proyek memakai berkas .zip hasil Unduh proyek, atau zip berisi kodemu.' }); return null; }
  if (file.size > 2_000_000) { toast({ kind: 'danger', icon: 'file-x', title: 'Berkas terlalu besar', body: 'Maksimal 2 MB.' }); return null; }
  const fd = new FormData(); fd.append('file', file);
  try {
    const res = await fetch('/api/sandbox/import', { method: 'POST', body: fd, credentials: 'same-origin' });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, data?.detail || 'Impor gagal.');
    const p = data as Project & { db_seed?: boolean };
    toast({ kind: 'success', icon: 'import', title: 'Proyek diimpor', body: p.db_seed ? 'Isi database dimuat saat server proyek pertama kali dijalankan.' : `${Object.keys(p.files).length} berkas siap diedit.` });
    return p;
  } catch (e) {
    toast({ kind: 'danger', icon: 'import', title: 'Impor gagal', body: e instanceof ApiError ? e.message : 'Coba lagi sebentar.' });
    return null;
  }
}
