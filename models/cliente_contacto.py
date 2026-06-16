"""Contactos de correo por cliente comercial."""
from __future__ import annotations

import re

from database import db

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _valid_email(email: str) -> str:
    addr = (email or "").strip().lower()
    if not _EMAIL_RE.match(addr):
        raise ValueError("Correo electronico invalido")
    return addr


def listar(activos_only: bool = True) -> list[dict]:
    sql = (
        "SELECT id, cliente, email, activo, creado_en "
        "FROM cliente_contactos "
    )
    if activos_only:
        sql += "WHERE activo = 1 "
    sql += "ORDER BY cliente ASC, email ASC"
    return db.fetch_all(sql)


def listar_con_nombres_sin_email() -> list[str]:
    """Clientes en base_datos que aun no tienen contacto activo."""
    rows = db.fetch_all(
        "SELECT DISTINCT b.cliente "
        "FROM base_datos b "
        "WHERE b.cliente IS NOT NULL AND b.cliente <> '' "
        "AND NOT EXISTS ("
        "  SELECT 1 FROM cliente_contactos c "
        "  WHERE c.cliente = b.cliente AND c.activo = 1"
        ") "
        "ORDER BY b.cliente ASC"
    )
    return [r["cliente"] for r in rows]


def crear(cliente: str, email: str) -> int:
    nombre = (cliente or "").strip().upper()
    if not nombre:
        raise ValueError("El cliente es obligatorio")
    addr = _valid_email(email)
    db.execute(
        "INSERT INTO cliente_contactos (cliente, email, activo) VALUES (%s, %s, 1)",
        (nombre, addr),
    )
    row = db.fetch_one("SELECT LAST_INSERT_ID() AS id")
    return int(row["id"]) if row else 0


def actualizar(contacto_id: int, cliente: str, email: str, activo: bool) -> None:
    nombre = (cliente or "").strip().upper()
    if not nombre:
        raise ValueError("El cliente es obligatorio")
    addr = _valid_email(email)
    db.execute(
        "UPDATE cliente_contactos SET cliente=%s, email=%s, activo=%s WHERE id=%s",
        (nombre, addr, 1 if activo else 0, contacto_id),
    )


def eliminar(contacto_id: int) -> None:
    db.execute("UPDATE cliente_contactos SET activo=0 WHERE id=%s", (contacto_id,))
