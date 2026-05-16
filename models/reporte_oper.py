"""Reportes asociados a la hoja REPORTEOPER."""
from __future__ import annotations

from database import db


def operatividad() -> list[dict]:
    return db.fetch_all(
        "SELECT item, criterio, cant_personas, porcentaje, operarios "
        "FROM reporte_operatividad ORDER BY id"
    )


def extras_por_mes() -> list[dict]:
    return db.fetch_all(
        "SELECT item, mes_texto, mes_num, extras, "
        "       promedio_he_dia, promedio_dia_oper "
        "FROM reporte_extras ORDER BY mes_num"
    )


def kilogramos() -> list[dict]:
    return db.fetch_all(
        "SELECT item, concepto, mes_texto, mes_num, kilogramos "
        "FROM reporte_kilogramos ORDER BY concepto, mes_num"
    )
