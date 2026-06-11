"""Tiempos estimados de produccion por cliente (hoja TIEMPO PRODUCCION)."""
from __future__ import annotations

from database import db


def por_cliente() -> list[dict]:
    return db.fetch_all(
        "SELECT cliente, canales, canales_promedio, tiempo_promedio, tiempo_estimado "
        "FROM tiempo_produccion WHERE cliente IS NOT NULL "
        "ORDER BY cliente"
    )


def referencia_cliente(cliente: str) -> dict | None:
    nombre = (cliente or "").strip()
    if not nombre:
        return None
    return db.fetch_one(
        "SELECT id, cliente, canales, canales_promedio, tiempo_promedio, tiempo_estimado "
        "FROM tiempo_produccion WHERE UPPER(cliente)=UPPER(%s) LIMIT 1",
        (nombre,),
    )


def upsert_referencia(payload: dict) -> dict:
    """Crea o actualiza tiempos de referencia por cliente (hoja TIEMPO PRODUCCION)."""
    cliente = (payload.get("cliente") or "").strip().upper()
    if not cliente:
        raise ValueError("El cliente es obligatorio")

    def _flt(key: str):
        v = payload.get(key)
        if v in (None, "", "null"):
            return None
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    canales = _flt("canales")
    canales_prom = _flt("canales_promedio")
    tiempo_prom = (payload.get("tiempo_promedio") or "").strip() or None
    tiempo_est = (payload.get("tiempo_estimado") or "").strip() or None

    existing = referencia_cliente(cliente)
    if existing:
        db.execute(
            "UPDATE tiempo_produccion SET canales=%s, canales_promedio=%s, "
            "tiempo_promedio=%s, tiempo_estimado=%s WHERE id=%s",
            (canales, canales_prom, tiempo_prom, tiempo_est, existing["id"]),
        )
    else:
        db.execute(
            "INSERT INTO tiempo_produccion "
            "(cliente, canales, canales_promedio, tiempo_promedio, tiempo_estimado) "
            "VALUES (%s,%s,%s,%s,%s)",
            (cliente, canales, canales_prom, tiempo_prom, tiempo_est),
        )
    return referencia_cliente(cliente) or {"cliente": cliente}


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
