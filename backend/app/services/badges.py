"""Lencana stiker (8 buah, sama dengan stiker IG): aturan, penilaian, dan tampilannya.

Dinilai ulang setelah heartbeat, program dijalankan, proyek web dijalankan, dan kuis selesai. Lencana yang
belum tercatat di data (run program, error lalu berhasil) memakai penanda di user.prefs["_lencana"].
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Chapter, ChapterProgress, Path, QuizRound, User, UserBadge
from . import activity, learning

COMPILED = {"c", "cpp", "rust", "go", "java", "kotlin"}
FIXES_NEEDED = 10

# kode, judul, cara dapat, ikon, warna stiker
BADGES: list[tuple[str, str, str, str, str]] = [
    ("paham", "Paham!", "Menyelesaikan fase Pahami pertama.", "lightbulb", "#3E9BF0"),
    ("kuis_sempurna", "Kuis sempurna", "Dapat nilai 100% di satu kuis.", "zap", "#8D5CF6"),
    ("beruntun_7", "7 hari beruntun", "Mencapai target belajar 7 hari berturut-turut.", "activity", "#FF6A55"),
    ("pembasmi_bug", "Pembasmi bug", f"Membetulkan error sampai programnya jalan, {FIXES_NEEDED} kali.", "bug", "#1FB488"),
    ("kompilasi_pertama", "Kompilasi pertama", "Program C, C++, Rust, Go, Java, atau Kotlin pertama yang jalan.", "cpu", "#3353C3"),
    ("pemilik_sejati", "Pemilik sejati", "Menamatkan satu bab Rust.", "crown", "#B4461C"),
    ("halaman_pertama", "Halaman pertama", "Menjalankan proyek web pertama.", "globe", "#EE5F2C"),
    ("si_begadang", "Si begadang", "Masih ngoding lewat jam 22.00.", "moon", "#4B3FB0"),
]
_BY_CODE = {b[0]: b for b in BADGES}


def view(code: str, earned_at: datetime | None = None) -> dict[str, Any]:
    c, title, how, icon, color = _BY_CODE[code]
    return {"code": c, "title": title, "how": how, "icon": icon, "color": color, "earned": earned_at is not None,
            "earned_at": earned_at.isoformat() if earned_at else None}


def _sig(user: User) -> dict[str, Any]:
    return dict((user.prefs or {}).get("_lencana") or {})


def _save_sig(user: User, sig: dict[str, Any]) -> None:
    user.prefs = {**(user.prefs or {}), "_lencana": sig}


def after_run(user: User, lang: str, ok: bool) -> None:
    """Catat hasil run: error yang lalu dibetulkan, dan program bahasa kompilasi pertama."""
    sig = _sig(user)
    if not ok:
        sig["err"] = True
    else:
        if sig.get("err"):
            sig["fixes"] = int(sig.get("fixes", 0)) + 1
            sig["err"] = False
        if lang in COMPILED:
            sig["compiled"] = True
    _save_sig(user, sig)


def mark(user: User, flag: str) -> None:
    sig = _sig(user)
    if not sig.get(flag):
        sig[flag] = True
        _save_sig(user, sig)


def is_night() -> bool:
    h = datetime.now(activity.LOCAL_TZ).hour
    return h >= 22 or h < 4


def _earned_now(db: Session, user: User, have: set[str], night: bool) -> list[str]:
    sig = _sig(user)
    out: list[str] = []
    need = lambda code: code not in have  # noqa: E731
    progress = None

    def progs() -> list[ChapterProgress]:
        nonlocal progress
        if progress is None:
            progress = list(db.scalars(select(ChapterProgress).where(ChapterProgress.user_id == user.id)))
        return progress

    if need("paham") and any((p.phases or {}).get("pahami", {}).get("state") == "done" for p in progs()):
        out.append("paham")
    if need("kuis_sempurna") and db.scalar(select(QuizRound.id).where(
            QuizRound.user_id == user.id, QuizRound.finished.is_(True), QuizRound.pct >= 100).limit(1)):
        out.append("kuis_sempurna")
    if need("beruntun_7") and activity.streak(db, user) >= 7:
        out.append("beruntun_7")
    if need("pembasmi_bug") and int(sig.get("fixes", 0)) >= FIXES_NEEDED:
        out.append("pembasmi_bug")
    if need("kompilasi_pertama") and sig.get("compiled"):
        out.append("kompilasi_pertama")
    if need("pemilik_sejati"):
        done = [p.chapter_id for p in progs() if p.completed_at]
        if done and db.scalar(select(Chapter.id).join(Path, Path.id == Chapter.path_id).where(
                Chapter.id.in_(done), Chapter.kind == "chapter", Path.language == "rust").limit(1)):
            out.append("pemilik_sejati")
    if need("halaman_pertama") and sig.get("web"):
        out.append("halaman_pertama")
    if need("si_begadang") and night:
        out.append("si_begadang")
    return out


def evaluate(db: Session, user: User, *, night: bool = False) -> list[dict[str, Any]]:
    """Beri lencana yang syaratnya sudah terpenuhi. Mengembalikan yang baru saja didapat (caller yang commit)."""
    if user.role != "learner":
        return []
    have = set(db.scalars(select(UserBadge.code).where(UserBadge.user_id == user.id)))
    if len(have) >= len(BADGES):
        return []
    new = []
    for code in _earned_now(db, user, have, night):
        row = UserBadge(user_id=user.id, code=code)
        db.add(row)
        title = _BY_CODE[code][1]
        learning.notify(db, user.id, "badge", f"Lencana baru: {title}", _BY_CODE[code][2], "/pengaturan#lencana")
        new.append(view(code, row.earned_at or datetime.now(activity.LOCAL_TZ)))
    if new:
        db.flush()
    return new


def collection(db: Session, user: User) -> list[dict[str, Any]]:
    rows = {b.code: b.earned_at for b in db.scalars(select(UserBadge).where(UserBadge.user_id == user.id))}
    return [view(code, rows.get(code)) for code, *_ in BADGES]
