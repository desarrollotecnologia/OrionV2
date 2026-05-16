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
        os.getenv("EXCEL_PATH", str(Path.home() / "Downloads" / "ORION.xlsx"))
    )

    # Watcher
    WATCHER_ENABLED = _bool(os.getenv("WATCHER_ENABLED"), True)
    WATCHER_DEBOUNCE_SEC = float(os.getenv("WATCHER_DEBOUNCE_SEC", "2.0"))

    # Auth
    DEFAULT_ADMIN_USER = os.getenv("DEFAULT_ADMIN_USER", "admin")
    DEFAULT_ADMIN_PASSWORD = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin")


config = Config()
