"""Bitacora historica de cargas y estado de actualizacion de datos."""
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


def ultima_actualizacion_datos() -> dict | None:
    """Devuelve la actualizacion mas reciente guardada directamente en MySQL."""
    row = db.fetch_one(
        "SELECT MAX(ts) AS sincronizado_en FROM ("
        "  SELECT MAX(creado_en) AS ts FROM base_datos "
        "  UNION ALL "
        "  SELECT MAX(creado_en) AS ts FROM merma_frio "
        "  UNION ALL "
        "  SELECT MAX(creado_en) AS ts FROM paradas_std "
        "  UNION ALL "
        "  SELECT MAX(actualizado_en) AS ts FROM indicadores_orion "
        ") fechas"
    )
    if not row or not row.get("sincronizado_en"):
        return ultimo()
    return {
        "sincronizado_en": row["sincronizado_en"],
        "archivo": "MySQL",
        "estado": "ok",
        "mensaje": "Datos guardados en base de datos",
        "duracion_seg": None,
    }


def listar(limit: int = 20) -> list[dict]:
    return db.fetch_all(
        "SELECT sincronizado_en, archivo, estado, mensaje, duracion_seg "
        "FROM sync_log ORDER BY id DESC LIMIT %s",
        (limit,),
    )
