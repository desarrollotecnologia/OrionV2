"""Modelo de usuarios para autenticacion."""
from __future__ import annotations

import bcrypt

from config import config
from database import db


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:  # noqa: BLE001
        return False


def get_by_username(username: str) -> dict | None:
    return db.fetch_one(
        "SELECT * FROM users WHERE username=%s AND activo=1 LIMIT 1",
        (username,),
    )


def create_user(
    username: str,
    password: str,
    nombre: str | None = None,
    rol: str = "admin",
) -> int:
    db.execute(
        "INSERT INTO users (username, password_hash, nombre, rol) VALUES (%s, %s, %s, %s)",
        (username, hash_password(password), nombre, rol),
    )
    row = db.fetch_one("SELECT LAST_INSERT_ID() AS id")
    return int(row["id"]) if row else 0


def ensure_default_admin() -> None:
    """Crea el usuario admin por defecto si no existe."""
    existing = get_by_username(config.DEFAULT_ADMIN_USER)
    if existing:
        return
    create_user(
        username=config.DEFAULT_ADMIN_USER,
        password=config.DEFAULT_ADMIN_PASSWORD,
        nombre="Administrador ORION",
        rol="admin",
    )
