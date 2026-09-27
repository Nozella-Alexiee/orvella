"""Runner settings (environment variables, no prefix: the runner is its own service)."""
from __future__ import annotations

import os
from pathlib import Path


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


TOKEN = os.environ.get("RUNNER_TOKEN", "")
# Docker named volume shared with sandbox containers (mounted here at JOBS_DIR, and per job with a subpath).
JOBS_VOLUME = os.environ.get("JOBS_VOLUME", "orvella_jobs")
JOBS_DIR = Path(os.environ.get("JOBS_DIR", "/jobs"))
GOCACHE_VOLUME = os.environ.get("GOCACHE_VOLUME", "orvella_gocache")
IMAGE_PREFIX = os.environ.get("IMAGE_PREFIX", "orvella-sbx-")
HELPERS_DIR = Path(__file__).resolve().parent.parent / "helpers"

MAX_RUN_CONCURRENCY = _int("MAX_RUN_CONCURRENCY", 2)  # sandbox containers running at the same time
MAX_QUEUE = _int("MAX_QUEUE", 24)                      # requests allowed to wait for a slot
SANDBOX_UID = "10001:10001"

# hard ceilings; the app may ask for less, never for more
MAX_RUN_TIMEOUT = 10.0
MAX_COMPILE_TIMEOUT = 45.0
MAX_MEMORY_MB = 1024
MAX_STDOUT = 64 * 1024
MAX_STDERR = 16 * 1024
MAX_FILES = 40
MAX_TOTAL_BYTES = 400 * 1024

# workspace sessions (T3)
SANDBOX_NETWORK = os.environ.get("SANDBOX_NETWORK", "orvella_sandbox")
WORKSPACES_VOLUME = os.environ.get("WORKSPACES_VOLUME", "orvella_workspaces")
WORKSPACES_DIR = Path(os.environ.get("WORKSPACES_DIR", "/workspaces"))
MAX_WS_SESSIONS = _int("MAX_WS_SESSIONS", 3)
WS_IDLE_MINUTES = _int("WS_IDLE_MINUTES", 15)
WS_MEMORY_MB = _int("WS_MEMORY_MB", 384)
MYSQL_HOST = os.environ.get("MYSQL_HOST", "")
MYSQL_ROOT_PASSWORD = os.environ.get("MYSQL_ROOT_PASSWORD", "")
