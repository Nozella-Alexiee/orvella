"""Internet untuk Orvi AI: cari lewat SearXNG (mesin pencari open source di docker compose) dan buka halaman jadi teks.

Membuka halaman itu permintaan dari server ke alamat pilihan model, jadi dijaga ketat supaya tidak bisa dipakai mengintip
jaringan dalam (database, runner, metadata cloud): cuma http/https di port standar, setiap alamat IP hasil DNS harus publik,
pengalihan diperiksa ulang satu per satu, ukuran dan waktu dibatasi.
"""
from __future__ import annotations

import ipaddress
import re
import socket
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin, urlsplit

import httpx

from ..config import settings

MAX_BYTES, MAX_TEXT, MAX_REDIRECTS = 1_500_000, 9000, 4
UA = "Mozilla/5.0 (compatible; OrvellaBot/1.0; +https://github.com/orvella)"


class WebError(Exception):
    """Pesan yang aman ditunjukkan ke model/pengguna."""


def enabled() -> bool:
    return bool(settings.search_url)


def search(kueri: str, n: int = 6) -> list[dict[str, str]]:
    kueri = " ".join((kueri or "").split())[:200]
    if not kueri:
        raise WebError("Kata kuncinya kosong.")
    try:
        r = httpx.get(settings.search_url.rstrip("/") + "/search", params={"q": kueri, "format": "json", "language": "id-ID", "safesearch": 1},
                      timeout=12, headers={"Accept": "application/json"})
        r.raise_for_status()
        rows = r.json().get("results") or []
    except (httpx.HTTPError, ValueError):
        raise WebError("Mesin pencari lagi tidak bisa dihubungi.") from None
    out, seen = [], set()
    for x in rows:
        url = str(x.get("url") or "")
        if not url.startswith(("http://", "https://")) or url in seen:
            continue
        seen.add(url)
        out.append({"judul": str(x.get("title") or "")[:160], "url": url[:500], "cuplikan": " ".join(str(x.get("content") or "").split())[:400],
                    "tanggal": str(x.get("publishedDate") or "")[:10]})
        if len(out) >= n:
            break
    return out


def _check_host(url: str) -> None:
    p = urlsplit(url)
    if p.scheme not in ("http", "https") or not p.hostname:
        raise WebError("Cuma alamat http/https yang bisa dibuka.")
    if p.port not in (None, 80, 443):
        raise WebError("Port itu tidak bisa dibuka.")
    if p.username or p.password:
        raise WebError("Alamat dengan nama pengguna tidak bisa dibuka.")
    try:
        infos = socket.getaddrinfo(p.hostname, p.port or (443 if p.scheme == "https" else 80), proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise WebError("Alamat situsnya tidak ditemukan.") from None
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global or ip.is_multicast:
            raise WebError("Alamat itu ada di jaringan dalam, tidak bisa dibuka.")


class _Text(HTMLParser):
    SKIP = {"script", "style", "noscript", "svg", "nav", "footer", "header", "form", "aside", "iframe", "template", "button"}
    BLOCK = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "table", "pre", "blockquote", "dd", "dt"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.depth, self.parts, self.title, self._in_title = 0, [], "", False

    def handle_starttag(self, tag: str, attrs: Any) -> None:
        if tag in self.SKIP:
            self.depth += 1
        elif tag == "title":
            self._in_title = True
        elif tag in self.BLOCK:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self.SKIP and self.depth:
            self.depth -= 1
        elif tag == "title":
            self._in_title = False
        elif tag in self.BLOCK:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data
        elif not self.depth:
            self.parts.append(data)


def html_to_text(html: str) -> tuple[str, str]:
    t = _Text()
    try:
        t.feed(html); t.close()
    except Exception:  # HTML rusak: pakai yang sudah terbaca
        pass
    text = re.sub(r"[ \t\r\f\v]+", " ", "".join(t.parts))
    text = re.sub(r"\n\s*\n+", "\n\n", "\n".join(line.strip() for line in text.split("\n"))).strip()
    return " ".join(t.title.split())[:200], text


def fetch(url: str) -> dict[str, str]:
    """Buka halaman publik dan kembalikan {judul, url, teks} (teks dipotong MAX_TEXT)."""
    url = (url or "").strip()
    with httpx.Client(follow_redirects=False, timeout=httpx.Timeout(12, connect=6), headers={"User-Agent": UA, "Accept": "text/html,text/plain;q=0.9"}) as c:
        for _ in range(MAX_REDIRECTS + 1):
            _check_host(url)
            try:
                with c.stream("GET", url) as r:
                    if r.is_redirect:
                        url = urljoin(url, r.headers.get("location", ""))
                        continue
                    if r.status_code >= 400:
                        raise WebError(f"Situsnya membalas {r.status_code}.")
                    ctype = r.headers.get("content-type", "")
                    if not any(t in ctype for t in ("text/html", "text/plain", "application/xhtml")):
                        raise WebError("Halaman itu bukan teks (mungkin PDF, gambar, atau unduhan).")
                    body = b""
                    for chunk in r.iter_bytes():
                        body += chunk
                        if len(body) > MAX_BYTES:
                            break
                    raw = body.decode(r.encoding or "utf-8", errors="replace")
            except httpx.HTTPError:
                raise WebError("Situsnya tidak bisa dibuka (lambat atau menolak).") from None
            if "text/plain" in ctype:
                title, text = "", raw
            else:
                title, text = html_to_text(raw)
            return {"judul": title, "url": url, "teks": text[:MAX_TEXT]}
    raise WebError("Terlalu banyak pengalihan.")
