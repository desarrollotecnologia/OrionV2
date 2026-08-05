"""Conector de solo lectura a SIRT (PostgreSQL - modulo Desposte).

Se usa exclusivamente para consultar los pesos de recepcion de un lote
(peso en caliente y peso de recepcion) y prellenar la captura de Merma Frio.

La conexion es perezosa y por-hilo: si SIRT no esta disponible, las
funciones devuelven None sin tumbar el resto del aplicativo.
"""
from __future__ import annotations

import logging
import re
import threading
from datetime import date, datetime
from typing import Any

from config import config

log = logging.getLogger("orion.sirt")

_local = threading.local()


class SirtConexionError(Exception):
    """No se pudo conectar / consultar SIRT (problema de red o credenciales)."""

try:  # el driver puede no estar instalado en algun entorno
    import psycopg2
    from psycopg2.extras import RealDictCursor
    _DRIVER_OK = True
except Exception:  # noqa: BLE001
    psycopg2 = None  # type: ignore
    RealDictCursor = None  # type: ignore
    _DRIVER_OK = False


# ---------------------------------------------------------------------------
# Consulta base: reproduce el "Reporte de Recepcion" de SIRT.
#   peso_frio     = SUM(peso de recepcion por cuarto)  -> desposte.lote.peso
#   peso_caliente = SUM(peso en caliente por cuarto)   -> media canal / 2 por lado
# El lado del cuarto se deduce del nombre del tipo de parte producto:
#   ...Anterior/Posterior 1 -> media_canal_1 ;  ...2 -> media_canal_2
# ---------------------------------------------------------------------------
_SQL_PESOS_LOTE = """
SELECT
    l.codigo                  AS lote,
    p.lote_externo            AS lote_externo,
    e.nombre                  AS cliente,
    p.especie                 AS especie,
    p.fecha_insensibilizacion AS fecha_beneficio,
    l.fecha_creacion          AS fecha_produccion,
    w.cuartos                 AS cuartos,
    w.canales                 AS canales,
    w.machos                  AS machos,
    w.hembras                 AS hembras,
    w.peso_recepcion          AS peso_frio,
    w.peso_caliente           AS peso_caliente
FROM desposte.lote l
JOIN desposte.plan_desposte pld ON pld.id = l.id_plan_desposte
JOIN desposte.pedido p          ON p.id = pld.id_pedido
JOIN desposte.ficha_empresa fe  ON fe.id = p.id_ficha_empresa
JOIN organizaciones.empresa e   ON e.id = fe.id_empresa
JOIN LATERAL (
    SELECT
        COUNT(*)         AS cuartos,
        COUNT(DISTINCT pr.id) AS canales,
        COUNT(DISTINCT CASE WHEN pr.sexo ILIKE 'macho%%'  THEN pr.id END) AS machos,
        COUNT(DISTINCT CASE WHEN pr.sexo ILIKE 'hembra%%' THEN pr.id END) AS hembras,
        SUM(ptlpp.peso)  AS peso_recepcion,
        SUM(CASE
              WHEN tpp.nombre LIKE %(uno)s THEN pr.peso_media_canal_1 / 2.0
              WHEN tpp.nombre LIKE %(dos)s THEN pr.peso_media_canal_2 / 2.0
              ELSE (COALESCE(pr.peso_media_canal_1, 0) + COALESCE(pr.peso_media_canal_2, 0)) / 4.0
            END)         AS peso_caliente
    FROM desposte.puesto_trabajo_lote ptl
    JOIN desposte.puesto_trabajo_lote_parte_producto ptlpp
        ON ptlpp.id_puesto_trabajo_lote = ptl.id
    LEFT JOIN trazabilidad_proceso.parte_producto pp
        ON pp.identificacion = ptlpp.identificacion_parte_producto
    LEFT JOIN trazabilidad_proceso.tipo_parte_producto tpp
        ON tpp.id = pp.id_tipo_parte_producto
    LEFT JOIN trazabilidad_proceso.producto pr
        ON pr.id = pp.id_producto
    WHERE ptl.id_lote = l.id
) w ON TRUE
WHERE (upper(l.codigo) = upper(%(lote)s) OR upper(p.lote_externo) = upper(%(lote)s))
  AND (%(cliente)s = '' OR upper(e.nombre) LIKE upper(%(cliente_like)s))
ORDER BY w.cuartos DESC NULLS LAST, l.fecha_creacion DESC
LIMIT 1
"""


