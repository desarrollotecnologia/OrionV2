"""Paradas estandar (hoja PARADASTD + capturas manuales)."""
from __future__ import annotations

import json
import re
import unicodedata
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
CATEGORIA_MAP = {c: label for c, label, _ in CATEGORIAS}


# --------------- Helpers ---------------

def _ultima_fecha(anio: int | None = None) -> "object | None":
    if anio is None:
        row = db.fetch_one("SELECT MAX(fecha) AS f FROM paradas_std WHERE fecha IS NOT NULL")
    else:
        row = db.fetch_one(
            "SELECT MAX(fecha) AS f FROM paradas_std WHERE fecha IS NOT NULL AND YEAR(fecha) = %s",
            (anio,),
        )
    return row["f"] if row else None


def _anio_actual() -> int:
    return date.today().year


def _to_min(value: Any) -> float:
    if value is None or value == "":
        return 0.0
    try:
        v = float(value)
        return v if v >= 0 else 0.0
    except (TypeError, ValueError):
        return 0.0


def _slugify(text: str) -> str:
    t = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    t = re.sub(r"[^a-zA-Z0-9]+", "_", t.lower()).strip("_")
    return (t[:50] or "categoria")


def _parse_extras(raw: Any) -> dict[str, float]:
    if not raw:
        return {}
    if isinstance(raw, dict):
        data = raw
    elif isinstance(raw, str):
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return {}
    else:
        return {}
    out: dict[str, float] = {}
    for k, v in data.items():
        m = _to_min(v)
        if m > 0:
            out[str(k)] = m
    return out


def _extras_json(extras: dict[str, float]) -> str | None:
    if not extras:
        return None
    return json.dumps(extras, ensure_ascii=False)


def _ensure_categorias_seed() -> None:
    count = db.fetch_one("SELECT COUNT(*) AS n FROM paradas_categorias") or {"n": 0}
    if int(count.get("n") or 0) > 0:
        return
    rows = [
        (col, label, col, 1)
        for col, label, _ in CATEGORIAS
    ]
    db.executemany(
        "INSERT INTO paradas_categorias (clave, etiqueta, columna_bd, es_sistema) "
        "VALUES (%s, %s, %s, %s)",
        rows,
    )


def _categoria_por_clave(clave: str) -> dict | None:
    return db.fetch_one(
        "SELECT * FROM paradas_categorias WHERE clave = %s AND activo = 1",
        (clave,),
    )


# --------------- Catalogo categorias ---------------

def listar_categorias() -> list[dict]:
    _ensure_categorias_seed()
    rows = db.fetch_all(
        "SELECT clave, etiqueta, columna_bd, es_sistema "
        "FROM paradas_categorias WHERE activo = 1 "
        "ORDER BY es_sistema DESC, etiqueta ASC"
    )
    if rows:
        return rows
    return [
        {"clave": col, "etiqueta": label, "columna_bd": col, "es_sistema": 1}
        for col, label, _ in CATEGORIAS
    ]


def agregar_categoria(etiqueta: str) -> dict:
    _ensure_categorias_seed()
    etiqueta = (etiqueta or "").strip()
    if len(etiqueta) < 2:
        raise ValueError("La categoria debe tener al menos 2 caracteres")
    if len(etiqueta) > 200:
        raise ValueError("La categoria es demasiado larga (max 200)")

    existente = db.fetch_one(
        "SELECT clave, etiqueta, columna_bd, es_sistema FROM paradas_categorias "
        "WHERE LOWER(etiqueta) = LOWER(%s) AND activo = 1",
        (etiqueta,),
    )
    if existente:
        return existente

    base = _slugify(etiqueta)
    clave = base if base not in CATEGORIA_COLS else f"cat_{base}"
    n = 1
    while db.fetch_one("SELECT 1 FROM paradas_categorias WHERE clave = %s", (clave,)):
        n += 1
        clave = f"{base}_{n}" if base not in CATEGORIA_COLS else f"cat_{base}_{n}"

    db.execute(
        "INSERT INTO paradas_categorias (clave, etiqueta, columna_bd, es_sistema) "
        "VALUES (%s, %s, NULL, 0)",
        (clave, etiqueta),
    )
    return {
        "clave": clave,
        "etiqueta": etiqueta,
        "columna_bd": None,
        "es_sistema": 0,
    }


