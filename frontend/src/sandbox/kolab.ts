/* Klien ngoding bareng: Y.Doc + awareness lewat /ws/kolab/{id} (protokol y-websocket: frame biner = Yjs,
   frame teks = JSON: hello, peers, chat, saved, role, ran, kicked). Menyambung ulang sendiri dengan jeda bertahap.
   Kalau server membuat room baru dari database (generasi berbeda), klien memberi tahu lewat 'reset' supaya Ide
   membuang dokumen lama; kalau generasinya sama, Yjs menggabung perubahan seperti biasa. */
import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

export type KRole = 'owner' | 'edit' | 'view';
export type KPeer = { id: number; name: string; initials: string; role: KRole; color: string };
export type KChat = { from: KPeer; text: string; at: number };
export type KRan = { by: KPeer; ok: boolean; lines: { k: string; t: string }[]; web: boolean };
export type KStatus = 'connecting' | 'online' | 'offline' | 'denied';
type Ev =
  | { t: 'status'; status: KStatus } | { t: 'synced' } | { t: 'hello'; role: KRole; you: KPeer; peers: KPeer[]; chat: KChat[]; live: boolean; viewers: number; rev: number }
  | { t: 'peers'; peers: KPeer[]; live: boolean; viewers: number } | { t: 'chat'; item: KChat } | { t: 'saved'; rev: number } | { t: 'role'; role: KRole }
  | { t: 'ran'; ran: KRan } | { t: 'kicked' } | { t: 'reset' } | { t: 'error'; message: string };

const SYNC = 0, AWARENESS = 1;

