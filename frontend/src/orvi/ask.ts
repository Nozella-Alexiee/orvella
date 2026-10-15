/* Penghubung ke app Orvi AI: dari Sandbox, bab, atau Spotlight, kirim pertanyaan + konteks (kode, error, bab),
   lalu buka jendela Orvi AI. Jendelanya membaca `pending` lalu mengosongkannya. */
import { create } from 'zustand';

export type Konteks = { bahasa?: string; kode?: string; error?: string; berkas?: string; bab?: string; baris?: number | null };
export type Pending = { pertanyaan?: string; konteks?: Konteks; t: number };

export const useOrviAsk = create<{ pending: Pending | null; set: (p: Pending | null) => void }>(set => ({ pending: null, set: p => set({ pending: p }) }));

/** Buka Orvi AI. Tanpa pertanyaan = cuma memasang konteks (misalnya bab) dan memfokuskan kolom ketik. */
export function askOrviAbout(p: Omit<Pending, 't'> = {}) {
  useOrviAsk.getState().set({ ...p, t: Date.now() });
  dispatchEvent(new CustomEvent('os:nav', { detail: '/orvi' }));
}

/** Penyedia alat untuk Orvi: Sandbox yang terakhir dibuka/difokuskan mendaftarkan dirinya di sini.
    Orvi membaca dan mengubah berkas lewat ini, jadi selalu memakai isi editor yang sedang terbuka (termasuk ngoding bareng). */
export type OrviTools = {
  id: number;
  title: string;
  bahasa: string;
  canEdit: boolean;
  list: () => string[];
  read: (path: string) => string | null;
  /** Tulis isi berkas (bikin baru kalau belum ada). Kembalikan pesan error, atau null kalau berhasil. */
  write: (path: string, isi: string) => string | null;
  /** Hapus berkas yang tadi dibuat Orvi (dipakai Urungkan). */
  remove: (path: string) => void;
  /** Jalankan proyek, kembalikan ringkasan keluaran dan error. */
  run: () => Promise<string>;
  /** Efek membaca: sinar menyapu editor kalau berkas itu sedang terbuka, atau barisnya berkedip di daftar berkas. */
  scan?: (path: string) => void;
  /** Buka berkas, gulir ke baris itu, lalu kembalikan posisinya di layar (tujuan animasi). null kalau editornya tidak kelihatan. */
  lineRect?: (path: string, line: number) => Promise<DOMRect | null>;
  /** Kilatan hijau di baris yang barusan diubah Orvi. */
  flash?: (path: string, line: number, count?: number) => void;
};

/** tools = Sandbox yang terhubung; working = id proyek yang sedang dikerjakan Orvi (tombol Orvi AI di Sandbox itu menyala). */
export const useOrviTools = create<{ tools: OrviTools | null; working: number | null; set: (t: OrviTools | null) => void; setWorking: (id: number | null) => void }>(set => ({
  tools: null, working: null, set: t => set({ tools: t }), setWorking: id => set({ working: id }) }));

// Semua Sandbox yang terbuka, yang terakhir disentuh di ujung. Kalau satu ditutup, Orvi pindah ke Sandbox berikutnya.
const open: OrviTools[] = [];
/** Daftarkan Sandbox yang baru dibuka (langsung jadi yang terhubung). Kembalikan fungsi untuk melepasnya. */
export function provideTools(t: OrviTools): () => void {
  claimTools(t);
  return () => {
    const i = open.indexOf(t); if (i >= 0) open.splice(i, 1);
    if (useOrviTools.getState().tools === t) useOrviTools.getState().set(open[open.length - 1] || null);
  };
}
/** Sandbox ini yang terhubung ke Orvi (dipanggil saat jendelanya disentuh atau jadi aktif). */
export function claimTools(t: OrviTools) {
  const i = open.indexOf(t); if (i >= 0) open.splice(i, 1);
  open.push(t);
  if (useOrviTools.getState().tools !== t) useOrviTools.getState().set(t);
}