def _lineas_desde_payload(payload: dict) -> list[tuple[str, float]]:
    """Normaliza lineas [{categoria_key|clave, minutos}] o formato legacy."""
    lineas = payload.get("lineas")
    if isinstance(lineas, list) and lineas:
        out: dict[str, float] = {}
        for item in lineas:
            if not isinstance(item, dict):
                continue
            key = (item.get("categoria_key") or item.get("clave") or "").strip()
            if not key:
                continue
            mins = _to_min(item.get("minutos"))
            if mins <= 0:
                continue
            out[key] = out.get(key, 0.0) + mins
        return list(out.items())

    out = {}
    for col in CATEGORIA_COLS:
        mins = _to_min(payload.get(col))
        if mins > 0:
            out[col] = mins
    return list(out.items())


def _agregar_a_mapas(
    key: str,
    mins: float,
    columnas: dict[str, float],
    extras: dict[str, float],
) -> None:
    cat = _categoria_por_clave(key)
    col = None
    if cat:
        col = cat.get("columna_bd")
    elif key in CATEGORIA_COLS:
        col = key
    if col and col in CATEGORIA_COLS:
        columnas[col] = columnas.get(col, 0.0) + mins
    else:
        extras[key] = extras.get(key, 0.0) + mins


def _etiqueta_clave(clave: str) -> str:
    cat = _categoria_por_clave(clave)
    if cat:
        return cat["etiqueta"]
    return CATEGORIA_MAP.get(clave, clave.replace("_", " ").title())


def detalle_registro(row: dict) -> list[dict]:
    items: list[dict] = []
    for col in CATEGORIA_COLS:
        v = _to_min(row.get(col))
        if v > 0:
            items.append({
                "clave": col,
                "categoria": _etiqueta_clave(col),
                "minutos": v,
            })
    for clave, v in _parse_extras(row.get("extras")).items():
        items.append({
            "clave": clave,
            "categoria": _etiqueta_clave(clave),
            "minutos": v,
        })
    items.sort(key=lambda x: x["minutos"], reverse=True)
    return items


def _sumar_extras_historicos() -> dict[str, float]:
    rows = db.fetch_all(
        "SELECT extras FROM paradas_std WHERE extras IS NOT NULL"
    )
    totales: dict[str, float] = {}
    for row in rows:
        for clave, mins in _parse_extras(row.get("extras")).items():
            totales[clave] = totales.get(clave, 0.0) + mins
    return totales


# --------------- Lecturas para dashboard ---------------

def recientes(limit: int = 30, anio: int | None = None,
              desde: str | None = None, hasta: str | None = None) -> list[dict]:
    if desde and hasta:
        rows = db.fetch_all(
            "SELECT * FROM paradas_std WHERE fecha BETWEEN %s AND %s "
            "ORDER BY fecha DESC, id DESC LIMIT %s",
            (desde, hasta, limit),
        )
    elif anio is None:
        rows = db.fetch_all(
            "SELECT * FROM paradas_std WHERE fecha IS NOT NULL "
            "ORDER BY fecha DESC, id DESC LIMIT %s",
            (limit,),
        )
    else:
        rows = db.fetch_all(
            "SELECT * FROM paradas_std WHERE fecha IS NOT NULL AND YEAR(fecha) = %s "
            "ORDER BY fecha DESC, id DESC LIMIT %s",
            (anio, limit),
        )
    for row in rows:
        row["detalle"] = detalle_registro(row)
    return rows


