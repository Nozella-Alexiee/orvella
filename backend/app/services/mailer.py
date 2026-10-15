"""Kirim email (lupa kata sandi) lewat SMTP biasa: Brevo, Gmail SMTP, Mailgun, dll. Pakai smtplib bawaan, tanpa paket tambahan.

Kalau ORVELLA_SMTP_HOST kosong (mode dev), isi email cuma ditulis ke log server, tidak pernah dikirim ke browser.
"""
from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from ..config import settings

log = logging.getLogger("orvella.mailer")


def configured() -> bool:
    return bool(settings.smtp_host and settings.smtp_from)


def send(to: str, subject: str, text: str) -> None:
    if not configured():
        log.warning("SMTP belum diatur, email TIDAK dikirim. Untuk %s · %s\n%s", to, subject, text)
        return
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = settings.smtp_from, to, subject
    msg.set_content(text)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as s:
            s.starttls()
            if settings.smtp_user:
                s.login(settings.smtp_user, settings.smtp_password)
            s.send_message(msg)
    except (OSError, smtplib.SMTPException):
        # jangan bocorkan ke pengguna apakah emailnya terdaftar; cukup catat untuk admin server
        log.exception("Gagal mengirim email ke %s", to)