# Cava de almacenamiento (recepcion) de un lote.
# La cava se identifica por ANIMAL (id_producto, columna indexada -> rapido) y se
# toman las cavas numeradas "Cava N" donde reposo el canal antes de bajar a desposte
# (se excluyen recepcion, pre-refrigeracion, salones, paquete visceral y virtuales,
# que son transitos de la cadena de frio). Coincide con la columna CAVA del
# "Reporte de Recepcion" de SIRT. Devuelve TODAS las cavas usadas por el lote.
_SQL_CAVA_LOTE = """
WITH animales AS (
    SELECT DISTINCT pp.id_producto AS animal
    FROM desposte.lote l
    JOIN desposte.plan_desposte pld ON pld.id = l.id_plan_desposte
    JOIN desposte.pedido p          ON p.id = pld.id_pedido
    JOIN desposte.puesto_trabajo_lote ptl ON ptl.id_lote = l.id
    JOIN desposte.puesto_trabajo_lote_parte_producto ptlpp
        ON ptlpp.id_puesto_trabajo_lote = ptl.id
    JOIN trazabilidad_proceso.parte_producto pp
        ON pp.identificacion = ptlpp.identificacion_parte_producto
    WHERE upper(l.codigo) = upper(%(lote)s) OR upper(p.lote_externo) = upper(%(lote)s)
)
SELECT DISTINCT cv.nombre AS cava
FROM animales a
JOIN trazabilidad_proceso.parte_producto_cava_riel ppcr ON ppcr.id_producto = a.animal
JOIN trazabilidad_proceso.cava cv ON cv.id = ppcr.id_cava
WHERE cv.nombre ~ 'Cava [0-9]'
"""


# Clientes que tienen lotes producidos (recepcion) dentro de un rango de fechas.
_SQL_CLIENTES_RANGO = """
SELECT DISTINCT e.nombre AS cliente
FROM desposte.lote l
JOIN desposte.plan_desposte pld ON pld.id = l.id_plan_desposte
JOIN desposte.pedido p          ON p.id = pld.id_pedido
JOIN desposte.ficha_empresa fe  ON fe.id = p.id_ficha_empresa
JOIN organizaciones.empresa e   ON e.id = fe.id_empresa
WHERE l.fecha_creacion::date BETWEEN %(desde)s AND %(hasta)s
  AND (%(especie)s = '' OR upper(p.especie) LIKE upper(%(especie_like)s))
ORDER BY e.nombre
"""


