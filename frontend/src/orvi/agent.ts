/* Loop agen Orvi AI (dipakai TanyaOrvi.tsx).
   Server meneruskan obrolan ke model dan meng-stream balasannya (SSE). Kalau model memanggil alat, alatnya dijalankan DI SINI
   terhadap Sandbox yang terbuka (ask.ts: useOrviTools), hasilnya dikirim balik dengan `token` langkah lanjutan.
   Perubahan berkas dan menjalankan proyek selalu menunggu izin pengguna (kartu di obrolan). */
import { api, ApiError } from '../api/client';
import type { Konteks, OrviTools } from './ask';

export type ToolCall = { id: string; name: string; arguments: string };
export type ApiMsg = { role: 'user' | 'assistant' | 'tool'; content: string; tool_calls?: ToolCall[]; tool_call_id?: string };
export type Kuota = { limit: number | null; sisa: number | null; reset_at: string | null; window_hours: number; unlimited: boolean; aktif?: boolean };
export type Ev = { t?: string; sumber?: string; alat?: ToolCall[]; token?: string; selesai?: boolean; kuota?: Kuota; error?: string; pesan?: string };
export type TanyaBody = { pesan: ApiMsg[]; konteks?: Konteks; alat: boolean; proyek?: string; token?: string };

/** Kirim satu langkah dan baca stream-nya. Error sebelum stream (batas, pelan, token) dilempar sebagai ApiError. */
export async function streamStep(body: TanyaBody, signal: AbortSignal, onEv: (e: Ev) => void): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/orvi/tanya', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  } catch (e) {
    if (signal.aborted) throw e;
    throw new ApiError(0, 'Koneksi terputus.');
  }
  if (!res.ok || !res.body) {
    const text = await res.text();
    let detail: unknown = text;
    try { detail = (JSON.parse(text) as { detail?: unknown }).detail ?? text; } catch { /* teks biasa */ }
    if (res.status === 401) dispatchEvent(new CustomEvent('orvella:unauthorized'));
    throw new ApiError(res.status, detail as string);
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      for (const line of block.split('\n')) {
        if (!line.startsWith('data:')) continue;
        try { onEv(JSON.parse(line.slice(5))); } catch { /* baris rusak dilewati */ }
      }
    }
  }
}

export const args = (c: ToolCall): Record<string, string> => { try { const a = JSON.parse(c.arguments || '{}'); return a && typeof a === 'object' ? a : {}; } catch { return {}; } };
const numbered = (s: string) => s.split('\n').map((l, i) => `${String(i + 1).padStart(3)}| ${l}`).join('\n');

/** Label singkat buat baris aktivitas di obrolan. */
export function toolLabel(c: ToolCall): string {
  const a = args(c);
  switch (c.name) {
    case 'daftar_berkas': return 'Melihat daftar berkas';
    case 'baca_berkas': return `Membaca ${a.path || 'berkas'}`;
    case 'cari': return `Mencari "${(a.teks || '').slice(0, 40)}"`;
    case 'jalankan': return 'Menjalankan proyek';
    case 'cari_web': return `Mencari di web: "${(a.kueri || '').slice(0, 60)}"`;
    case 'buka_halaman': { let h = a.url || 'halaman'; try { h = new URL(a.url).hostname.replace(/^www\./, ''); } catch { /* biarkan */ } return `Membuka ${h}`; }
    default: return `Mengubah ${a.path || 'berkas'}`;
  }
}

/** Alat internet: dijalankan server (SearXNG + pembuka halaman yang aman), tanpa izin karena tidak mengubah apa pun. */
export const WEB_TOOLS = new Set(['cari_web', 'buka_halaman']);
export type WebHasil = { judul: string; url: string };
export type WebOut = { teks: string; gagal: boolean; hasil?: WebHasil[]; url?: string; judul?: string };
export async function webTool(c: ToolCall): Promise<WebOut> {
  const a = args(c);
  try {
    if (c.name === 'cari_web') {
      const r = await api.post<{ teks: string; hasil: WebHasil[] }>('/api/orvi/web/cari', { kueri: (a.kueri || '').slice(0, 300) });
      return { teks: r.teks, gagal: !r.hasil?.length, hasil: (r.hasil || []).slice(0, 6).map(h => ({ judul: h.judul, url: h.url })) };
    }
    const r = await api.post<{ teks: string; url?: string; judul?: string }>('/api/orvi/web/buka', { url: (a.url || '').slice(0, 1000) });
    return { teks: r.teks, gagal: !r.url, url: r.url, judul: r.judul };
  } catch (e) {
    return { teks: e instanceof ApiError ? `Gagal: ${e.message}` : 'Gagal menghubungi internet.', gagal: true };
  }
}

