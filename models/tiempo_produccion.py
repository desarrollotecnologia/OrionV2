"""Tiempos estimados de produccion por cliente (hoja TIEMPO PRODUCCION)."""
from __future__ import annotations

from database import db


def por_cliente() -> list[dict]:
    return db.fetch_all(
        "SELECT cliente, canales, canales_promedio, tiempo_promedio, tiempo_estimado "
        "FROM tiempo_produccion WHERE cliente IS NOT NULL "
        "ORDER BY cliente"
    )


def tiempo_total_dia() -> dict:
    """Calcula el tiempo total de produccion del ultimo dia laborado."""
    row = db.fetch_one(
        "SELECT MAX(fecha) AS fecha, "
        "       MIN(hora_inicio) AS hora_inicio, "
        "       MAX(hora_fin) AS hora_fin, "
        "       SEC_TO_TIME(SUM(TIME_TO_SEC(tiempo_total))) AS tiempo_total "
        "FROM base_datos "
        "WHERE fecha = (SELECT MAX(fecha) FROM base_datos) "
        "  AND tiempo_total IS NOT NULL AND tiempo_total <> ''"
    )
    if not row:
        return {}
    return {
        "fecha": row.get("fecha").isoformat() if row.get("fecha") else None,
        "hora_inicio": str(row.get("hora_inicio") or ""),
        "hora_fin": str(row.get("hora_fin") or ""),
        "tiempo_total": str(row.get("tiempo_total") or ""),
    }