# Lotes (uno por lote_externo, el de mayor recepcion) dentro de un rango de fechas.
_SQL_LOTES_RANGO = """
SELECT * FROM (
    SELECT DISTINCT ON (COALESCE(p.lote_externo, l.codigo))
        l.codigo                           AS lote,
        p.lote_externo                     AS lote_externo,
        COALESCE(p.lote_externo, l.codigo) AS lote_display,
        e.nombre                           AS cliente,
        p.especie                          AS especie,
        p.fecha_insensibilizacion          AS fecha_beneficio,
        l.fecha_creacion                   AS fecha_produccion,
        w.cuartos, w.canales, w.machos, w.hembras,
        w.peso_recepcion                   AS peso_frio,
        w.peso_caliente                    AS peso_caliente
    FROM desposte.lote l
    JOIN desposte.plan_desposte pld ON pld.id = l.id_plan_desposte
    JOIN desposte.pedido p          ON p.id = pld.id_pedido
    JOIN desposte.ficha_empresa fe  ON fe.id = p.id_ficha_empresa
    JOIN organizaciones.empresa e   ON e.id = fe.id_empresa
    JOIN LATERAL (
        SELECT
            COUNT(*)              AS cuartos,
            COUNT(DISTINCT pr.id) AS canales,
            COUNT(DISTINCT CASE WHEN pr.sexo ILIKE 'macho%%'  THEN pr.id END) AS machos,
            COUNT(DISTINCT CASE WHEN pr.sexo ILIKE 'hembra%%' THEN pr.id END) AS hembras,
            SUM(ptlpp.peso)       AS peso_recepcion,
            SUM(CASE
                  WHEN tpp.nombre LIKE %(uno)s THEN pr.peso_media_canal_1 / 2.0
                  WHEN tpp.nombre LIKE %(dos)s THEN pr.peso_media_canal_2 / 2.0
                  ELSE (COALESCE(pr.peso_media_canal_1, 0) + COALESCE(pr.peso_media_canal_2, 0)) / 4.0
                END)             AS peso_caliente
        FROM desposte.puesto_trabajo_lote ptl
        JOIN desposte.puesto_trabajo_lote_parte_producto ptlpp
            ON ptlpp.id_puesto_trabajo_lote = ptl.id
        LEFT JOIN trazabilidad_proceso.parte_producto pp
            ON pp.identificacion = ptlpp.identificacion_parte_producto
        LEFT JOIN trazabilidad_proceso.tipo_parte_producto tpp
            ON tpp.id = pp.id_tipo_parte_producto
        LEFT JOIN trazabilidad_proceso.producto pr
            ON pr.id = pp.id_producto
        WHERE ptl.id_lote = l.id
    ) w ON TRUE
    WHERE l.fecha_creacion::date BETWEEN %(desde)s AND %(hasta)s
      AND (%(cliente)s = '' OR upper(e.nombre) LIKE upper(%(cliente_like)s))
      AND (%(especie)s = '' OR upper(p.especie) LIKE upper(%(especie_like)s))
    ORDER BY COALESCE(p.lote_externo, l.codigo), w.cuartos DESC NULLS LAST
) t
WHERE t.cuartos > 0
ORDER BY t.cliente, t.fecha_produccion DESC
LIMIT 300
"""


def disponible() -> bool:
    """True si el driver esta instalado y SIRT esta habilitado por config."""
    return bool(_DRIVER_OK and config.SIRT_ENABLED and config.SIRT_HOST)


def _get_connection():
    """Devuelve una conexion viva a SIRT o lanza SirtConexionError."""
    if not _DRIVER_OK:
        raise SirtConexionError("El driver psycopg2 no esta instalado (pip install psycopg2-binary)")
    if not config.SIRT_ENABLED:
        raise SirtConexionError("SIRT esta deshabilitado (SIRT_ENABLED=False)")
    if not config.SIRT_HOST:
        raise SirtConexionError("Falta POSTGRES_HOST en el .env del servidor")
    conn = getattr(_local, "conn", None)
    if conn is not None:
        try:
            if conn.closed == 0:
                return conn
        except Exception:  # noqa: BLE001
            pass
    try:
        conn = psycopg2.connect(
            host=config.SIRT_HOST,
            port=config.SIRT_PORT,
            dbname=config.SIRT_DB,
            user=config.SIRT_USER,
            password=config.SIRT_PASSWORD,
            connect_timeout=int(config.SIRT_TIMEOUT),
            options="-c statement_timeout=15000",
        )
        conn.set_session(readonly=True, autocommit=True)
        _local.conn = conn
        return conn
    except Exception as exc:  # noqa: BLE001
        log.warning("No se pudo conectar a SIRT: %s", exc)
        _local.conn = None
        raise SirtConexionError(
            f"No se pudo conectar a SIRT en {config.SIRT_HOST}:{config.SIRT_PORT} ({exc})"
        ) from exc


def diagnostico() -> dict[str, Any]:
    """Estado de la conexion a SIRT para depurar desde el servidor."""
    info: dict[str, Any] = {
        "driver_instalado": _DRIVER_OK,
        "habilitado": bool(config.SIRT_ENABLED),
        "host": config.SIRT_HOST or None,
        "puerto": config.SIRT_PORT,
        "base": config.SIRT_DB or None,
        "usuario": config.SIRT_USER or None,
        "conecta": False,
        "error": None,
    }
    try:
        conn = _get_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
            cur.fetchone()
        info["conecta"] = True
    except SirtConexionError as exc:
        info["error"] = str(exc)
    except Exception as exc:  # noqa: BLE001
        info["error"] = str(exc)
    return info


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return None


