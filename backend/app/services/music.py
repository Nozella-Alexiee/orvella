"""Musik (Orvella OS) in embed mode: turns Spotify / Apple Music links into official embed
players. Students log in inside the provider's own player, so Orvella never sees their
account. Admins can switch the app off and edit the curated playlists."""
from __future__ import annotations

import re
import time
from typing import Any

import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models import AppSetting, now

SPOTIFY = re.compile(r"^https://open\.spotify\.com/(?:intl-[a-z]{2}(?:-[a-z]{2})?/)?(playlist|album|track|episode|show|artist)/([A-Za-z0-9]{22})(?:[/?#].*)?$")
APPLE = re.compile(r"^https://(?:embed\.)?music\.apple\.com/([a-z]{2})/(playlist|album|song|station)/(?:([^/?#]+)/)?([A-Za-z0-9.\-]+)(\?[^#]*)?$")
CURATED = [
    {"provider": "spotify", "title": "lofi beats", "url": "https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn"},
    {"provider": "spotify", "title": "Deep Focus", "url": "https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ"},
    {"provider": "spotify", "title": "Brain Food", "url": "https://open.spotify.com/playlist/37i9dQZF1DWXLeA8Omikj7"},
]
_cache: dict[str, tuple[float, dict[str, Any]]] = {}
CACHE_S = 3600


def parse(url: str) -> dict[str, Any]:
    url = (url or "").strip()
    m = SPOTIFY.match(url)
    if m:
        kind, sid = m.group(1), m.group(2)
        return {"provider": "spotify", "kind": kind, "id": sid, "open_url": f"https://open.spotify.com/{kind}/{sid}",
                "embed_url": f"https://open.spotify.com/embed/{kind}/{sid}?utm_source=orvella", "uri": f"spotify:{kind}:{sid}"}
    m = APPLE.match(url)
    if m:
        cc, kind, slug, aid, query = m.group(1), m.group(2), m.group(3) or "", m.group(4), m.group(5) or ""
        # ?i=<lagu> hanya yang boleh ikut; parameter lain dibuang
        song = re.search(r"[?&]i=(\d{1,20})", query)
        tail = f"{slug + '/' if slug else ''}{aid}" + (f"?i={song.group(1)}" if song else "")
        return {"provider": "apple", "kind": kind, "id": aid, "open_url": f"https://music.apple.com/{cc}/{kind}/{tail}",
                "embed_url": f"https://embed.music.apple.com/{cc}/{kind}/{tail}", "title_hint": slug.replace("-", " ").strip()}
    raise HTTPException(400, "Itu bukan link Spotify atau Apple Music yang dikenali.")


def resolve(url: str) -> dict[str, Any]:
    info = parse(url)
    key = info["open_url"]
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_S:
        return hit[1]
    out = {k: info[k] for k in ("provider", "kind", "id", "open_url", "embed_url") if k in info}
    out["title"] = info.get("title_hint") or ""
    out["thumb"] = None
    if info["provider"] == "spotify":
        try:
            r = httpx.get("https://open.spotify.com/oembed", params={"url": info["open_url"]}, timeout=4.0)
            if r.status_code == 200:
                d = r.json()
                out["title"] = str(d.get("title") or "")[:160]
                thumb = str(d.get("thumbnail_url") or "")
                out["thumb"] = thumb if thumb.startswith("https://") else None
        except (httpx.HTTPError, ValueError):
            pass
    out["title"] = out["title"] or {"playlist": "Playlist", "album": "Album", "track": "Lagu", "song": "Lagu"}.get(info["kind"], "Musik")
    _cache[key] = (time.time(), out)
    return out


def settings(db: Session) -> dict[str, Any]:
    row = db.get(AppSetting, "music")
    v = dict(row.value) if row and row.value else {}
    return {"music_enabled": bool(v.get("enabled", True)), "curated": list(v.get("curated", CURATED))}


def put(db: Session, enabled: bool, curated: list[dict[str, str]]) -> None:
    clean = []
    for c in curated[:24]:
        info = parse(str(c.get("url", "")))
        clean.append({"provider": info["provider"], "title": str(c.get("title") or "")[:80] or info["kind"], "url": info["open_url"]})
    row = db.get(AppSetting, "music")
    value = {"enabled": bool(enabled), "curated": clean}
    if row is None:
        db.add(AppSetting(key="music", value=value))
    else:
        row.value = value
        row.updated_at = now()
