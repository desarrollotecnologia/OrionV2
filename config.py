"""Configuracion central del aplicativo ORION."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def _bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on", "si", "s"}


def _env(*keys: str, default: str = "") -> str:
    """Lee la primera variable de entorno definida (soporta alias MAIL_* / SMTP_*)."""
    for key in keys:
        val = os.getenv(key)
        if val is not None and str(val).strip():
            return str(val).strip().strip("'\"")
    return default


class Config:
    """Configuracion utilizada por Flask, modelos y servicios."""

    # Flask
    SECRET_KEY = os.getenv("SECRET_KEY", "orion-alfa-clave-cambia")
    FLASK_HOST = os.getenv("FLASK_HOST", "127.0.0.1")
    FLASK_PORT = int(os.getenv("FLASK_PORT", "5000"))
    FLASK_DEBUG = _bool(os.getenv("FLASK_DEBUG"), False)

    # MySQL
    DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
    DB_PORT = int(os.getenv("DB_PORT", "3306"))
    DB_USER = os.getenv("DB_USER", "root")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "")
    DB_NAME = os.getenv("DB_NAME", "orion")

    # Excel
    EXCEL_PATH = Path(
        os.getenv("EXCEL_PATH", str(BASE_DIR / "ORION.xlsx"))
    )
    # Si False (default), al arrancar usa MySQL y no reimporta el Excel si ya hay datos
    IMPORT_ON_START = _bool(os.getenv("IMPORT_ON_START"), False)

    # Watcher
    WATCHER_ENABLED = _bool(os.getenv("WATCHER_ENABLED"), True)
    WATCHER_DEBOUNCE_SEC = float(os.getenv("WATCHER_DEBOUNCE_SEC", "2.0"))

    # Auth
    DEFAULT_ADMIN_USER = os.getenv("DEFAULT_ADMIN_USER", "coordinacion.desposte@colbeef.com")
    DEFAULT_ADMIN_PASSWORD = os.getenv("DEFAULT_ADMIN_PASSWORD", "Colbeef2026*")
    DEFAULT_RESET_PASSWORD = os.getenv("DEFAULT_RESET_PASSWORD", "Colbeef2026*")
    USABILITY_DASH_CMD = os.getenv("USABILITY_DASH_CMD", "cb-usabilidad-2026")

    # URLs publicas (portal site.html y app Cut Beef)
    APP_PUBLIC_URL = os.getenv("APP_PUBLIC_URL", "http://192.168.20.205:8004/")
    SITE_PORTAL_URL = os.getenv("SITE_PORTAL_URL", "http://192.168.20.205:8000/site.html")

    # SMTP / correo (bot de correo; acepta MAIL_* como en otros proyectos Colbeef)
    SMTP_HOST = _env("MAIL_SERVER", "MAIL_HOST", "SMTP_HOST")
    SMTP_PORT = int(_env("MAIL_PORT", "SMTP_PORT", default="465"))
    SMTP_USER = _env("MAIL_USERNAME", "SMTP_USER")
    SMTP_PASSWORD = _env("MAIL_PASSWORD", "SMTP_PASSWORD")
    SMTP_FROM = _env("MAIL_FROM", "MAIL_DEFAULT_SENDER", "SMTP_FROM")
    SMTP_FROM_NAME = _env("MAIL_FROM_NAME", "SMTP_FROM_NAME", default="Cut Beef")
    SMTP_USE_SSL = _bool(_env("MAIL_USE_SSL", "SMTP_USE_SSL"), default=True)
    SMTP_USE_TLS = _bool(_env("MAIL_USE_TLS", "SMTP_USE_TLS"), default=False)
    SMTP_SSL_VERIFY = _bool(_env("MAIL_SSL_VERIFY", "SMTP_SSL_VERIFY"), default=True)
    SMTP_TIMEOUT = float(_env("MAIL_TIMEOUT", "SMTP_TIMEOUT", default="25"))
    EMAIL_UPLOAD_DIR = BASE_DIR / "uploads" / "email_bot"


config = Config()
