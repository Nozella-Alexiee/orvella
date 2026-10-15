/* Pesan realtime pribadi dari /ws/presence (os/presence.ts meneruskannya sebagai 'orvella:rt'):
   undangan ngoding bareng, tantangan duel, permintaan bantuan (mentor), dan kabar bantuan (siswa). */
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { toast } from '../design/toast';
import { sound } from '../fx';
import { dockOrvi } from './Dock';

type Rt = { t: string; [k: string]: unknown };
const first = (n: unknown) => String(n || '').split(' ')[0];

export function Realtime() {
  const nav = useNavigate();
  const qc = useQueryClient();
  useEffect(() => {
    const f = (e: Event) => {
      const m = (e as CustomEvent<Rt>).detail;
      const from = m.from as { name?: string } | undefined;
      if (m.t === 'invite' && m.kind === 'kolab') {
        const p = m.project as { id: number; title: string };
        sound('pop'); void dockOrvi.current?.react('happy', 1200);
        toast({ icon: 'users', title: `${first(from?.name)} ngajak ngoding bareng`, body: `Proyek <b>${p.title}</b>${m.role === 'view' ? ' (lihat saja)' : ''}.`,
          actions: [{ label: 'Buka', primary: true, run: () => nav(`/sandbox/${p.id}`) },
            { label: 'Tolak', run: async () => { const me = qc.getQueryData<{ id: number }>(['/api/me']); if (me) await api.del(`/api/sandbox/${p.id}/members/${me.id}`).catch(() => {}); } }] });
      } else if (m.t === 'duel') {
        const id = Number(m.id), who = first(from?.name);
        if (m.ev === 'invite') {
          sound('pop'); dockOrvi.current?.react('happy', 1200);
          toast({ icon: 'swords', title: `${who} menantangmu duel ${m.lang || ''}`.trim(), body: '5 soal, 5 menit. Berani?', ms: 30000,
            actions: [{ label: 'Terima', primary: true, run: async () => { try { await api.post(`/api/duel/${id}/terima`); nav(`/duel/${id}`); } catch { toast({ kind: 'danger', icon: 'swords', title: 'Tantangannya sudah tidak berlaku' }); } } },
              { label: 'Nanti', run: () => {} }] });
        } else if (m.ev === 'start') { toast({ kind: 'success', icon: 'swords', title: `${who} menerima tantanganmu!`, body: 'Siap-siap, duel dimulai.' }); nav(`/duel/${id}`); }
        else if (m.ev === 'declined') toast({ icon: 'swords', title: `${who} belum bisa duel sekarang` });
        dispatchEvent(new CustomEvent('orvella:rt:duel', { detail: m }));
      } else if (m.t === 'help') {
        // mentor yang sedang di Orvella OS (di halaman mentor, HelpQueue yang menampilkan)
        const r = m.request as { id: number; context: string; context_label: string; ref: string; message: string; learner?: { id: number; name: string } };
        if (m.ev === 'new' && !document.querySelector('.hq')) {
          sound('pop');
          toast({ icon: 'hand', title: `${first(r.learner?.name)} angkat tangan`, body: `${r.context_label}${r.message ? `: ${r.message}` : ''}`, ms: 20000,
            actions: [{ label: 'Bantu', primary: true, run: async () => { await api.post(`/api/bantuan/${r.id}/ambil`).catch(() => {}); nav(r.context === 'sandbox' ? r.ref : `/mentor/siswa/${r.learner?.id}`); } },
              { label: 'Nanti', run: () => {} }] });
        }
      } else if (m.t === 'kuis-live') {
        sound('pop'); dockOrvi.current?.react('happy', 1200);
        toast({ icon: 'presentation', title: `${first(m.host as string)} memulai kuis langsung`, body: `${String(m.title)} · PIN <b>${String(m.pin)}</b>`, ms: 60000,
          actions: [{ label: 'Gabung', primary: true, run: () => nav(`/gabung/${String(m.pin)}`) }, { label: 'Nanti', run: () => {} }] });
      } else if (m.t === 'rt:refresh' && typeof m.key === 'string') {
        void qc.invalidateQueries({ queryKey: [m.key] });
      } else {
        dispatchEvent(new CustomEvent(`orvella:rt:${m.t}`, { detail: m }));
      }
    };
    const go = (e: Event) => nav((e as CustomEvent<string>).detail);
    addEventListener('orvella:rt', f); addEventListener('os:nav', go);
    return () => { removeEventListener('orvella:rt', f); removeEventListener('os:nav', go); };
  }, [nav, qc]);
  return null;
}
