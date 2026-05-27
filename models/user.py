"""Modelo de usuarios para autenticacion."""
from __future__ import annotations

import bcrypt

from config import config
from database import db

ROLES = ("admin", "user")


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:  # noqa: BLE001
        return False


def get_by_id(user_id: int) -> dict | None:
    return db.fetch_one(
        "SELECT id, username, password_hash, nombre, rol, activo, must_change_password, creado_en "
        "FROM users WHERE id=%s LIMIT 1",
        (user_id,),
    )


def get_by_username(username: str) -> dict | None:
    return db.fetch_one(
        "SELECT id, username, password_hash, nombre, rol, activo, must_change_password, creado_en "
        "FROM users WHERE username=%s AND activo=1 LIMIT 1",
        (username,),
    )


def listar() -> list[dict]:
    return db.fetch_all(
        "SELECT id, username, nombre, rol, activo, must_change_password, creado_en "
        "FROM users ORDER BY creado_en DESC, id DESC"
    )


def create_user(
    username: str,
    password: str,
    nombre: str | None = None,
    rol: str = "user",
    must_change: bool = True,
) -> int:
    username = (username or "").strip().lower()
    if not username or "@" not in username:
        raise ValueError("Ingresa un correo valido como usuario")
    if rol not in ROLES:
        raise ValueError("Rol invalido")
    if get_by_username(username):
        raise ValueError("Ese usuario ya existe")

    db.execute(
        "INSERT INTO users (username, password_hash, nombre, rol, must_change_password) "
        "VALUES (%s, %s, %s, %s, %s)",
        (username, hash_password(password), nombre, rol, 1 if must_change else 0),
    )
    row = db.fetch_one("SELECT LAST_INSERT_ID() AS id")
    return int(row["id"]) if row else 0


def cambiar_password(user_id: int, actual: str, nueva: str) -> None:
    if len(nueva) < 8:
        raise ValueError("La nueva contrasena debe tener al menos 8 caracteres")
    u = get_by_id(user_id)
    if not u or not u.get("activo"):
        raise ValueError("Usuario no encontrado")
    if not verify_password(actual, u["password_hash"]):
        raise ValueError("La contrasena actual no es correcta")
    db.execute(
        "UPDATE users SET password_hash=%s, must_change_password=0 WHERE id=%s",
        (hash_password(nueva), user_id),
    )


def restablecer_password(user_id: int) -> None:
    u = get_by_id(user_id)
    if not u or not u.get("activo"):
        raise ValueError("Usuario no encontrado")
    db.execute(
        "UPDATE users SET password_hash=%s, must_change_password=1 WHERE id=%s",
        (hash_password(config.DEFAULT_RESET_PASSWORD), user_id),
    )


def toggle_activo(user_id: int, activo: bool) -> None:
    u = get_by_id(user_id)
    if not u:
        raise ValueError("Usuario no encontrado")
    db.execute("UPDATE users SET activo=%s WHERE id=%s", (1 if activo else 0, user_id))


def eliminar(user_id: int) -> None:
    u = get_by_id(user_id)
    if not u:
        raise ValueError("Usuario no encontrado")
    if u.get("rol") == "admin" and u.get("activo"):
        otros = db.fetch_one(
            "SELECT COUNT(*) AS n FROM users WHERE rol='admin' AND activo=1 AND id != %s",
            (user_id,),
        )
        if not otros or int(otros["n"]) < 1:
            raise ValueError("No puedes eliminar al unico administrador activo")
    db.execute("DELETE FROM users WHERE id=%s", (user_id,))


def ensure_default_admin() -> None:
    """Crea el administrador inicial de Colbeef si no existe."""
    username = config.DEFAULT_ADMIN_USER.strip().lower()
    existing = db.fetch_one("SELECT id FROM users WHERE username=%s LIMIT 1", (username,))
    if existing:
        return
    create_user(
        username=username,
        password=config.DEFAULT_ADMIN_PASSWORD,
        nombre="Coordinacion Desposte",
        rol="admin",
        must_change=True,
    )
