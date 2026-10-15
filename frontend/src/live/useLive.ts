/* Koneksi /ws/live/{pin} untuk layar host dan pemain. Pesan terakhir per jenis disimpan; menyambung ulang sendiri
   (permainan tetap ada di server, skor pemain tidak hilang). */
import { useCallback, useEffect, useRef, useState } from 'react';

export type LivePlayer = { id: number; name: string; initials: string; score?: number };
export type LiveQ = { t: string; c?: string; o: string[] };
export type LiveMsg = { t: string; [k: string]: unknown };
export type LiveStatus = 'connecting' | 'open' | 'retry' | 'notfound' | 'forbidden' | 'late' | 'kicked' | 'closed';

export const SHAPES = [
  { key: 'segitiga', glyph: '▲', color: '#FF5E57' },
  { key: 'wajik', glyph: '◆', color: '#3D8BFF' },
  { key: 'bulat', glyph: '●', color: '#E8A200' },
  { key: 'kotak', glyph: '■', color: '#10B98A' },
] as const;

export function useLive(pin: string | null) {
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [msg, setMsg] = useState<LiveMsg | null>(null);
  const [lobby, setLobby] = useState<LiveMsg | null>(null);
  const [answered, setAnswered] = useState<{ index: number; count: number; total: number } | null>(null);
  const ws = useRef<WebSocket | null>(null);
  useEffect(() => {
    if (!pin) return;
    let alive = true, retry = 0, timer = 0, ping = 0;
    const connect = () => {
      setStatus('connecting');
      const s = ws.current = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/live/${pin}`);
      s.onopen = () => { retry = 0; setStatus('open'); clearInterval(ping); ping = window.setInterval(() => s.readyState === 1 && s.send('{"t":"ping"}'), 25_000); };
      s.onmessage = e => {
        let m: LiveMsg; try { m = JSON.parse(e.data); } catch { return; }
        if (m.t === 'pong') return;
        if (m.t === 'lobby') setLobby(m);
        if (m.t === 'kicked') setStatus('kicked');
        // "answered" hanya menambah hitungan; soal tetap tampil
        if (m.t === 'answered') { setAnswered({ index: Number(m.index), count: Number(m.count ?? 0), total: Number(m.total ?? 0) }); return; }
        if (m.t === 'question') setAnswered(null);
        setMsg(m);
      };
      s.onclose = e => {
        clearInterval(ping);
        if (!alive || ws.current !== s) return;
        const fatal: Record<number, LiveStatus> = { 4404: 'notfound', 4403: 'forbidden', 4409: 'late', 4401: 'forbidden' };
        if (fatal[e.code]) { setStatus(s2 => (s2 === 'kicked' ? s2 : fatal[e.code])); return; }
        setStatus('retry');
        retry = Math.min(retry + 1, 5);
        timer = window.setTimeout(connect, 600 * 2 ** retry);
      };
    };
    connect();
    return () => { alive = false; clearTimeout(timer); clearInterval(ping); const s = ws.current; ws.current = null; s?.close(); setStatus('closed'); };
  }, [pin]);
  const send = useCallback((m: LiveMsg) => { if (ws.current?.readyState === 1) ws.current.send(JSON.stringify(m)); }, []);
  return { status, msg, lobby, answered, send };
}

/** Sisa detik soal berjalan (dari "left" server kalau ada, lalu dihitung di klien). */
export function useCountdown(msg: LiveMsg | null) {
  const [now, setNow] = useState(Date.now());
  const t0 = useRef({ at: 0, total: 0, key: '' });
  const key = msg?.t === 'question' ? `${msg.index}` : '';
  if (key && key !== t0.current.key) t0.current = { key, at: Date.now(), total: 1000 * Number(msg!.left ?? msg!.seconds ?? 20) };
  useEffect(() => { if (!key) return; const t = window.setInterval(() => setNow(Date.now()), 200); return () => clearInterval(t); }, [key]);
  if (!key) return { left: 0, frac: 0 };
  const left = Math.max(0, t0.current.total - (now - t0.current.at));
  return { left, frac: left / (1000 * Number(msg!.seconds ?? 20)) };
}
