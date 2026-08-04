"""Tablero mensual calculado EN VIVO desde el detalle de la base de datos.

A diferencia de `models.indicadores` (que solo lee la hoja "ORION" del Excel),
este modulo recalcula los indicadores del mes a partir de las tablas de detalle
(base_datos, merma_frio, paradas_std). Asi el tablero refleja siempre lo ultimo
que se haya importado, sin depender de que la hoja resumen este actualizada.
"""
from __future__ import annotations

from calendar import monthrange
from datetime import date
from typing import Any

from database import db

MES_TEXTO = ['', 'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
             'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']


# --------------------------- Periodos ---------------------------

def meses_disponibles(limit: int = 24) -> list[dict[str, Any]]:
    """Meses (anio, mes) que tienen datos en base_datos, del mas reciente al mas viejo."""
    rows = db.fetch_all(
        "SELECT YEAR(fecha) AS anio, MONTH(fecha) AS mes, "
        "       COUNT(*) AS registros, MAX(fecha) AS ultima "
        "FROM base_datos WHERE fecha IS NOT NULL "
        "GROUP BY YEAR(fecha), MONTH(fecha) "
        "ORDER BY anio DESC, mes DESC "
        "LIMIT %s",
        (limit,),
    )
    out: list[dict[str, Any]] = []
    for r in rows:
        m = int(r["mes"]) if r.get("mes") else 0
        a = int(r["anio"]) if r.get("anio") else 0
        if not m or not a:
            continue
        out.append({
            "anio": a,
            "mes": m,
            "mes_texto": MES_TEXTO[m],
            "label": f"{MES_TEXTO[m].capitalize()} {a}",
            "registros": int(r["registros"] or 0),
            "ultima": r["ultima"].isoformat() if r.get("ultima") else None,
        })
    return out


def mes_mas_reciente() -> tuple[int, int]:
    ms = meses_disponibles(1)
    if ms:
        return ms[0]["anio"], ms[0]["mes"]
    hoy = date.today()
    return hoy.year, hoy.month


def _rango(anio: int, mes: int) -> tuple[str, str]:
    ultimo = monthrange(anio, mes)[1]
    return f"{anio:04d}-{mes:02d}-01", f"{anio:04d}-{mes:02d}-{ultimo:02d}"


def _rango_anio(anio: int, mes: int) -> tuple[str, str]:
    """Del 1 de enero hasta el fin del mes seleccionado (acumulado del anio)."""
    ultimo = monthrange(anio, mes)[1]
    return f"{anio:04d}-01-01", f"{anio:04d}-{mes:02d}-{ultimo:02d}"


def header(anio: int, mes: int) -> dict[str, Any]:
    desde, hasta = _rango(anio, mes)
    row = db.fetch_one(
        "SELECT MAX(fecha) AS f FROM base_datos WHERE fecha BETWEEN %s AND %s",
        (desde, hasta),
    )
    fecha = row.get("f") if row else None
    return {
        "mes": mes,
        "anio": anio,
        "fecha": fecha.isoformat() if fecha else None,
    }


# --------------------------- Indicadores del mes ---------------------------

def _aggr_por_especie(desde: str, hasta: str) -> dict[str, dict[str, Any]]:
    rows = db.fetch_all(
        "SELECT UPPER(COALESCE(NULLIF(TRIM(especie),''),'SIN ESPECIE')) AS especie, "
        "       COALESCE(SUM(canales),0) AS canales, "
        "       COALESCE(SUM(kilos),0) AS kilos, "
        "       COALESCE(SUM(CASE WHEN UPPER(proceso) LIKE '%%DESPOSTE%%'   THEN kilos ELSE 0 END),0) AS kilos_desposte, "
        "       COALESCE(SUM(CASE WHEN UPPER(proceso) LIKE '%%PORCIONADO%%' THEN kilos ELSE 0 END),0) AS kilos_porcionado, "
        "       COUNT(DISTINCT lote) AS lotes "
        "FROM base_datos "
        "WHERE fecha BETWEEN %s AND %s "
        "GROUP BY UPPER(COALESCE(NULLIF(TRIM(especie),''),'SIN ESPECIE'))",
        (desde, hasta),
    )
    return {r["especie"]: r for r in rows}


_METRICAS = [
    ("Canales procesados", "canales"),
    ("Kilos desposte", "kilos_desposte"),
    ("Kilos porcionado", "kilos_porcionado"),
    ("Kilos totales", "kilos"),
    ("Lotes procesados", "lotes"),
]


