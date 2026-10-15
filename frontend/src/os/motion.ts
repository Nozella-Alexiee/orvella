/* Gerak jendela ala macOS: kurva pegas, penanda "jendela lagi bergerak", dan lapisan GPU sementara.
   Selama jendela diseret/dianimasikan, animasi latar (wallpaper hidup, Orvi) diam sebentar lewat osBusy(),
   jadi kaca blur di semua jendela tidak perlu dihitung ulang tiap frame.
   Animasi memakai jeda berbasis waktu (pasti selesai sendiri); seret/ubah ukuran memakai penghitung yang
   kedaluwarsa kalau 8 detik tidak disegarkan, jadi tidak pernah "nyangkut" diam selamanya. */
import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { Flip } from 'gsap/Flip';
import { InertiaPlugin } from 'gsap/InertiaPlugin';

gsap.registerPlugin(CustomEase, Flip, InertiaPlugin);
/** Pegas lembut dengan sedikit lewatan (2%), dipakai buka, maksimal, snap, dan Semua jendela. */
export const SPRING = CustomEase.create('osSpring', 'M0,0 C0.14,0.76 0.26,1.02 0.46,1.02 0.66,1.02 0.8,1 1,1');

const busy = { n: 0, t: 0, until: 0 };
export const holdOn = () => { busy.n++; busy.t = performance.now(); };
export const holdOff = () => { busy.n = Math.max(0, busy.n - 1); };
export const touchHold = () => { busy.t = performance.now(); };
/** Diam sebentar selama `sec` detik (durasi animasi). */
export const pause = (sec: number) => { busy.until = Math.max(busy.until, performance.now() + sec * 1000 + 80); };
export function osBusy(): boolean {
  const now = performance.now();
  if (busy.n && now - busy.t > 8000) busy.n = 0;
  return busy.n > 0 || now < busy.until;
}

/** Desktop tertutup jendela maksimal / Mode Fokus: wallpaper tidak perlu digambar. */
let deskHidden = false;
export const setDeskHidden = (v: boolean) => { deskHidden = v; };
export const isDeskHidden = () => deskHidden;

/** Lapisan GPU cuma selama animasi: jendela diskalakan sebagai gambar, tidak digambar ulang tiap frame. */
export const lift = (el: HTMLElement | null, on: boolean) => { if (el) el.style.willChange = on ? 'transform, opacity' : ''; };

// dipakai modul non-React (orv/orvi.ts) tanpa impor silang
(window as unknown as { __osBusy?: () => boolean }).__osBusy = osBusy;
