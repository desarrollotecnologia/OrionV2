"""Bitacora de sincronizaciones del Excel."""
from __future__ import annotations

from database import db


def add(estado: str, archivo: str, mensaje: str = "", duracion: float | None = None) -> None:
    db.execute(
        "INSERT INTO sync_log (archivo, estado, mensaje, duracion_seg) "
        "VALUES (%s, %s, %s, %s)",
        (archivo, estado, mensaje, duracion),
    )


def ultimo() -> dict | None:
    return db.fetch_one(
        "SELECT sincronizado_en, archivo, estado, mensaje, duracion_seg "
        "FROM sync_log ORDER BY id DESC LIMIT 1"
    )


def listar(limit: int = 20) -> list[dict]:
    return db.fetch_all(
        "SELECT sincronizado_en, archivo, estado, mensaje, duracion_seg "
        "FROM sync_log ORDER BY id DESC LIMIT %s",
        (limit,),
    )
