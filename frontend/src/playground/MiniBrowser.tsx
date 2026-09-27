import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../design/Icon';
import { cx } from '../design/ui';

export type Device = 'desktop' | 'tablet' | 'phone';
export type ConsoleLine = { t: string; text: string };

/* Script kecil yang disisipkan ke halaman pratinjau: meneruskan console.log dan error ke Orvella lewat postMessage.
   Iframe tanpa allow-same-origin, jadi halaman siswa tidak bisa menyentuh sesi Orvella. */
export const BRIDGE = `<script>(()=>{const s=(t,a)=>{try{parent.postMessage({__orv:1,t,a:[].map.call(a,x=>{try{return typeof x==='string'?x:JSON.stringify(x)}catch(e){return String(x)}})},'*')}catch(e){}};['log','info','warn','error'].forEach(k=>{const o=console[k];console[k]=function(){s(k,arguments);return o.apply(console,arguments)}});addEventListener('error',e=>s('error',[e.message+(e.lineno?' (baris '+e.lineno+')':'')]));})()<\/script>`;

export function withBridge(html: string) {
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, m => m + BRIDGE);
  return BRIDGE + html;
}

/** A small browser: address bar, reload, device widths, optional console captured from the page. */
export function MiniBrowser({ src, srcDoc, url, onReload, right, onNavigate, reloadKey = 0, showConsole = true, minHeight, sandbox }: {
  src?: string; srcDoc?: string; url: string; onReload?: () => void; right?: ReactNode; onNavigate?: (path: string) => void;
  reloadKey?: number; showConsole?: boolean; minHeight?: number; sandbox?: string;
}) {
  const [device, setDevice] = useState<Device>('desktop');
  const [logs, setLogs] = useState<ConsoleLine[]>([]);
  const [addr, setAddr] = useState(url);
  const [k, setK] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => setAddr(url), [url]);
  useEffect(() => { setLogs([]); }, [srcDoc, src, reloadKey, k]);
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !e.data || e.data.__orv !== 1) return;
      setLogs(l => [...l.slice(-199), { t: String(e.data.t), text: (e.data.a || []).join(' ') }]);
    };
    addEventListener('message', on);
    return () => removeEventListener('message', on);
  }, []);
  const reload = () => { setK(x => x + 1); onReload?.(); };
  return (
    <div className="mini-browser" style={minHeight ? { minHeight } : undefined}>
      <div className="mb-bar">
        <span className="mb-dots" aria-hidden="true"><i /><i /><i /></span>
        <button className="btn btn-ghost btn-icon btn-sm" aria-label="Muat ulang" title="Muat ulang" onClick={reload}><Icon name="refresh-cw" /></button>
        <form className="mb-url" onSubmit={e => { e.preventDefault(); onNavigate?.(addr); }}>
          <Icon name={src ? 'globe' : 'lock'} size={14} />
          <input value={addr} onChange={e => setAddr(e.target.value)} readOnly={!onNavigate} aria-label="Alamat halaman" spellCheck={false} />
        </form>
        <div className="segmented hide-sm" role="group" aria-label="Lebar layar">
          {([['phone', 'smartphone', 'HP'], ['tablet', 'tablet', 'Tablet'], ['desktop', 'monitor', 'Desktop']] as const).map(([d, ic, label]) => (
            <button key={d} aria-pressed={device === d} title={label} aria-label={label} onClick={() => setDevice(d)}><Icon name={ic} size={14} /></button>
          ))}
        </div>
        {right}
      </div>
      <div className={cx('mb-stage', device === 'phone' && 'is-phone', device === 'tablet' && 'is-tablet')}>
        <iframe key={`${reloadKey}-${k}`} ref={frame} title="Pratinjau" src={src} srcDoc={srcDoc}
          sandbox={sandbox ?? 'allow-scripts allow-forms allow-modals allow-popups'} />
      </div>
      {showConsole && logs.length > 0 && (
        <div className="mb-console" aria-label="Console halaman">
          {logs.map((l, i) => <div key={i} className={l.t === 'error' ? 'is-err' : undefined}>{l.t === 'error' ? '✗ ' : '› '}{l.text}</div>)}
        </div>
      )}
    </div>
  );
}
