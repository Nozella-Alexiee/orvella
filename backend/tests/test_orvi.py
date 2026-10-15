"""Orvi AI: stream jawaban, alat (loop agen), token langkah lanjutan, rantai model (Groq di-mock), batas, rem per menit,
penjelas bawaan, mode bab, umpan balik."""
import json
import uuid

import pytest
from sqlalchemy import delete, func, select, update

from app.config import settings
from app.db import SessionLocal
from app.models import AiFeedback, AiUsage, User
from app.routers import orvi as orvi_router
from app.services import ai


def _register(client) -> str:
    """Akun baru di luar kelas contoh, supaya tidak menggeser statistik kelas di tes mentor."""
    email = f"orvi-{uuid.uuid4().hex[:6]}@contoh.id"
    assert client.post("/api/auth/register", json={"name": "Tanya", "email": email, "password": "rahasia-123"}).status_code == 200
    with SessionLocal() as s:
        s.execute(update(User).where(User.email == email).values(class_id=None)); s.commit()
    return email


def _events(r) -> list[dict]:
    assert r.headers["content-type"].startswith("text/event-stream")
    return [json.loads(line[5:]) for line in r.text.splitlines() if line.startswith("data:")]


def _text(evs) -> str:
    return "".join(e.get("t", "") for e in evs)


def _ask(client, q, **kw):
    return client.post("/api/orvi/tanya", json={"pesan": [{"role": "user", "content": q}], **kw})


class FakeResp:
    def __init__(self, status, chunks):
        self.status_code, self._chunks, self.headers = status, chunks, {}
    def __enter__(self): return self
    def __exit__(self, *a): return False
    def read(self): return b""
    def iter_lines(self):
        for c in self._chunks:
            yield "data: " + json.dumps(c)
        yield "data: [DONE]"


def text_chunks(*parts):
    return [{"choices": [{"delta": {"content": p}}]} for p in parts]


def tool_chunks(name, args):
    s = json.dumps(args)
    return [{"choices": [{"delta": {"tool_calls": [{"index": 0, "id": "c1", "function": {"name": name, "arguments": s[:5]}}]}}]},
            {"choices": [{"delta": {"tool_calls": [{"index": 0, "function": {"arguments": s[5:]}}]}}]}]


@pytest.fixture()
def groq(monkeypatch):
    """Groq palsu: daftar respons per panggilan (status, potongan)."""
    calls, plan = [], []
    def fake(client, model, msgs, tools):
        calls.append({"model": model, "msgs": msgs, "tools": [t["function"]["name"] for t in tools]})
        status, chunks = plan.pop(0) if plan else (200, text_chunks("Halo, ", "aku **Orvi**."))
        return FakeResp(status, chunks)
    monkeypatch.setattr(ai, "_open", fake)
    monkeypatch.setattr(settings, "groq_api_key", "gsk_uji")
    orvi_router._recent.clear()
    ai._cool.clear()
    return {"calls": calls, "plan": plan}


def _used(db, email):
    uid = db.scalar(select(User.id).where(User.email == email))
    return db.scalar(select(func.count()).select_from(AiUsage).where(AiUsage.user_id == uid))


def test_streams_free_topic_and_counts_once(client, db, groq):
    email = _register(client)
    evs = _events(_ask(client, "Halo kamu siapa?"))
    assert _text(evs) == "Halo, aku **Orvi**." and evs[-1]["selesai"] and evs[-1]["kuota"]["sisa"] == 29
    sys = groq["calls"][0]["msgs"][0]["content"]
    assert "SEMUA topik" in sys and email not in json.dumps(groq["calls"])
    assert groq["calls"][0]["tools"] == []  # tanpa Sandbox: tanpa alat
    assert _used(db, email) == 1


def test_model_chain_falls_back(client, groq):
    _register(client)
    groq["plan"].extend([(429, [])])
    evs = _events(_ask(client, "Apa itu loop?"))
    assert evs[0]["sumber"] == ai.models()[1] and _text(evs)


def test_all_models_fail(client, groq):
    _register(client)
    groq["plan"].extend([(500, [])] * 10)
    evs = _events(_ask(client, "Apa itu fungsi?"))
    assert evs[-1]["error"] == "rame"


