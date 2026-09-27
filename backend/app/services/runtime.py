"""Admin-editable runtime settings: which languages are switched on and their limits.
Stored in app_settings["runtime"]; the runner still enforces its own hard ceilings."""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..models import AppSetting, now
from .runner import LANG_IDS

KEY = "runtime"
LABELS = {"python": "Python", "javascript": "JavaScript", "php": "PHP", "c": "C", "cpp": "C++", "rust": "Rust", "go": "Go",
          "java": "Java", "kotlin": "Kotlin", "sql": "SQL"}


def get(db: Session) -> dict[str, Any]:
    row = db.get(AppSetting, KEY)
    v = dict(row.value) if row and row.value else {}
    return {"disabled": list(v.get("disabled", [])), "timeout": dict(v.get("timeout", {})), "memory": dict(v.get("memory", {}))}


def put(db: Session, disabled: list[str], timeout: dict[str, float], memory: dict[str, int]) -> dict[str, Any]:
    value = {
        "disabled": sorted({l for l in disabled if l in LANG_IDS}),
        "timeout": {k: max(0.5, min(10.0, float(v))) for k, v in timeout.items() if k in LANG_IDS and v},
        "memory": {k: max(64, min(1024, int(v))) for k, v in memory.items() if k in LANG_IDS and v},
    }
    row = db.get(AppSetting, KEY)
    if row is None:
        row = AppSetting(key=KEY, value=value)
        db.add(row)
    else:
        row.value = value
        row.updated_at = now()
    return value


def limits(db: Session, lang: str) -> tuple[bool, float | None, int | None]:
    """(enabled, timeout seconds or None for the default, memory MB or None)."""
    s = get(db)
    return lang not in s["disabled"], s["timeout"].get(lang), s["memory"].get(lang)