export class KolabClient {
  readonly doc = new Y.Doc();
  readonly awareness = new awarenessProtocol.Awareness(this.doc);
  private ws: WebSocket | null = null;
  private retry = 0;
  private timer = 0;
  private ping = 0;
  private alive = true;
  gen: string | null = null;
  synced = false;
  constructor(readonly nid: number, private emit: (e: Ev) => void) {
    this.doc.on('update', (u: Uint8Array, origin: unknown) => {
      if (origin === this) return;
      const e = encoding.createEncoder(); encoding.writeVarUint(e, SYNC); syncProtocol.writeUpdate(e, u); this.send(encoding.toUint8Array(e));
    });
    this.awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      if (origin === this) return;
      const e = encoding.createEncoder(); encoding.writeVarUint(e, AWARENESS);
      encoding.writeVarUint8Array(e, awarenessProtocol.encodeAwarenessUpdate(this.awareness, [...added, ...updated, ...removed]));
      this.send(encoding.toUint8Array(e));
    });
    this.connect();
  }

  get files() { return this.doc.getMap<Y.Text>('files'); }

  private send(data: Uint8Array | string) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(data); }
  json(m: Record<string, unknown>) { this.send(JSON.stringify(m)); }

  private connect() {
    if (!this.alive) return;
    this.emit({ t: 'status', status: 'connecting' });
    const ws = this.ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/kolab/${this.nid}`);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      this.retry = 0;
      this.emit({ t: 'status', status: 'online' });
      const e = encoding.createEncoder(); encoding.writeVarUint(e, SYNC); syncProtocol.writeSyncStep1(e, this.doc); ws.send(encoding.toUint8Array(e));
      if (this.awareness.getLocalState()) {
        const a = encoding.createEncoder(); encoding.writeVarUint(a, AWARENESS);
        encoding.writeVarUint8Array(a, awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID])); ws.send(encoding.toUint8Array(a));
      }
      clearInterval(this.ping); this.ping = window.setInterval(() => this.json({ t: 'ping' }), 25_000);
    };
    ws.onmessage = ev => {
      if (typeof ev.data === 'string') { this.onJson(ev.data); return; }
      const d = decoding.createDecoder(new Uint8Array(ev.data as ArrayBuffer)), kind = decoding.readVarUint(d);
      if (kind === SYNC) {
        const e = encoding.createEncoder(); encoding.writeVarUint(e, SYNC);
        const t = syncProtocol.readSyncMessage(d, e, this.doc, this);
        if (encoding.length(e) > 1) ws.send(encoding.toUint8Array(e));
        if (t === syncProtocol.messageYjsSyncStep2 && !this.synced) { this.synced = true; this.emit({ t: 'synced' }); }
      } else if (kind === AWARENESS) awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(d), this);
    };
    ws.onclose = e => {
      clearInterval(this.ping);
      if (this.ws !== ws) return;
      this.ws = null;
      // teman lain melihat kursor kita hilang; state lokal tetap untuk dipakai lagi setelah tersambung
      awarenessProtocol.removeAwarenessStates(this.awareness, [...this.awareness.getStates().keys()].filter(id => id !== this.doc.clientID), this);
      if (!this.alive) return;
      if ([4401, 4403, 4404].includes(e.code)) { this.alive = false; this.emit({ t: 'status', status: 'denied' }); return; }
      this.emit({ t: 'status', status: 'offline' });
      this.retry = Math.min(this.retry + 1, 5);
      this.timer = window.setTimeout(() => this.connect(), 700 * 2 ** this.retry);
    };
  }

  private onJson(raw: string) {
    let m: Record<string, unknown>;
    try { m = JSON.parse(raw); } catch { return; }
    switch (m.t) {
      case 'hello':
        if (this.gen && m.gen !== this.gen) { this.emit({ t: 'reset' }); return; }
        this.gen = String(m.gen);
        this.emit({ t: 'hello', role: m.role as KRole, you: m.you as KPeer, peers: m.peers as KPeer[], chat: m.chat as KChat[], live: !!m.live, viewers: Number(m.viewers) || 0, rev: Number(m.rev) || 0 });
        break;
      case 'peers': this.emit({ t: 'peers', peers: m.peers as KPeer[], live: !!m.live, viewers: Number(m.viewers) || 0 }); break;
      case 'chat': this.emit({ t: 'chat', item: { from: m.from as KPeer, text: String(m.text), at: Number(m.at) } }); break;
      case 'saved': this.emit({ t: 'saved', rev: Number(m.rev) }); break;
      case 'role': this.emit({ t: 'role', role: m.role as KRole }); break;
      case 'ran': this.emit({ t: 'ran', ran: m as unknown as KRan }); break;
      case 'kicked': this.alive = false; this.emit({ t: 'kicked' }); break;
      case 'error': this.emit({ t: 'error', message: String(m.message) }); break;
    }
  }

  destroy() {
    this.alive = false;
    clearTimeout(this.timer); clearInterval(this.ping);
    awarenessProtocol.removeAwarenessStates(this.awareness, [this.doc.clientID], 'destroy');
    const ws = this.ws; this.ws = null;
    ws?.close();
    this.awareness.destroy();
    this.doc.destroy();
  }
}

export type KolabState = {
  client: KolabClient | null; status: KStatus; synced: boolean; role: KRole | null; you: KPeer | null;
  peers: KPeer[]; chat: KChat[]; live: boolean; viewers: number; rev: number | null; kicked: boolean;
};
const EMPTY: Omit<KolabState, 'client'> = { status: 'connecting', synced: false, role: null, you: null, peers: [], chat: [], live: false, viewers: 0, rev: null, kicked: false };

/** Satu klien per proyek. onRan/onError dipanggil untuk kejadian sekali lewat (hasil Jalankan teman, galat simpan). */
export function useKolab(nid: number, on: boolean, cb: { onRan?: (r: KRan) => void; onError?: (m: string) => void; onReset?: () => void } = {}): KolabState {
  const [st, setSt] = useState<Omit<KolabState, 'client'>>(EMPTY);
  const [client, setClient] = useState<KolabClient | null>(null);
  const [epoch, setEpoch] = useState(0);
  const cbs = useRef(cb); cbs.current = cb;
  useEffect(() => {
    if (!on) return;
    setSt(EMPTY);
    const c = new KolabClient(nid, e => {
      if (e.t === 'status') setSt(s => ({ ...s, status: e.status }));
      else if (e.t === 'synced') setSt(s => ({ ...s, synced: true }));
      else if (e.t === 'hello') setSt(s => ({ ...s, role: e.role, you: e.you, peers: e.peers, chat: e.chat, live: e.live, viewers: e.viewers, rev: e.rev }));
      else if (e.t === 'peers') setSt(s => ({ ...s, peers: e.peers, live: e.live, viewers: e.viewers }));
      else if (e.t === 'chat') setSt(s => ({ ...s, chat: [...s.chat, e.item].slice(-50) }));
      else if (e.t === 'saved') setSt(s => ({ ...s, rev: e.rev }));
      else if (e.t === 'role') setSt(s => ({ ...s, role: e.role }));
      else if (e.t === 'kicked') setSt(s => ({ ...s, kicked: true, status: 'denied' }));
      else if (e.t === 'ran') cbs.current.onRan?.(e.ran);
      else if (e.t === 'error') cbs.current.onError?.(e.message);
      else if (e.t === 'reset') { cbs.current.onReset?.(); setEpoch(x => x + 1); }
    });
    setClient(c);
    return () => { c.destroy(); setClient(null); };
  }, [nid, on, epoch]);
  return { client, ...st };
}

/** Awareness teman (bukan diri sendiri): user, berkas yang dibuka, kapan terakhir mengetik, posisi kursor. */
export type KAware = { clientId: number; user?: { id: number; name: string; color: string; colorLight: string }; file?: string; typing?: number; cursor?: { anchor: unknown; head: unknown } };
export function useAwareness(client: KolabClient | null): KAware[] {
  const [list, setList] = useState<KAware[]>([]);
  useEffect(() => {
    if (!client) { setList([]); return; }
    let t = 0;
    const read = () => { t = 0; setList([...client.awareness.getStates()].filter(([id]) => id !== client.doc.clientID).map(([clientId, s]) => ({ clientId, ...(s as object) }))); };
    const f = () => { if (!t) t = window.setTimeout(read, 150); };
    client.awareness.on('change', f); read();
    const tick = window.setInterval(read, 2000); // "sedang mengetik" hilang sendiri
    return () => { client.awareness.off('change', f); clearTimeout(t); clearInterval(tick); };
  }, [client]);
  return list;
}