def test_agent_tool_loop_and_continuation_token(client, db, groq):
    email = _register(client)
    groq["plan"].append((200, tool_chunks("baca_berkas", {"path": "main.py"})))
    evs = _events(_ask(client, "Benerin errornya", alat=True, proyek="Kalkulator", konteks={"bahasa": "python"}))
    alat = next(e for e in evs if "alat" in e)
    assert alat["alat"] == [{"id": "c1", "name": "baca_berkas", "arguments": '{"path": "main.py"}'}]
    assert "ubah_berkas" in groq["calls"][0]["tools"] and "Kalkulator" in groq["calls"][0]["msgs"][0]["content"]
    token = alat["token"]
    pesan = [{"role": "user", "content": "Benerin errornya"},
             {"role": "assistant", "content": "", "tool_calls": alat["alat"]},
             {"role": "tool", "tool_call_id": "c1", "content": "  1| print(nama)"}]
    evs2 = _events(client.post("/api/orvi/tanya", json={"pesan": pesan, "alat": True, "token": token}))
    assert _text(evs2)
    sent = groq["calls"][-1]["msgs"]
    assert sent[-1] == {"role": "tool", "tool_call_id": "c1", "content": "  1| print(nama)"}
    assert sent[-2]["tool_calls"][0]["function"]["name"] == "baca_berkas"
    assert _used(db, email) == 1  # langkah lanjutan tidak dihitung
    # token tidak bisa dipakai buat pertanyaan baru, dan token palsu ditolak
    assert client.post("/api/orvi/tanya", json={"pesan": [{"role": "user", "content": "Pertanyaan gratis?"}], "token": token}).status_code == 403
    assert client.post("/api/orvi/tanya", json={"pesan": pesan, "token": token[:-2] + "zz"}).status_code == 403


def test_bab_context_hints_only(client, groq):
    _register(client)
    _events(_ask(client, "Jawabannya apa?", alat=True, konteks={"bab": "Variabel"}))
    c = groq["calls"][0]
    assert set(c["tools"]) == {"daftar_berkas", "baca_berkas", "cari"}  # tanpa alat tulis/jalankan
    assert "jangan kasih jawaban jadi" in c["msgs"][0]["content"]


def test_rolling_limit_and_superadmin_unlimited(client, db, groq):
    email = _register(client)
    u = db.scalar(select(User).where(User.email == email)); u.ai_limit = 2; db.commit()
    for _ in range(2):
        assert _ask(client, "Apa itu list?").status_code == 200
    r = _ask(client, "Apa itu dict?")
    assert r.status_code == 429 and r.json()["detail"]["kode"] == "batas" and r.json()["detail"]["reset_at"]
    assert client.get("/api/orvi/kuota").json()["sisa"] == 0
    u.role = "superadmin"; db.commit()
    assert client.get("/api/orvi/kuota").json()["unlimited"] is True
    assert _ask(client, "Apa itu set?").status_code == 200
    db.execute(delete(AiUsage).where(AiUsage.user_id == u.id)); u.role = "learner"; db.commit()


def test_per_minute_brake(client, groq, monkeypatch):
    monkeypatch.setattr(settings, "ai_per_minute", 2)
    _register(client)
    for _ in range(2):
        _ask(client, "Halo Orvi")
    r = _ask(client, "Halo lagi")
    assert r.status_code == 429 and r.json()["detail"]["kode"] == "pelan"


def test_disabled_without_key_uses_builtin(client, monkeypatch):
    monkeypatch.setattr(settings, "groq_api_key", "")
    _register(client)
    evs = _events(_ask(client, "Apa itu loop?"))
    assert evs[0]["sumber"] == "nonaktif" and "belum aktif" in _text(evs)
    evs = _events(_ask(client, "Kenapa error?", konteks={"bahasa": "python", "kode": "print(nama)\n", "error": "NameError: name 'nama' is not defined", "baris": 1}))
    assert evs[0]["sumber"] == "bawaan" and "NameError" in _text(evs)
    assert client.get("/api/orvi/kuota").json()["aktif"] is False


def test_feedback(client, db):
    email = _register(client)
    assert client.post("/api/orvi/umpan-balik", json={"nilai": "turun", "alasan": "Gak nyambung", "sumber": "x"}).json()["ok"]
    uid = db.scalar(select(User.id).where(User.email == email))
    assert db.scalar(select(AiFeedback.alasan).where(AiFeedback.user_id == uid)) == "Gak nyambung"


