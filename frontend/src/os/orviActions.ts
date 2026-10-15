/* Aksi Orvi di dock yang dipakai menu bar, klik kanan, dan Spotlight: tanya, tidur/bangun, dansa. */
import { gsap } from 'gsap';
import { motion, sound } from '../fx';
import { greeting } from '../lib/hooks';
import { dockOrvi } from './Dock';
import type { MenuItem } from './Menu';
import { useWM } from './wm';

const ASK: Record<string, string[]> = {
  beranda: ['Klik kanan desktop untuk tambah catatan tempel atau timer fokus.', 'Soal Tebak output ganti tiap hari. Udah jawab yang hari ini?',
    'Klik matahari (atau bulan) di wallpaper buat ganti Siang/Malam.'],
  sandbox: ['Ctrl+Enter menjalankan, Ctrl+S menyimpan snapshot. Error? Aku tandai barisnya.', 'Seret berkas dari komputermu ke jendela ini untuk mengimpornya.',
    'Mau tahu cara kodemu ditulis? Buka Replay.'],
  belajar: ['Kerjakan fasenya urut: Pahami, Perkuat, Kuis, Uji. Gak ada yang dilompatin.', 'Cincin warna di peta nandain fase yang lagi kamu kerjakan.'],
  fokus: ['Esc keluar dari Mode Fokus kalau kamu butuh jendela lain.'],
  galeri: ['Kasih bintang proyek yang kamu suka, atau remix buat bikin versimu sendiri.'],
  musik: ['Lagunya tetap jalan saat kamu pindah jendela. Kontrolnya ada di menu bar.'],
};

export function askOrvi() {
  const o = dockOrvi.current;
  if (!o) return;
  if (o.sleeping()) o.wake();
  const { wins, active } = useWM.getState(), a = wins.find(w => w.id === active && !w.min);
  const list = ASK[a?.app || 'beranda'] || ASK.beranda;
  o.say(list[Math.floor(Math.random() * list.length)], { side: 'top', ms: 4800 });
  sound('pop');
}

export function sleepOrvi() {
  const o = dockOrvi.current;
  if (!o || o.sleeping()) return;
  void o.say('Oke, aku tidur dulu. Colek aku kalau butuh.', { side: 'top', ms: 1900 }).then(() => o.sleep());
}

export function wakeOrvi() {
  const o = dockOrvi.current;
  if (!o) return;
  o.wake();
  window.setTimeout(() => o.say(`${greeting()}! Aku udah bangun.`, { side: 'top', ms: 2600 }), 500);
}

export function danceOrvi() {
  const o = dockOrvi.current, host = o?.host();
  if (!o || !host) return;
  if (o.sleeping()) o.wake();
  o.react('cheer', 3200);
  sound('cheer');
  if (motion() === 'off') { o.say('♪ ♫ ♪', { side: 'top', ms: 2000 }); return; }
  gsap.timeline()
    .to(host, { y: -14, rotate: -12, duration: .22, ease: 'power2.out' })
    .to(host, { y: 0, rotate: 12, duration: .22, ease: 'power2.in' })
    .to(host, { y: -18, rotate: -8, scaleX: .92, duration: .2 })
    .to(host, { y: 0, rotate: 8, scaleX: 1.06, duration: .2 })
    .to(host, { rotate: 360, y: -10, duration: .6, ease: 'back.inOut(1.6)' })
    .to(host, { y: 0, rotate: 0, scaleX: 1, duration: .5, ease: 'elastic.out(1, .4)', clearProps: 'transform' })
    .repeat(1);
  const r = host.getBoundingClientRect();
  ['♪', '♫', '♪', '♬'].forEach((n, i) => {
    const e = document.createElement('span');
    e.className = 'os-note-fly'; e.textContent = n;
    Object.assign(e.style, { left: r.left + r.width / 2 + 'px', top: r.top + 'px' });
    document.body.appendChild(e);
    gsap.fromTo(e, { x: 0, y: 0, opacity: 0, scale: .6 }, { x: (i % 2 ? 1 : -1) * (30 + i * 16), y: -80 - i * 18, opacity: 1, scale: 1.2, rotate: (i % 2 ? 20 : -20),
      duration: 1.1, delay: i * .35, ease: 'power2.out', onComplete: () => gsap.to(e, { opacity: 0, duration: .3, onComplete: () => e.remove() }) });
  });
}

/** Item menu Orvi (klik kanan Orvi di dock dan menu Orvella di menu bar). */
export function orviActions(): MenuItem[] {
  const sleeping = !!dockOrvi.current?.sleeping();
  return [['label', 'Orvi'], ['orvi-ai', 'Buka Orvi AI', () => dispatchEvent(new CustomEvent('os:nav', { detail: '/orvi' }))], ['message-circle', 'Tip Orvi', askOrvi],
    sleeping ? ['sun-moon', 'Bangunkan Orvi', wakeOrvi] : ['moon', 'Tidurkan Orvi', sleepOrvi],
    ['music', 'Orvi dansa', danceOrvi]];
}
