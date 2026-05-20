"""Paradas estandar (hoja PARADASTD + capturas manuales)."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from database import db

# (columna BD, etiqueta human, etiqueta corta para UI / forms)
CATEGORIAS = [
    ("tardanza_inicio",      "Tardanza de inicio en produccion",         "tardanza"),
    ("lavado_desinfeccion",  "Lavado y desinfeccion (L/D)",              "lavado"),
    ("dano_sistema_1",       "Dano en sistema de etiquetado",            "etiquetado"),
    ("dano_sistema_2",       "Fallas en sistema de pesaje de canales",   "pesaje"),
    ("fallas_electricas",    "Fallas electricas o cortes de luz",        "electrico"),
    ("fallas_sistema",       "Fallas en el sistema de sellado Cryovac",  "cryovac"),
    ("falta_canastillas",    "Falta de canastillas",                     "canastillas"),
    ("parada_alimentacion",  "Parada por alimentacion",                  "alimentacion"),
    ("recepcion_entrega",    "Recepcion y/o entrega de canales",         "recepcion"),
    ("reunion_magica",       "Reunion magica",                           "reunion"),
]

CATEGORIA_COLS = [c for c, _, _ in CATEGORIAS]


# --------------- Helpers ---------------

def _ultima_fecha() -> "object | None":
    row = db.fetch_one("SELECT MAX(fecha) AS f FROM paradas_std WHERE fecha IS NOT NULL")
    return row["f"] if row else None


def _to_min(value: Any) -> float:
    if value is None or value == "":
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


# --------------- Lecturas para dashboard ---------------

def recientes(limit: int = 30) -> list[dict]:
    return db.fetch_all(
        "SELECT * FROM paradas_std WHERE fecha IS NOT NULL "
        "ORDER BY fecha DESC, id DESC LIMIT %s",
        (limit,),
    )


def total_por_categoria(dias: int = 365) -> list[dict]:
    """Suma de cada tipo de parada en los ultimos N dias contando desde la
    ultima fecha registrada (no desde hoy)."""
    ultima = _ultima_fecha()
    select = ", ".join([f"COALESCE(SUM({c}),0) AS {c}" for c in CATEGORIA_COLS])
    if ultima is None:
        sql = f"SELECT {select} FROM paradas_std"
        row = db.fetch_one(sql) or {}
    else:
        sql = (
            f"SELECT {select} FROM paradas_std "
            "WHERE fecha BETWEEN DATE_SUB(%s, INTERVAL %s DAY) AND %s"
        )
        row = db.fetch_one(sql, (ultima, dias, ultima)) or {}
    out = []
    for col, label, _ in CATEGORIAS:
        out.append({
            "key": col,
            "categoria": label,
            "total": float(row.get(col, 0) or 0),
        })
    return out


def tendencia_diaria(dias: int = 60) -> list[dict]:
    ultima = _ultima_fecha()
    if ultima is None:
        return []
    return db.fetch_all(
        "SELECT fecha, total FROM paradas_std "
        "WHERE fecha BETWEEN DATE_SUB(%s, INTERVAL %s DAY) AND %s "
        "ORDER BY fecha ASC",
        (ultima, dias, ultima),
    )


def resumen() -> dict:
    """KPIs principales para el dashboard de paradas."""
    ultima = _ultima_fecha()
    if ultima is None:
        return {
            "ultima_fecha": None,
            "total_general": 0.0,
            "promedio_diario": 0.0,
            "dias_con_paradas": 0,
            "total_mes": 0.0,
            "total_anio": 0.0,
            "peor_dia": None,
            "categoria_top": None,
        }
    base = db.fetch_one(
        "SELECT COUNT(*) AS dias, COALESCE(SUM(total),0) AS total, COALESCE(AVG(total),0) AS prom "
        "FROM paradas_std WHERE total IS NOT NULL AND total > 0"
    ) or {}
    mes = db.fetch_one(
        "SELECT COALESCE(SUM(total),0) AS t FROM paradas_std "
        "WHERE YEAR(fecha)=YEAR(%s) AND MONTH(fecha)=MONTH(%s)",
        (ultima, ultima),
    ) or {}
    anio = db.fetch_one(
        "SELECT COALESCE(SUM(total),0) AS t FROM paradas_std WHERE YEAR(fecha)=YEAR(%s)",
        (ultima,),
    ) or {}
    peor = db.fetch_one(
        "SELECT fecha, total FROM paradas_std WHERE total IS NOT NULL "
        "ORDER BY total DESC LIMIT 1"
    )
    # Categoria con mas tiempo total historico
    select = ", ".join([f"COALESCE(SUM({c}),0) AS {c}" for c in CATEGORIA_COLS])
    totales = db.fetch_one(f"SELECT {select} FROM paradas_std") or {}
    cat_top = None
    cat_max = 0.0
    for col, label, _ in CATEGORIAS:
        v = float(totales.get(col, 0) or 0)
        if v > cat_max:
            cat_max = v
            cat_top = {"categoria": label, "total": v, "key": col}
    return {
        "ultima_fecha": ultima,
        "total_general": float(base.get("total", 0) or 0),
        "promedio_diario": float(base.get("prom", 0) or 0),
        "dias_con_paradas": int(base.get("dias", 0) or 0),
        "total_mes": float(mes.get("t", 0) or 0),
        "total_anio": float(anio.get("t", 0) or 0),
        "peor_dia": peor,
        "categoria_top": cat_top,
    }


def evolucion_mensual(meses: int = 12) -> list[dict]:
    """Total de paradas por mes (hasta los ultimos N meses con datos)."""
    ultima = _ultima_fecha()
    if ultima is None:
        return []
    return db.fetch_all(
        "SELECT DATE_FORMAT(fecha, '%%Y-%%m') AS periodo, "
        "       MIN(fecha) AS desde, MAX(fecha) AS hasta, "
        "       COALESCE(SUM(total),0) AS total "
        "FROM paradas_std "
        "WHERE fecha BETWEEN DATE_SUB(%s, INTERVAL %s MONTH) AND %s "
        "GROUP BY DATE_FORMAT(fecha, '%%Y-%%m') "
        "ORDER BY periodo ASC",
        (ultima, meses, ultima),
    )


# --------------- Captura manual ---------------

def manuales_recientes(limit: int = 50) -> list[dict]:
    return db.fetch_all(
        "SELECT * FROM paradas_std WHERE origen = 'manual' "
        "ORDER BY creado_en DESC, id DESC LIMIT %s",
        (limit,),
    )


def insertar_manual(payload: dict) -> int:
    fecha = payload.get("fecha")
    if isinstance(fecha, str):
        try:
            fecha = datetime.strptime(fecha, "%Y-%m-%d").date()
        except ValueError:
            raise ValueError("Fecha invalida (formato YYYY-MM-DD)")
    if not isinstance(fecha, date):
        raise ValueError("Fecha obligatoria")

    valores = {col: _to_min(payload.get(col)) for col in CATEGORIA_COLS}
    total = sum(valores.values())
    observaciones = (payload.get("observaciones") or "").strip()[:255] or None

    sql = (
        "INSERT INTO paradas_std (fecha, "
        + ", ".join(CATEGORIA_COLS)
        + ", total, observaciones, origen) "
        "VALUES (%s, " + ", ".join(["%s"] * len(CATEGORIA_COLS)) + ", %s, %s, 'manual')"
    )
    params = (
        fecha,
        *[valores[c] for c in CATEGORIA_COLS],
        total,
        observaciones,
    )
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return int(cur.lastrowid or 0)


def eliminar_manual(registro_id: int) -> int:
    return db.execute(
        "DELETE FROM paradas_std WHERE id = %s AND origen = 'manual'",
        (registro_id,),
    )