def _to_date_iso(value: Any) -> str | None:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return None


def pesos_por_lote(lote: str, cliente: str = "") -> dict[str, Any] | None:
    """Devuelve pesos de recepcion de SIRT para un lote (codigo o lote externo).

    Retorna dict con peso_caliente, peso_frio, cuartos, cliente, especie,
    fecha_beneficio, fecha_produccion; o None si no hay conexion / no existe.
    """
    lote = (lote or "").strip()
    if not lote:
        return None
    conn = _get_connection()  # lanza SirtConexionError si no hay conexion

    cliente = (cliente or "").strip()

    def _consultar(cli: str):
        params = {
            "uno": "%1",
            "dos": "%2",
            "lote": lote,
            "cliente": cli,
            "cliente_like": f"%{cli}%",
        }
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(_SQL_PESOS_LOTE, params)
            return cur.fetchone()

    try:
        row = _consultar(cliente)
        # Fallback: si filtrar por cliente no arroja nada (el nombre puede
        # diferir del que usa el web), reintenta solo por lote.
        if not row and cliente:
            row = _consultar("")
    except Exception as exc:  # noqa: BLE001
        log.warning("Consulta SIRT fallo para lote=%s: %s", lote, exc)
        try:
            conn.close()
        except Exception:  # noqa: BLE001
            pass
        _local.conn = None
        raise SirtConexionError(f"Error consultando SIRT: {exc}") from exc

    if not row:
        return None

    peso_caliente = _to_float(row.get("peso_caliente"))
    peso_frio = _to_float(row.get("peso_frio"))
    merma = None
    if peso_caliente and peso_frio is not None and peso_caliente > 0:
        merma = round((peso_caliente - peso_frio) / peso_caliente, 6)

    lote_ref = (row.get("lote") or row.get("lote_externo") or lote)
    return {
        "lote": row.get("lote"),
        "lote_externo": row.get("lote_externo"),
        "cliente": (row.get("cliente") or "").strip() or None,
        "especie": (row.get("especie") or "").strip() or None,
        "cuartos": int(row["cuartos"]) if row.get("cuartos") is not None else None,
        "canales": int(row["canales"]) if row.get("canales") is not None else None,
        "machos": int(row["machos"]) if row.get("machos") is not None else None,
        "hembras": int(row["hembras"]) if row.get("hembras") is not None else None,
        "peso_caliente": peso_caliente,
        "peso_frio": peso_frio,
        "merma_frio": merma,
        "cava": cava_por_lote(lote_ref, conn),
        "fecha_beneficio": _to_date_iso(row.get("fecha_beneficio")),
        "fecha_produccion": _to_date_iso(row.get("fecha_produccion")),
    }


def _cava_orden(token: str) -> tuple[int, str]:
    """Clave de orden numerico para tokens de cava ('10' > '9', '6A' < '6B')."""
    m = re.match(r"(\d+)(.*)", token)
    return (int(m.group(1)), m.group(2)) if m else (9999, token)


def cava_por_lote(lote: str, conn=None) -> str | None:
    """Cavas de almacenamiento (recepcion) de un lote, solo los numeros.

    Devuelve los numeros de las cavas usadas, ordenados y separados por espacio
    (ej. '10' si fue una sola, u '8 10' si repartio en varias). Rapida (~0.05s):
    filtra por animal. No lanza si falla; retorna None para no bloquear los pesos.
    """
    lote = (lote or "").strip()
    if not lote:
        return None
    try:
        c = conn or _get_connection()
        with c.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(_SQL_CAVA_LOTE, {"lote": lote})
            rows = cur.fetchall()
    except Exception as exc:  # noqa: BLE001
        log.warning("Consulta cava SIRT fallo para lote=%s: %s", lote, exc)
        return None
    # 'Cava 10' -> '10', 'Cava 6B' -> '6B'; se quita el prefijo y se deja el numero.
    tokens = set()
    for r in rows:
        nombre = (r.get("cava") or "").strip()
        tok = re.sub(r"(?i)^cava\s+", "", nombre).strip()
        if tok:
            tokens.add(tok)
    if not tokens:
        return None
    orden = sorted(tokens, key=_cava_orden)
    # Una sola cava -> el numero; repartido -> solo del que inicia al que termina.
    return orden[0] if len(orden) == 1 else f"{orden[0]} {orden[-1]}"


