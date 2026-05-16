"""Seguimiento ejecucion presupuesto canales (hoja PPTO DESP.)."""
from __future__ import annotations

from database import db


def serie_anio(anio: int | None = None) -> list[dict]:
    if anio is None:
        row = db.fetch_one("SELECT MAX(anio) AS anio FROM ppto_desp")
        anio = row["anio"] if row and row["anio"] else None
    if anio is None:
        return []
    return db.fetch_all(
        "SELECT mes_num, mes_texto, meta, ejecucion, cumplimiento "
        "FROM ppto_desp WHERE anio=%s ORDER BY mes_num",
        (anio,),
    )


def kpi_actual() -> dict:
    row = db.fetch_one(
        "SELECT mes_num, mes_texto, meta, ejecucion, cumplimiento "
        "FROM ppto_desp WHERE mes_num=MONTH(CURDATE()) AND anio=YEAR(CURDATE()) "
        "LIMIT 1"
    )
    return row or {}
