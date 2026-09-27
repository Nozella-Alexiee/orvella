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


settings = Settings()
