"""Indicadores del dashboard mensual (hoja ORION)."""
from __future__ import annotations

from database import db


def get_header() -> dict | None:
    """Obtiene mes / anio / fecha del periodo actual."""
    row = db.fetch_one(
        "SELECT MAX(mes) AS mes, MAX(anio) AS anio, MAX(fecha) AS fecha "
        "FROM indicadores_orion"
    )
    if not row:
        return None
    return {
        "mes": row.get("mes"),
        "anio": row.get("anio"),
        "fecha": row.get("fecha").isoformat() if row.get("fecha") else None,
    }


def get_indicadores_mayo() -> list[dict]:
    """Indicadores principales del mes (BOVINOS / PORCINOS)."""
    return db.fetch_all(
        "SELECT seccion, item, criterio, hoy, acumulado "
        "FROM indicadores_orion WHERE bloque='INDICADORES' "
        "ORDER BY seccion, item"
    )


def get_cumplimiento_metas() -> list[dict]:
    """Cumplimiento de metas con metas y ejecucion (hoy y acumulado)."""
    return db.fetch_all(
        "SELECT item, criterio, meta, ejecutado, cumplimiento, "
        "       hoy, acumulado, "
        "       (CASE WHEN bloque='CUMPLIMIENTO_HOY' THEN 'HOY' ELSE 'ACUMULADO' END) AS tipo "
        "FROM indicadores_orion "
        "WHERE bloque IN ('CUMPLIMIENTO_HOY','CUMPLIMIENTO_ACUM') "
        "ORDER BY item"
    )


def get_operatividad() -> list[dict]:
    return db.fetch_all(
        "SELECT item, criterio, cantidad AS cant_personas, porcentaje "
        "FROM indicadores_orion WHERE bloque='OPERATIVIDAD' ORDER BY item"
    )


def get_cifras_mes() -> list[dict]:
    return db.fetch_all(
        "SELECT seccion, criterio, hoy, acumulado "
        "FROM indicadores_orion WHERE bloque='CIFRAS' ORDER BY seccion, item"
    )
