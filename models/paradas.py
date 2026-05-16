"""Paradas estandar (hoja PARADASTD)."""
from __future__ import annotations

from database import db

# Categorias usadas en la grafica
CATEGORIAS = [
    ("tardanza_inicio",      "Tardanza de inicio"),
    ("lavado_desinfeccion",  "Lavado y desinfeccion"),
    ("dano_sistema_1",       "Dano en sistema 1"),
    ("dano_sistema_2",       "Dano en sistema 2"),
    ("fallas_electricas",    "Fallas electricas"),
    ("fallas_sistema",       "Fallas en sistema"),
    ("falta_canastillas",    "Falta de canastillas"),
    ("parada_alimentacion",  "Parada por alimentacion"),
    ("recepcion_entrega",    "Recepcion / entrega"),
    ("reunion_magica",       "Reunion magica"),
]


def _ultima_fecha() -> "object | None":
    row = db.fetch_one("SELECT MAX(fecha) AS f FROM paradas_std WHERE fecha IS NOT NULL")
    return row["f"] if row else None


def recientes(limit: int = 30) -> list[dict]:
    return db.fetch_all(
        "SELECT * FROM paradas_std WHERE fecha IS NOT NULL "
        "ORDER BY fecha DESC LIMIT %s",
        (limit,),
    )


def total_por_categoria(dias: int = 365) -> list[dict]:
    """Suma de cada tipo de parada en los ultimos N dias contando desde la
    ultima fecha registrada (no desde hoy), para no devolver 0 cuando los
    datos del Excel son mas antiguos."""
    ultima = _ultima_fecha()
    select = ", ".join([f"COALESCE(SUM({c}),0) AS {c}" for c, _ in CATEGORIAS])
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
    for col, label in CATEGORIAS:
        out.append({"categoria": label, "total": float(row.get(col, 0) or 0)})
    return out


def tendencia_diaria(dias: int = 60) -> list[dict]:
    """Tendencia diaria de paradas tomando la ventana hasta la ultima fecha
    registrada en los datos."""
    ultima = _ultima_fecha()
    if ultima is None:
        return []
    return db.fetch_all(
        "SELECT fecha, total FROM paradas_std "
        "WHERE fecha BETWEEN DATE_SUB(%s, INTERVAL %s DAY) AND %s "
        "ORDER BY fecha ASC",
        (ultima, dias, ultima),
    )