def indicadores(anio: int, mes: int) -> list[dict[str, Any]]:
    """# canales, kilos por proceso y lotes por especie (mes y acumulado del anio)."""
    d_mes, h_mes = _rango(anio, mes)
    d_anio, h_anio = _rango_anio(anio, mes)
    mes_map = _aggr_por_especie(d_mes, h_mes)
    anio_map = _aggr_por_especie(d_anio, h_anio)

    orden = ["BOVINOS", "PORCINOS", "BUFALINOS"]
    especies = [e for e in orden if e in mes_map or e in anio_map]
    for e in list(mes_map.keys()) + list(anio_map.keys()):
        if e not in especies:
            especies.append(e)

    filas: list[dict[str, Any]] = []
    for e in especies:
        m = mes_map.get(e, {})
        a = anio_map.get(e, {})
        for i, (crit, key) in enumerate(_METRICAS, 1):
            filas.append({
                "seccion": e,
                "item": i,
                "criterio": crit,
                "hoy": float(m.get(key, 0) or 0),
                "acumulado": float(a.get(key, 0) or 0),
            })
    return filas


# --------------------------- Cifras: % merma ---------------------------

def _merma_por_especie(desde: str, hasta: str) -> dict[str, float]:
    rows = db.fetch_all(
        "SELECT UPPER(COALESCE(NULLIF(TRIM(especie),''),'SIN ESPECIE')) AS especie, "
        "       AVG(merma_frio) AS m "
        "FROM merma_frio "
        "WHERE merma_frio IS NOT NULL AND fecha_produccion BETWEEN %s AND %s "
        "GROUP BY UPPER(COALESCE(NULLIF(TRIM(especie),''),'SIN ESPECIE'))",
        (desde, hasta),
    )
    return {r["especie"]: r["m"] for r in rows}


def cifras(anio: int, mes: int) -> list[dict[str, Any]]:
    """% merma frio por especie (promedio del mes y del acumulado del anio)."""
    d_mes, h_mes = _rango(anio, mes)
    d_anio, h_anio = _rango_anio(anio, mes)
    mes_map = _merma_por_especie(d_mes, h_mes)
    anio_map = _merma_por_especie(d_anio, h_anio)
    especies = []
    for e in ["BOVINOS", "PORCINOS", "BUFALINOS"]:
        if e in mes_map or e in anio_map:
            especies.append(e)
    for e in list(mes_map.keys()) + list(anio_map.keys()):
        if e not in especies:
            especies.append(e)

    out: list[dict[str, Any]] = []
    for e in especies:
        vm = mes_map.get(e)
        va = anio_map.get(e)
        out.append({
            "seccion": e,
            "item": 1,
            "criterio": "% MERMA",
            "hoy": float(vm) if vm is not None else None,
            "acumulado": float(va) if va is not None else None,
        })
    return out


# --------------------------- Velocidades del mes ---------------------------

def velocidades(anio: int, mes: int, limit: int = 120) -> list[dict[str, Any]]:
    desde, hasta = _rango(anio, mes)
    return db.fetch_all(
        "SELECT fecha, cliente, especie, proceso, "
        "       velocidad_canal_h, velocidad_kilos_h "
        "FROM base_datos "
        "WHERE fecha BETWEEN %s AND %s AND velocidad_canal_h IS NOT NULL "
        "ORDER BY fecha DESC, id DESC "
        "LIMIT %s",
        (desde, hasta, limit),
    )


# --------------------------- KPIs resumen ---------------------------

def kpis(anio: int, mes: int) -> dict[str, Any]:
    """Totales del mes para tarjetas rapidas."""
    desde, hasta = _rango(anio, mes)
    base = db.fetch_one(
        "SELECT COALESCE(SUM(canales),0) AS canales, COALESCE(SUM(kilos),0) AS kilos, "
        "       COUNT(DISTINCT lote) AS lotes, COUNT(DISTINCT cliente) AS clientes, "
        "       COUNT(*) AS registros "
        "FROM base_datos WHERE fecha BETWEEN %s AND %s",
        (desde, hasta),
    ) or {}
    merma = db.fetch_one(
        "SELECT AVG(merma_frio) AS m, COUNT(*) AS lotes "
        "FROM merma_frio WHERE merma_frio IS NOT NULL AND fecha_produccion BETWEEN %s AND %s",
        (desde, hasta),
    ) or {}
    paradas = db.fetch_one(
        "SELECT COALESCE(SUM(total),0) AS min_paradas, COUNT(*) AS dias "
        "FROM paradas_std WHERE fecha BETWEEN %s AND %s",
        (desde, hasta),
    ) or {}
    return {
        "canales": float(base.get("canales", 0) or 0),
        "kilos": float(base.get("kilos", 0) or 0),
        "lotes": int(base.get("lotes", 0) or 0),
        "clientes": int(base.get("clientes", 0) or 0),
        "registros": int(base.get("registros", 0) or 0),
        "merma_prom": float(merma["m"]) if merma.get("m") is not None else None,
        "merma_lotes": int(merma.get("lotes", 0) or 0),
        "paradas_min": float(paradas.get("min_paradas", 0) or 0),
        "paradas_dias": int(paradas.get("dias", 0) or 0),
    }
