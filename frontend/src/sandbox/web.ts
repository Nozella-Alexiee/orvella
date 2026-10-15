/* Proyek web di Sandbox:
   - statis: dirakit di browser jadi satu srcDoc (CSS & JS lokal ditanam), jadi pratinjau segar tiap mengetik tanpa server;
   - stack lain (Node, Flask, PHP, FastAPI): server dev di runner lewat /api/web/{id}/… (sama dengan Playground). */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import { withBridge } from '../playground/MiniBrowser';

export type SessState = 'stopped' | 'starting' | 'running' | 'exited';
export type ServerStatus = { state: SessState; exit?: number | null; oom?: boolean; since?: number };
type Resp = { status: ServerStatus; stack: string; preview?: string; logs?: { lines: { t: number; text: string }[]; cursor: number } };

const esc = (s: string) => s.replace(/<\/(script|style)/gi, '<\\/$1');
const local = (href: string) => href && !/^([a-z]+:)?\/\//i.test(href) && !href.startsWith('data:') ? href.replace(/^\.?\//, '').split(/[?#]/)[0] : null;

/* iframe pratinjau sengaja tanpa allow-same-origin (kode siswa tidak boleh membaca sesi Orvella),
   jadi localStorage diganti versi di memori, dan tautan ke halaman lain di proyek diteruskan ke Sandbox. */
const SHIM = `<script>(()=>{try{localStorage.length}catch(e){const m=()=>{const d={};return{getItem:k=>k in d?d[k]:null,setItem:(k,v)=>{d[k]=String(v)},removeItem:k=>{delete d[k]},clear:()=>{for(const k in d)delete d[k]},key:i=>Object.keys(d)[i]??null,get length(){return Object.keys(d).length}}};try{Object.defineProperty(window,'localStorage',{value:m(),configurable:true});Object.defineProperty(window,'sessionStorage',{value:m(),configurable:true})}catch(_){}}
addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[href]');if(!a)return;const h=a.getAttribute('href');if(!h||/^([a-z]+:|\\/\\/|#)/i.test(h))return;e.preventDefault();parent.postMessage({__orv:1,t:'nav',a:[h]},'*')},true)})()<\/script>`;

/** index.html + berkas lokalnya → satu dokumen untuk iframe srcdoc. */
export function buildStatic(files: Record<string, string>, entry = 'index.html'): string {
  let html = files[entry] ?? files['index.html'] ?? Object.entries(files).find(([k]) => k.endsWith('.html'))?.[1] ?? '';
  if (!html) return withBridge('<p style="font:16px system-ui;padding:24px;color:#666">Belum ada index.html.</p>');
  html = html.replace(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi, tag => {
    const href = local(/href=["']([^"']+)["']/i.exec(tag)?.[1] || '');
    return href && files[href] !== undefined ? `<style data-file="${href}">\n${esc(files[href])}\n</style>` : tag;
  });
  html = html.replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (tag, a, src, b) => {
    const f = local(src);
    return f && files[f] !== undefined ? `<script${a}${b} data-file="${f}">\n${esc(files[f])}\n</script>` : tag;
  });
  return withBridge(/<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + SHIM) : SHIM + html);
}

export function useWebServer(nid: number, enabled: boolean) {
  const [status, setStatus] = useState<ServerStatus>({ state: 'stopped' });
  const [preview, setPreview] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ t: number; text: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const cursor = useRef(0);

  const apply = useCallback((r: Resp) => {
    setStatus(r.status);
    if (r.preview) setPreview(p => p || r.preview!);
    if (r.status.state === 'stopped') setPreview(null);
    if (r.logs?.lines.length) { cursor.current = r.logs.cursor; setLogs(l => [...l, ...r.logs!.lines].slice(-400)); }
  }, []);
  const poll = useCallback(async () => {
    try { apply(await api.get<Resp>(`/api/web/${nid}/status${cursor.current ? `?since=${cursor.current}` : ''}`)); } catch { /* coba lagi di poll berikutnya */ }
  }, [nid, apply]);
  useEffect(() => { if (enabled) { cursor.current = 0; setLogs([]); void poll(); } }, [enabled, nid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!enabled || status.state === 'stopped') return;
    const t = setInterval(poll, status.state === 'running' ? 2000 : 1200);
    return () => clearInterval(t);
  }, [enabled, status.state, poll]);
  // server yang baru menyala butuh sebentar sebelum melayani halaman
  useEffect(() => {
    if (status.state !== 'running' || (status.since ?? 9) > 2) return;
    const t = setTimeout(() => setReloadKey(k => k + 1), 1500);
    return () => clearTimeout(t);
  }, [status.state, status.since]);

  const act = useCallback(async (what: 'start' | 'stop' | 'restart') => {
    setBusy(true);
    try {
      if (what !== 'start') { await api.post(`/api/web/${nid}/stop`, {}); setStatus({ state: 'stopped' }); setPreview(null); }
      if (what !== 'stop') {
        setStatus({ state: 'starting' }); setLogs([]); cursor.current = 0;
        const r = await api.post<Resp>(`/api/web/${nid}/start`, {});
        apply({ ...r, status: { ...r.status, state: r.status.state === 'running' ? 'starting' : r.status.state } });
        setPreview(r.preview || null);
        setTimeout(poll, 900);
      }
      return null;
    } catch (e) {
      // permintaan bisa terputus padahal server sudah menyala: tanya sekali sebelum menyerah
      if (!(e instanceof ApiError) || e.status === 0 || e.status >= 500) {
        await new Promise(r => setTimeout(r, 1500));
        try { const st = await api.get<Resp>(`/api/web/${nid}/status`); if (st.status.state !== 'stopped') { apply(st); setPreview(st.preview || null); return null; } } catch { /* */ }
      }
      setStatus({ state: 'stopped' });
      return e instanceof ApiError ? e.message : 'Server belum bisa dinyalakan. Coba lagi sebentar.';
    } finally { setBusy(false); }
  }, [nid, apply, poll]);

  return { status, preview, setPreview, logs, clearLogs: () => setLogs([]), busy, act, reloadKey, reload: () => setReloadKey(k => k + 1) };
}