def _especie_like(especie: str) -> str:
    """Convierte la especie del web (BOVINOS) al patron de SIRT (Bovino%)."""
    esp = (especie or "").strip()
    if not esp:
        return "%"
    return esp.rstrip("Ss") + "%"


def _norm_rango(desde: str, hasta: str) -> tuple[str, str] | None:
    """Normaliza el rango de fechas (ISO). Si falta uno, usa el otro."""
    desde = (desde or "").strip()
    hasta = (hasta or "").strip()
    if not desde and not hasta:
        return None
    if not desde:
        desde = hasta
    if not hasta:
        hasta = desde
    if desde > hasta:            # por si vienen invertidas
        desde, hasta = hasta, desde
    return desde, hasta


def clientes_por_rango(desde: str, hasta: str, especie: str = "") -> list[str]:
    """Nombres de clientes con lotes producidos entre 'desde' y 'hasta' en SIRT."""
    rango = _norm_rango(desde, hasta)
    if rango is None:
        return []
    d, h = rango
    especie = (especie or "").strip()
    conn = _get_connection()
    params = {
        "desde": d, "hasta": h,
        "especie": especie, "especie_like": _especie_like(especie),
    }
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(_SQL_CLIENTES_RANGO, params)
            rows = cur.fetchall()
    except Exception as exc:  # noqa: BLE001
        log.warning("Consulta clientes SIRT fallo (%s a %s): %s", d, h, exc)
        _local.conn = None
        raise SirtConexionError(f"Error consultando SIRT: {exc}") from exc
    return [(r.get("cliente") or "").strip() for r in rows if (r.get("cliente") or "").strip()]


def lotes_por_rango(desde: str, hasta: str, cliente: str = "",
                    especie: str = "") -> list[dict[str, Any]]:
    """Lotes con recepcion (uno por lote_externo) entre 'desde' y 'hasta' en SIRT.

    Cada item incluye pesos, machos/hembras y canales para autocompletar merma.
    """
    rango = _norm_rango(desde, hasta)
    if rango is None:
        return []
    d, h = rango
    cliente = (cliente or "").strip()
    especie = (especie or "").strip()
    conn = _get_connection()
    params = {
        "uno": "%1", "dos": "%2",
        "desde": d, "hasta": h,
        "cliente": cliente, "cliente_like": f"%{cliente}%",
        "especie": especie, "especie_like": _especie_like(especie),
    }
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(_SQL_LOTES_RANGO, params)
            rows = cur.fetchall()
    except Exception as exc:  # noqa: BLE001
        log.warning("Consulta lotes SIRT fallo (%s a %s): %s", d, h, exc)
        _local.conn = None
        raise SirtConexionError(f"Error consultando SIRT: {exc}") from exc

    out: list[dict[str, Any]] = []
    for row in rows:
        pc = _to_float(row.get("peso_caliente"))
        pf = _to_float(row.get("peso_frio"))
        merma = None
        if pc and pf is not None and pc > 0:
            merma = round((pc - pf) / pc, 6)
        out.append({
            "lote": row.get("lote"),
            "lote_externo": row.get("lote_externo"),
            "lote_display": (row.get("lote_display") or "").strip() or None,
            "cliente": (row.get("cliente") or "").strip() or None,
            "especie": (row.get("especie") or "").strip() or None,
            "cuartos": int(row["cuartos"]) if row.get("cuartos") is not None else None,
            "canales": int(row["canales"]) if row.get("canales") is not None else None,
            "machos": int(row["machos"]) if row.get("machos") is not None else None,
            "hembras": int(row["hembras"]) if row.get("hembras") is not None else None,
            "peso_caliente": pc,
            "peso_frio": pf,
            "merma_frio": merma,
            "fecha_beneficio": _to_date_iso(row.get("fecha_beneficio")),
            "fecha_produccion": _to_date_iso(row.get("fecha_produccion")),
        })
    return out
