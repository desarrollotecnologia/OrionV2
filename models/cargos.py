"""Hoja CARGOS (personal)."""
from __future__ import annotations

from database import db


def todos() -> list[dict]:
    return db.fetch_all(
        "SELECT numero, nombre, cargo FROM cargos ORDER BY numero"
    )


def por_cargo() -> list[dict]:
    return db.fetch_all(
        "SELECT cargo, COUNT(*) AS personas FROM cargos "
        "WHERE cargo IS NOT NULL AND cargo<>'' GROUP BY cargo ORDER BY personas DESC"
    )
