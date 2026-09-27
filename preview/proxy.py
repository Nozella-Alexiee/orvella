"""Orvella preview proxy.

    GET /__orv/enter?t=<token>&p=/path   → checks the token (HMAC from the app), stores it in a cookie, redirects to /path
    everything else                      → forwarded to the learner's dev server  http://orv-ws-<sid>:8080  (HTTP and WebSocket)

The token is `v1.<sid>.<uid>.<exp>.<sig>` signed with PREVIEW_SECRET (shared with the app only).
Orvella's own session cookie is never forwarded to learner code.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import html
import os
import re
import time
from urllib.parse import quote

import aiohttp
from aiohttp import web

SECRET = os.environ.get("PREVIEW_SECRET", "")
PORT = int(os.environ.get("PREVIEW_PORT_INTERNAL", "8301"))
COOKIE = "orv_pv"
APP_COOKIE = os.environ.get("APP_COOKIE", "orvella_session")
SID = re.compile(r"^p\d{1,10}$")
HOP = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailers", "transfer-encoding", "upgrade",
       "host", "content-length"}

if len(SECRET) < 16:
    raise SystemExit("PREVIEW_SECRET wajib diisi (minimal 16 karakter).")


def verify(token: str) -> str | None:
    try:
        v, sid, uid, exp, sig = token.split(".")
    except ValueError:
        return None
    body = f"{v}.{sid}.{uid}.{exp}"
    good = hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()[:40]
    if v != "v1" or not SID.match(sid) or not hmac.compare_digest(sig, good):
        return None
    try:
        if int(exp) < time.time():
            return None
    except ValueError:
        return None
    return sid


def page(title: str, body: str, status: int = 200, refresh: int | None = None) -> web.Response:
    meta = f'<meta http-equiv="refresh" content="{refresh}">' if refresh else ""
    doc = f"""<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">{meta}
