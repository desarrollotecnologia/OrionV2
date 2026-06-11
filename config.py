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

    # URLs publicas (portal site.html y app BeefData)
    APP_PUBLIC_URL = os.getenv("APP_PUBLIC_URL", "http://192.168.20.205:8004/")
    SITE_PORTAL_URL = os.getenv("SITE_PORTAL_URL", "http://192.168.20.205:8000/site.html")


config = Config()
