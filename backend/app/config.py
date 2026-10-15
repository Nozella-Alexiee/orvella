"""App settings. Override any field with an environment variable prefixed ORVELLA_
(e.g. ORVELLA_DATABASE_URL=postgresql+psycopg://...)."""
import shutil
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BACKEND_DIR.parent


def _find_node() -> str:
    found = shutil.which("node")
    if found:
        return found
    for guess in (r"C:\Program Files\nodejs\node.exe", "/usr/local/bin/node", "/usr/bin/node"):
        if Path(guess).exists():
            return guess
    return "node"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ORVELLA_", env_file=BACKEND_DIR / ".env", extra="ignore")

    # PostgreSQL in development and production, e.g. postgresql+psycopg://orvella:***@localhost:5432/orvella (set in backend/.env).
    # Falls back to a local SQLite file when nothing is configured.
    database_url: str = f"sqlite:///{(BACKEND_DIR / 'orvella.db').as_posix()}"
    secret_key: str = "dev-only-change-me-in-production"
    session_cookie: str = "orvella_session"
    session_days: int = 30
    cookie_secure: bool = False

    # Day boundaries for streaks and daily goals (WIB, no DST).
    utc_offset_hours: int = 7

    node_bin: str = _find_node()
    runner_timeout_ms: int = 1000
    # Multi-language sandbox service (runner/). Empty = only the local JavaScript harness is available.
    runner_url: str = ""
    runner_token: str = ""
    runs_per_minute: int = 30  # per user, all languages
    # Preview proxy for running web projects (preview/): its own origin, shared HMAC secret.
    preview_secret: str = ""
    preview_port: int = 8301
    preview_public_url: str = ""  # e.g. https://preview.sekolah.sch.id; empty = same host as the app on preview_port
    preview_metrics: str = ""  # cloudflared metrics of the preview quick tunnel (http://tunnel-preview:2000)

    frontend_dist: Path = ROOT_DIR / "frontend" / "dist"

    # Masuk dengan Google (OAuth 2.0 Authorization Code + PKCE). Kosong = tombol Google menampilkan "belum aktif".
    google_client_id: str = ""
    google_client_secret: str = ""
    # Alamat publik aplikasi untuk redirect_uri Google (mis. https://orvella.sekolah.sch.id). Kosong = diambil dari request.
    public_url: str = ""

    # Alamat IP asli di belakang proxy/tunnel (X-Forwarded-For, CF-Connecting-IP). Nyalakan HANYA kalau app memang di belakang
    # proxy yang kamu kendalikan; kalau tidak, header itu bisa dipalsukan untuk lolos dari batas percobaan masuk.
    trust_proxy: bool = False
    # Email keluar (lupa kata sandi). Kosong = link reset cuma ditulis ke log server (mode dev).
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""

    # Tanya Orvi: model open source lewat beberapa layanan berpaket gratis (kompatibel OpenAI). Kunci yang kosong dilewati;
    # semua kosong = Orvi cuma pakai penjelas bawaan. Groq: console.groq.com · Cerebras: cloud.cerebras.ai · Gemini: aistudio.google.com
    groq_api_key: str = ""
    cerebras_api_key: str = ""
    gemini_api_key: str = ""
    # "layanan:model", dicoba berurutan; kena batas (429) atau error → berikutnya (yang baru kena batas didinginkan sebentar)
    ai_models: str = ("groq:openai/gpt-oss-120b,cerebras:gpt-oss-120b,cerebras:qwen-3.8-27b,groq:openai/gpt-oss-20b,"
                      "groq:qwen/qwen3.8-27b,gemini:gemini-3-flash-preview")
    # mesin pencari SearXNG untuk alat cari_web Orvi AI (docker compose: http://searxng:8080). Kosong = Orvi tanpa internet.
    search_url: str = ""
    web_per_10min: int = 40  # rem pencarian + buka halaman per orang
    ai_per_minute: int = 6  # rem per orang, di luar batas 30 per 5 jam


settings = Settings()