<title>{html.escape(title)}</title><style>
body{{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#FFF8EC;color:#2B2350}}
.box{{max-width:420px;padding:32px;text-align:center}} .orb{{width:64px;height:64px;margin:0 auto 16px;border-radius:50%;
background:radial-gradient(circle at 35% 35%,#FFE39A,#FFB224 60%,#E8930C);box-shadow:0 0 0 8px #FFB22422;animation:b 1.6s ease-in-out infinite}}
@keyframes b{{50%{{transform:translateY(-6px)}}}} h1{{font-size:20px;margin:0 0 8px}} p{{margin:0;color:#5B5480;line-height:1.5}}
</style></head><body><div class="box"><div class="orb"></div><h1>{html.escape(title)}</h1><p>{body}</p></div></body></html>"""
    return web.Response(text=doc, status=status, content_type="text/html", headers={"Cache-Control": "no-store"})


def secure(req: web.Request) -> bool:
    return req.headers.get("X-Forwarded-Proto", req.scheme) == "https"


async def enter(req: web.Request) -> web.StreamResponse:
    token = req.query.get("t", "")
    sid = verify(token)
    if not sid:
        return page("Tautan pratinjau kedaluwarsa", "Buka lagi pratinjau dari Orvella.", 401)
    target = req.query.get("p", "/")
    if not target.startswith("/") or target.startswith("//"):
        target = "/"
    resp = web.Response(status=302, headers={"Location": target, "Cache-Control": "no-store"})
    if secure(req):
        # a third-party cookie inside Orvella's iframe: must be SameSite=None; Secure, and Partitioned (CHIPS)
        resp.headers.add("Set-Cookie", f"{COOKIE}={token}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=43200")
    else:
        resp.set_cookie(COOKIE, token, path="/", httponly=True, samesite="Lax", max_age=43200)
    return resp


def _cookie_header(req: web.Request) -> str | None:
    raw = req.headers.get("Cookie")
    if not raw:
        return None
    keep = [c.strip() for c in raw.split(";") if c.strip() and c.strip().split("=", 1)[0] not in (COOKIE, APP_COOKIE)]
    return "; ".join(keep) or None


async def proxy(req: web.Request) -> web.StreamResponse:
    sid = verify(req.cookies.get(COOKIE, ""))
    if not sid:
        return page("Pratinjau belum dibuka", "Jalankan proyekmu di Orvella, lalu buka pratinjaunya dari sana. "
                    "Kalau browser memblokir cookie di dalam bingkai, pakai tombol <b>Buka di tab baru</b>.", 401)
    upstream = f"http://orv-ws-{sid}:8080{req.rel_url}"
    headers = {k: v for k, v in req.headers.items() if k.lower() not in HOP and k.lower() != "cookie"}
    ck = _cookie_header(req)
    if ck:
        headers["Cookie"] = ck
    headers["X-Forwarded-Host"] = req.host
    headers["X-Forwarded-Proto"] = req.headers.get("X-Forwarded-Proto", req.scheme)

    if req.headers.get("Upgrade", "").lower() == "websocket":
        return await _websocket(req, upstream.replace("http://", "ws://", 1), headers)

    session: aiohttp.ClientSession = req.app["client"]
    body = await req.read() if req.can_read_body else None
    try:
        async with session.request(req.method, upstream, headers=headers, data=body, allow_redirects=False,
                                   timeout=aiohttp.ClientTimeout(total=60, sock_connect=2)) as up:
            out = web.StreamResponse(status=up.status, reason=up.reason)
            for k, v in up.headers.items():
                if k.lower() not in HOP:
                    out.headers.add(k, v)
            out.headers["X-Orvella-Preview"] = sid
            await out.prepare(req)
            async for chunk in up.content.iter_chunked(64 * 1024):
                await out.write(chunk)
            await out.write_eof()
            return out
    except (aiohttp.ClientConnectorError, aiohttp.ServerDisconnectedError, ConnectionResetError):
        return page("Server sedang menyala…", "Aplikasimu belum siap menerima permintaan. Halaman ini akan mencoba lagi otomatis.", 502, refresh=2)
    except asyncio.TimeoutError:
        return page("Server tidak menjawab", "Aplikasimu terlalu lama menjawab (lebih dari 60 detik). Cek log di Orvella.", 504)


async def _websocket(req: web.Request, url: str, headers: dict[str, str]) -> web.StreamResponse:
    client_ws = web.WebSocketResponse()
    await client_ws.prepare(req)
    session: aiohttp.ClientSession = req.app["client"]
    fwd = {k: v for k, v in headers.items() if not k.lower().startswith("sec-websocket")}
    try:
        async with session.ws_connect(url, headers=fwd, timeout=aiohttp.ClientWSTimeout(ws_close=5)) as up:
            async def pump(src, dst):
                async for msg in src:
                    if msg.type == aiohttp.WSMsgType.TEXT:
                        await dst.send_str(msg.data)
                    elif msg.type == aiohttp.WSMsgType.BINARY:
                        await dst.send_bytes(msg.data)
                    else:
                        break
            await asyncio.wait([asyncio.create_task(pump(client_ws, up)), asyncio.create_task(pump(up, client_ws))],
                               return_when=asyncio.FIRST_COMPLETED)
    except aiohttp.ClientError:
        pass
    await client_ws.close()
    return client_ws


async def health(req: web.Request) -> web.Response:
    return web.json_response({"ok": True})


async def _client(app: web.Application):
    app["client"] = aiohttp.ClientSession(auto_decompress=False, cookie_jar=aiohttp.DummyCookieJar())
    yield
    await app["client"].close()


def make_app() -> web.Application:
    app = web.Application(client_max_size=8 * 1024 * 1024)
    app.cleanup_ctx.append(_client)
    app.router.add_get("/__orv/health", health)
    app.router.add_get("/__orv/enter", enter)
    app.router.add_route("*", "/{tail:.*}", proxy)
    return app


if __name__ == "__main__":
    web.run_app(make_app(), host="0.0.0.0", port=PORT, access_log=None)
