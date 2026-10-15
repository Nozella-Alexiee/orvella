"""Musik: only Spotify / Apple Music links become embeds; metadata comes from Spotify oEmbed."""
import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.services import music

from tests.conftest import login


def test_parse_whitelist():
    s = music.parse("https://open.spotify.com/intl-id/playlist/37i9dQZF1DWWQRwui0ExPn?si=abc")
    assert s["provider"] == "spotify" and s["embed_url"].startswith("https://open.spotify.com/embed/playlist/37i9dQZF1DWWQRwui0ExPn")
    a = music.parse("https://music.apple.com/id/album/nama-album/1440857781?i=1440857790&x=<b>")
    assert a["provider"] == "apple" and a["embed_url"] == "https://embed.music.apple.com/id/album/nama-album/1440857781?i=1440857790"
    for bad in ("https://evil.com/open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn", "http://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn",
                "javascript:alert(1)", "https://open.spotify.com.evil.com/playlist/37i9dQZF1DWWQRwui0ExPn", "https://music.apple.com/id/album/x/1\"onload"):
        with pytest.raises(HTTPException):
            music.parse(bad)


def test_resolve_uses_oembed_title(monkeypatch):
    music._cache.clear()

    class R:
        status_code = 200

        def json(self):
            return {"title": "lofi beats", "thumbnail_url": "https://i.scdn.co/image/x", "html": "<iframe>"}

    monkeypatch.setattr(music.httpx, "get", lambda *a, **k: R())
    r = music.resolve("https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn")
    assert r["title"] == "lofi beats" and r["thumb"].startswith("https://") and "html" not in r

    def boom(*a, **k):
        raise httpx.ConnectError("offline")

    music._cache.clear()
    monkeypatch.setattr(music.httpx, "get", boom)
    assert music.resolve("https://open.spotify.com/album/37i9dQZF1DWWQRwui0ExPn")["title"] == "Album"


def test_endpoints_and_admin_switch(client, monkeypatch):
    monkeypatch.setattr(music.httpx, "get", lambda *a, **k: (_ for _ in ()).throw(httpx.ConnectError("x")))
    login(client, "nadia@smksig.sch.id")
    home = client.get("/api/music").json()
    assert home["enabled"] and home["curated"][0]["embed_url"].startswith("https://open.spotify.com/embed/")
    assert client.get("/api/music/resolve", params={"url": "https://example.com/x"}).status_code == 400
    admin = TestClient(app)
    login(admin, "sekar@smksig.sch.id")
    assert admin.put("/api/admin/os", json={"music_enabled": False}).json()["music_enabled"] is False
    assert client.get("/api/music/resolve", params={"url": "https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn"}).status_code == 403
    assert admin.put("/api/admin/os", json={"curated": [{"title": "x", "url": "https://evil.com"}]}).status_code == 400
    admin.put("/api/admin/os", json={"music_enabled": True})