def test_nudges_model_to_use_edit_tool(client, groq):
    _register(client)
    groq["plan"].extend([(200, text_chunks("Ganti jadi:\n```python\nfor i in range(3):\n```")),
                         (200, tool_chunks("ubah_berkas", {"path": "main.py", "cari": "range(4)", "ganti": "range(3)"}))])
    evs = _events(_ask(client, "tolong benerin main.py", alat=True))
    alat = next(e for e in evs if "alat" in e)
    assert alat["alat"][0]["name"] == "ubah_berkas" and alat["token"]
    assert groq["calls"][1]["msgs"][-1]["role"] == "system"
    # pertanyaan biasa tidak didorong
    groq["calls"].clear(); groq["plan"].append((200, text_chunks("```python\nprint(1)\n```")))
    _events(_ask(client, "apa itu print?", alat=True))
    assert len(groq["calls"]) == 1


def test_provider_chain_cooldown_and_gemini_chat_only(client, groq, monkeypatch):
    monkeypatch.setattr(settings, "cerebras_api_key", "csk_uji")
    monkeypatch.setattr(settings, "gemini_api_key", "g_uji")
    monkeypatch.setattr(settings, "ai_models", "groq:a,cerebras:b,gemini:c,lama-tanpa-awalan")
    assert ai.models() == ["groq:a", "cerebras:b", "gemini:c", "groq:lama-tanpa-awalan"]
    _register(client)
    groq["plan"].append((429, []))
    evs = _events(_ask(client, "halo"))
    assert evs[0]["sumber"] == "cerebras:b"
    groq["calls"].clear()
    _events(_ask(client, "halo lagi"))
    assert groq["calls"][0]["model"] == "cerebras:b"  # groq:a masih didinginkan, langsung dilewati
    # mode alat: Gemini tidak ikut dicoba
    assert "gemini:c" not in ai._order([], ai.READ_TOOLS)
    assert "gemini:c" in ai._order([{"role": "user", "content": "x"}], [])
    monkeypatch.setattr(settings, "cerebras_api_key", "")
    assert "cerebras:b" not in ai.models()  # kunci kosong = dilewati


def test_web_tools_and_date_in_prompt(client, groq, monkeypatch):
    monkeypatch.setattr(settings, "search_url", "http://searxng:8080")
    _register(client)
    _events(_ask(client, "siapa juara liga champions terakhir?"))
    c = groq["calls"][0]
    assert {"cari_web", "buka_halaman"} <= set(c["tools"]) and "ubah_berkas" not in c["tools"]
    sys = c["msgs"][0]["content"]
    assert "WIB" in sys and "cari_web" in sys and "Kamu terhubung ke proyek Sandbox" not in sys


def test_web_search_endpoint(client, monkeypatch):
    from app.services import web
    _register(client)
    assert client.post("/api/orvi/web/cari", json={"kueri": "harga cabai"}).json()["teks"].startswith("Pencarian internet belum aktif")
    monkeypatch.setattr(settings, "search_url", "http://searxng:8080")
    monkeypatch.setattr(web, "search", lambda q: [{"judul": "Harga Cabai Hari Ini", "url": "https://contoh.id/cabai", "cuplikan": "Rp 100.000/kg", "tanggal": "2026-10-01"}])
    r = client.post("/api/orvi/web/cari", json={"kueri": "harga cabai"}).json()
    assert r["hasil"][0]["url"] == "https://contoh.id/cabai" and "[1] Harga Cabai Hari Ini" in r["teks"] and "2026-10-01" in r["teks"]
    monkeypatch.setattr(settings, "web_per_10min", 1)
    orvi_router._web_recent.clear()
    client.post("/api/orvi/web/cari", json={"kueri": "a"})
    assert client.post("/api/orvi/web/cari", json={"kueri": "b"}).status_code == 429


@pytest.mark.parametrize("url", ["http://localhost:8000/api/health", "http://127.0.0.1/", "http://10.0.0.5/", "http://169.254.169.254/latest/meta-data/",
                                 "http://[::1]/", "file:///etc/passwd", "ftp://contoh.id/x", "http://contoh.id:5432/", "http://user:pw@contoh.id/"])
def test_open_page_blocks_internal_addresses(url):
    from app.services import web
    with pytest.raises(web.WebError):
        web.fetch(url)


def test_html_to_text():
    from app.services import web
    title, text = web.html_to_text("<html><head><title> Berita  Hari Ini </title><script>alert(1)</script></head><body><nav>Menu</nav>"
                                   "<h1>Judul</h1><p>Paragraf <b>satu</b>.</p><footer>hak cipta</footer></body></html>")
    assert title == "Berita Hari Ini" and "Judul" in text and "Paragraf satu." in text
    assert "alert" not in text and "Menu" not in text and "hak cipta" not in text