def total_por_categoria(dias: int = 365, anio: int | None = None,
                        desde: str | None = None, hasta: str | None = None) -> list[dict]:
    select = ", ".join([f"COALESCE(SUM({c}),0) AS {c}" for c in CATEGORIA_COLS])
    if desde and hasta:
        sql = f"SELECT {select} FROM paradas_std WHERE fecha BETWEEN %s AND %s"
        row = db.fetch_one(sql, (desde, hasta)) or {}
        extra_rows = db.fetch_all(
            "SELECT extras FROM paradas_std WHERE extras IS NOT NULL AND fecha BETWEEN %s AND %s",
            (desde, hasta),
        )
    elif anio is not None:
        sql = f"SELECT {select} FROM paradas_std WHERE YEAR(fecha) = %s"
        row = db.fetch_one(sql, (anio,)) or {}
        extra_rows = db.fetch_all(
            "SELECT extras FROM paradas_std WHERE extras IS NOT NULL AND YEAR(fecha) = %s",
            (anio,),
        )
    else:
        ultima = _ultima_fecha()
        if ultima is None:
            sql = f"SELECT {select} FROM paradas_std"
            row = db.fetch_one(sql) or {}
            extra_rows = db.fetch_all("SELECT extras FROM paradas_std WHERE extras IS NOT NULL")
        else:
            sql = (
                f"SELECT {select} FROM paradas_std "
                "WHERE fecha BETWEEN DATE_SUB(%s, INTERVAL %s DAY) AND %s"
            )
            row = db.fetch_one(sql, (ultima, dias, ultima)) or {}
            extra_rows = db.fetch_all(
                "SELECT extras FROM paradas_std "
                "WHERE extras IS NOT NULL "
                "AND fecha BETWEEN DATE_SUB(%s, INTERVAL %s DAY) AND %s",
                (ultima, dias, ultima),
            )

    out = []
    for col, label, _ in CATEGORIAS:
        out.append({
            "key": col,
            "categoria": label,
            "total": float(row.get(col, 0) or 0),
            "es_sistema": True,
        })

    extras_tot: dict[str, float] = {}
    for er in extra_rows:
        for clave, mins in _parse_extras(er.get("extras")).items():
            extras_tot[clave] = extras_tot.get(clave, 0.0) + mins
    for clave, total in sorted(extras_tot.items(), key=lambda x: x[1], reverse=True):
        if total <= 0:
            continue
        out.append({
            "key": clave,
            "categoria": _etiqueta_clave(clave),
            "total": total,
            "es_sistema": False,
        })
    out.sort(key=lambda x: x["total"], reverse=True)
    return out


def tendencia_diaria(dias: int = 60, anio: int | None = None,
                     desde: str | None = None, hasta: str | None = None) -> list[dict]:
    if desde and hasta:
        return db.fetch_all(
            "SELECT fecha, total FROM paradas_std "
            "WHERE fecha BETWEEN %s AND %s "
            "ORDER BY fecha ASC",
            (desde, hasta),
        )
    if anio is not None:
        return db.fetch_all(
            "SELECT fecha, total FROM paradas_std "
            "WHERE YEAR(fecha) = %s "
            "ORDER BY fecha ASC",
            (anio,),
        )
    ultima = _ultima_fecha()
    if ultima is None:
        return []
    return db.fetch_all(
        "SELECT fecha, total FROM paradas_std "
        "WHERE fecha BETWEEN DATE_SUB(%s, INTERVAL %s DAY) AND %s "
        "ORDER BY fecha ASC",
        (ultima, dias, ultima),
    )