/** Nama situs tanpa www (buat label dan chip sumber). */
export const host = (url?: string) => { try { return new URL(url || '').hostname.replace(/^www\./, ''); } catch { return url || ''; } };
/** Warna tetap per situs buat ikon huruf di hasil pencarian dan chip sumber. */
export const hue = (s: string) => { let x = 0; for (const ch of s) x = (x * 31 + ch.charCodeAt(0)) % 360; return x; };

/** Alat baca: langsung dijalankan, tanpa izin. */
export function readTool(c: ToolCall, t: OrviTools): string {
  const a = args(c);
  if (c.name === 'daftar_berkas') { const l = t.list(); return l.length ? l.join('\n') : '(proyek kosong)'; }
  if (c.name === 'baca_berkas') { const s = t.read(a.path || ''); return s === null ? `Berkas "${a.path}" tidak ada. Pakai daftar_berkas.` : s ? numbered(s) : '(berkas kosong)'; }
  if (c.name === 'cari') {
    const q = (a.teks || '').toLowerCase(); if (!q) return 'Teks yang dicari kosong.';
    const out: string[] = [];
    for (const f of t.list()) (t.read(f) || '').split('\n').forEach((l, i) => { if (out.length < 80 && l.toLowerCase().includes(q)) out.push(`${f}:${i + 1}: ${l.trim().slice(0, 160)}`); });
    return out.length ? out.join('\n') : 'Tidak ketemu.';
  }
  return 'Alat tidak dikenal.';
}

/** Usulan perubahan dari ubah_berkas/tulis_berkas: isi sebelum dan sesudah, atau pesan error buat model. */
export function proposal(c: ToolCall, t: OrviTools): { path: string; before: string | null; after: string } | { error: string } {
  const a = args(c), path = (a.path || '').trim().replace(/^\/+/, '');
  if (!path) return { error: 'Path berkas kosong.' };
  if (!t.canEdit) return { error: 'Proyek ini hanya bisa dilihat, tidak bisa diubah.' };
  const before = t.read(path);
  if (c.name === 'tulis_berkas') return { path, before, after: a.isi ?? '' };
  if (before === null) return { error: `Berkas "${path}" tidak ada. Pakai tulis_berkas untuk bikin berkas baru.` };
  const cari = a.cari ?? '';
  if (!cari) return { error: 'Teks `cari` kosong.' };
  const n = before.split(cari).length - 1;
  if (n === 0) return { error: 'Teks `cari` tidak ditemukan persis di berkas. Baca ulang berkasnya, lalu salin potongannya persis.' };
  if (n > 1) return { error: `Teks \`cari\` muncul ${n} kali. Pakai potongan yang lebih panjang supaya unik.` };
  return { path, before, after: before.replace(cari, () => a.ganti ?? '') };
}

export type DiffLine = { k: ' ' | '+' | '-' | '…'; t: string; n?: number };

/** Diff baris sederhana (LCS) dengan 2 baris konteks; berkas besar diringkas. */
export function diff(before: string, after: string): DiffLine[] {
  const a = before ? before.split('\n') : [], b = after.split('\n');
  let s = 0; while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let e = 0; while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  const A = a.slice(s, a.length - e), B = b.slice(s, b.length - e);
  const mid: DiffLine[] = [];
  if (A.length * B.length > 250000) { A.forEach(t => mid.push({ k: '-', t })); B.forEach(t => mid.push({ k: '+', t })); }
  else {
    const L = Array.from({ length: A.length + 1 }, () => new Uint16Array(B.length + 1));
    for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0, j = 0;
    while (i < A.length || j < B.length) {
      if (i < A.length && j < B.length && A[i] === B[j]) { mid.push({ k: ' ', t: A[i] }); i++; j++; }
      else if (i < A.length && (j >= B.length || L[i + 1][j] >= L[i][j + 1])) { mid.push({ k: '-', t: A[i] }); i++; }  // yang lama dulu, baru yang baru
      else { mid.push({ k: '+', t: B[j] }); j++; }
    }
  }
  const all: DiffLine[] = [...a.slice(0, s).map(t => ({ k: ' ' as const, t })), ...mid, ...a.slice(a.length - e).map(t => ({ k: ' ' as const, t }))];
  let n = 0; all.forEach(l => { if (l.k !== '-') l.n = ++n; });
  // sisakan 2 baris konteks di sekitar perubahan
  const keep = new Set<number>();
  all.forEach((l, i) => { if (l.k !== ' ') for (let d = -2; d <= 2; d++) keep.add(i + d); });
  const out: DiffLine[] = [];
  all.forEach((l, i) => { if (keep.has(i)) out.push(l); else if (out[out.length - 1]?.k !== '…') out.push({ k: '…', t: '' }); });
  return out.slice(0, 400);
}
