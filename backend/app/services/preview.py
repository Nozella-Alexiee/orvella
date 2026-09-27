"""Links into the preview proxy: signed, time-limited tokens and the public origin the browser should use."""
from __future__ import annotations

import hashlib
import hmac
import time
from urllib.parse import quote, urlsplit

import httpx
from fastapi import Request

from ..config import settings

TTL = 12 * 3600
_tunnel: tuple[float, str] = (0.0, "")


def token(sid: str, user_id: int, ttl: int = TTL) -> str:
    body = f"v1.{sid}.{user_id}.{int(time.time()) + ttl}"
    sig = hmac.new(settings.preview_secret.encode(), body.encode(), hashlib.sha256).hexdigest()[:40]
    return f"{body}.{sig}"


def _tunnel_host() -> str:
    """Hostname of the preview quick tunnel, read from cloudflared's metrics server (cached for a minute)."""
    global _tunnel
    if not settings.preview_metrics:
        return ""
    at, host = _tunnel
    if host and time.time() - at < 60:
        return host
    try:
        r = httpx.get(settings.preview_metrics.rstrip("/") + "/quicktunnel", timeout=2)
        host = (r.json() or {}).get("hostname", "") if r.status_code == 200 else ""
    except (httpx.HTTPError, ValueError):
        host = ""
    _tunnel = (time.time(), host)
    return host


def origin(request: Request) -> str:
    if settings.preview_public_url:
        return settings.preview_public_url.rstrip("/")
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or "localhost"
    hostname = urlsplit(f"//{host}").hostname or "localhost"
    if hostname.endswith(".trycloudflare.com"):
        th = _tunnel_host()
        if th:
            return f"https://{th}"
    # LAN / localhost: the proxy speaks plain HTTP on its own port (an HTTPS site needs PREVIEW_PUBLIC_URL)
    return f"http://{hostname}:{settings.preview_port}"


def enter_url(request: Request, sid: str, user_id: int, path: str = "/") -> str:
    return f"{origin(request)}/__orv/enter?t={quote(token(sid, user_id))}&p={quote(path or '/')}"