def resumen(anio: int | None = None) -> dict:
    filtro_anio = anio if anio is not None else None
    ultima = _ultima_fecha(filtro_anio)
    if ultima is None:
        return {
            "anio": filtro_anio or _anio_actual(),
            "ultima_fecha": None,
            "total_general": 0.0,
            "promedio_diario": 0.0,
            "dias_con_paradas": 0,
            "total_mes": 0.0,
            "total_anio": 0.0,
            "peor_dia": None,
            "categoria_top": None,
        }

    if filtro_anio is not None:
        base = db.fetch_one(
            "SELECT COUNT(*) AS dias, COALESCE(SUM(total),0) AS total, COALESCE(AVG(total),0) AS prom "
            "FROM paradas_std WHERE total IS NOT NULL AND total > 0 AND YEAR(fecha) = %s",
            (filtro_anio,),
        ) or {}
        mes = db.fetch_one(
            "SELECT COALESCE(SUM(total),0) AS t FROM paradas_std "
            "WHERE YEAR(fecha) = %s AND MONTH(fecha) = MONTH(%s)",
            (filtro_anio, ultima),
        ) or {}
        anio_total = float(base.get("total", 0) or 0)
        peor = db.fetch_one(
            "SELECT fecha, total FROM paradas_std WHERE total IS NOT NULL AND YEAR(fecha) = %s "
            "ORDER BY total DESC LIMIT 1",
            (filtro_anio,),
        )
        ranking = total_por_categoria(anio=filtro_anio)
    else:
        base = db.fetch_one(
            "SELECT COUNT(*) AS dias, COALESCE(SUM(total),0) AS total, COALESCE(AVG(total),0) AS prom "
            "FROM paradas_std WHERE total IS NOT NULL AND total > 0"
        ) or {}
        mes = db.fetch_one(
            "SELECT COALESCE(SUM(total),0) AS t FROM paradas_std "
            "WHERE YEAR(fecha)=YEAR(%s) AND MONTH(fecha)=MONTH(%s)",
            (ultima, ultima),
        ) or {}
        anio_row = db.fetch_one(
            "SELECT COALESCE(SUM(total),0) AS t FROM paradas_std WHERE YEAR(fecha)=YEAR(%s)",
            (ultima,),
        ) or {}
        anio_total = float(anio_row.get("t", 0) or 0)
        peor = db.fetch_one(
            "SELECT fecha, total FROM paradas_std WHERE total IS NOT NULL "
            "ORDER BY total DESC LIMIT 1"
        )
        ranking = total_por_categoria(dias=365 * 10)

    cat_top = None
    if ranking and ranking[0]["total"] > 0:
        top = ranking[0]
        cat_top = {
            "categoria": top["categoria"],
            "total": top["total"],
            "key": top["key"],
        }

    return {
        "anio": filtro_anio or _anio_actual(),
        "ultima_fecha": ultima,
        "total_general": float(base.get("total", 0) or 0),
        "promedio_diario": float(base.get("prom", 0) or 0),
        "dias_con_paradas": int(base.get("dias", 0) or 0),
        "total_mes": float(mes.get("t", 0) or 0),
        "total_anio": anio_total,
        "peor_dia": peor,
        "categoria_top": cat_top,
    }


def evolucion_mensual(meses: int = 12, anio: int | None = None) -> list[dict]:
    if anio is not None:
        return db.fetch_all(
            "SELECT DATE_FORMAT(fecha, '%%Y-%%m') AS periodo, "
            "       MIN(fecha) AS desde, MAX(fecha) AS hasta, "
            "       COALESCE(SUM(total),0) AS total "
            "FROM paradas_std "
            "WHERE YEAR(fecha) = %s "
            "GROUP BY DATE_FORMAT(fecha, '%%Y-%%m') "
            "ORDER BY periodo ASC",
            (anio,),
        )
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

def manuales_recientes(limit: int = 50, anio: int | None = None) -> list[dict]:
    if anio is None:
        rows = db.fetch_all(
            "SELECT * FROM paradas_std WHERE origen = 'manual' "
            "ORDER BY creado_en DESC, id DESC LIMIT %s",
            (limit,),
        )
    else:
        rows = db.fetch_all(
            "SELECT * FROM paradas_std WHERE origen = 'manual' AND YEAR(fecha) = %s "
            "ORDER BY creado_en DESC, id DESC LIMIT %s",
            (anio, limit),
        )
    for row in rows:
        row["detalle"] = detalle_registro(row)
    return rows


def insertar_manual(payload: dict) -> int:
    fecha = payload.get("fecha")
    if isinstance(fecha, str):
        try:
            fecha = datetime.strptime(fecha, "%Y-%m-%d").date()
        except ValueError:
            raise ValueError("Fecha invalida (formato YYYY-MM-DD)")
    if not isinstance(fecha, date):
        raise ValueError("Fecha obligatoria")

    _ensure_categorias_seed()
    lineas = _lineas_desde_payload(payload)
    if not lineas:
        raise ValueError("Agrega al menos una parada con minutos mayores a cero")

    columnas: dict[str, float] = {c: 0.0 for c in CATEGORIA_COLS}
    extras: dict[str, float] = {}
    for key, mins in lineas:
        _agregar_a_mapas(key, mins, columnas, extras)

    total = sum(columnas.values()) + sum(extras.values())
    observaciones = (payload.get("observaciones") or "").strip()[:255] or None

    sql = (
        "INSERT INTO paradas_std (fecha, "
        + ", ".join(CATEGORIA_COLS)
        + ", total, observaciones, extras, origen) "
        "VALUES (%s, " + ", ".join(["%s"] * len(CATEGORIA_COLS)) + ", %s, %s, %s, 'manual')"
    )
    params = (
        fecha,
        *[columnas[c] for c in CATEGORIA_COLS],
        total,
        observaciones,
        _extras_json(extras),
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
