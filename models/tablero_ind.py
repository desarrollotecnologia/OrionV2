"""Tablero de indicadores semanal (hoja TABLERO IND.)."""
from __future__ import annotations

from database import db


def por_especie(especie: str) -> list[dict]:
    return db.fetch_all(
        "SELECT semana, meta, ejecucion, cumplimiento "
        "FROM tablero_ind WHERE especie=%s ORDER BY semana",
        (especie.upper(),),
    )


def todos() -> list[dict]:
    return db.fetch_all(
        "SELECT especie, semana, meta, ejecucion, cumplimiento "
        "FROM tablero_ind ORDER BY especie, semana"
    )
