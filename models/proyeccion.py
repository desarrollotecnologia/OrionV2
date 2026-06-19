"""Proyecciones de tiempos de desposte (planeacion del turno + historico)."""
from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any

from database import db


def _parse_json(value: Any) -> Any:
    if value is None:
        return []
    if isinstance(value, (list, dict)):
        return value
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return []


def crear(payload: dict[str, Any], usuario: str | None = None) -> dict[str, Any]:
    fecha_str = (payload.get("fecha") or "").strip()
    fecha_obj = datetime.strptime(fecha_str, "%Y-%m-%d").date() if fecha_str else date.today()

    desposte = payload.get("desposte") or []
    porcionado = payload.get("porcionado") or []
    if not desposte and not porcionado:
        raise ValueError("La proyeccion no tiene filas para guardar")

    db.execute(
        "INSERT INTO proyecciones "
        "(fecha, titulo, hora_inicio, descanso, parada, duracion, salida, tiempo_planta, "
        " aplica_comidas, total_canales, total_operarios, total_tiempo, desposte, porcionado, creado_por) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (
            fecha_obj,
            (payload.get("titulo") or "").strip() or None,
            payload.get("hora_inicio"),
            payload.get("descanso"),
            payload.get("parada"),
            payload.get("duracion"),
            payload.get("salida"),
            payload.get("tiempo_planta"),
            payload.get("aplica_comidas"),
            _to_int(payload.get("total_canales")),
            _to_int(payload.get("total_operarios")),
            payload.get("total_tiempo"),
            json.dumps(desposte, ensure_ascii=False),
            json.dumps(porcionado, ensure_ascii=False),
            usuario,
        ),
    )
    row = db.fetch_one("SELECT LAST_INSERT_ID() AS id")
    return obtener(row["id"]) if row else {}


def actualizar(proy_id: int, payload: dict[str, Any], usuario: str | None = None) -> dict[str, Any]:
    existente = obtener(proy_id)
    if not existente:
        raise ValueError("No existe la proyeccion")

    fecha_str = (payload.get("fecha") or "").strip()
    fecha_obj = datetime.strptime(fecha_str, "%Y-%m-%d").date() if fecha_str else date.today()
    desposte = payload.get("desposte") or []
    porcionado = payload.get("porcionado") or []
    if not desposte and not porcionado:
        raise ValueError("La proyeccion no tiene filas para guardar")

    db.execute(
        "UPDATE proyecciones SET "
        "fecha=%s, titulo=%s, hora_inicio=%s, descanso=%s, parada=%s, duracion=%s, salida=%s, tiempo_planta=%s, "
        "aplica_comidas=%s, total_canales=%s, total_operarios=%s, total_tiempo=%s, "
        "desposte=%s, porcionado=%s, creado_por=%s "
        "WHERE id=%s",
        (
            fecha_obj,
            (payload.get("titulo") or "").strip() or None,
            payload.get("hora_inicio"),
            payload.get("descanso"),
            payload.get("parada"),
            payload.get("duracion"),
            payload.get("salida"),
            payload.get("tiempo_planta"),
            payload.get("aplica_comidas"),
            _to_int(payload.get("total_canales")),
            _to_int(payload.get("total_operarios")),
            payload.get("total_tiempo"),
            json.dumps(desposte, ensure_ascii=False),
            json.dumps(porcionado, ensure_ascii=False),
            usuario or existente.get("creado_por"),
            proy_id,
        ),
    )
    return obtener(proy_id) or {}


def _to_int(v: Any) -> int | None:
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def listar(limit: int = 60) -> list[dict[str, Any]]:
    rows = db.fetch_all(
        "SELECT id, fecha, titulo, hora_inicio, salida, duracion, tiempo_planta, "
        "       aplica_comidas, total_canales, total_operarios, total_tiempo, creado_por, creado_en "
        "FROM proyecciones ORDER BY fecha DESC, id DESC LIMIT %s",
        (limit,),
    )
    return rows


def obtener(proy_id: int) -> dict[str, Any] | None:
    row = db.fetch_one("SELECT * FROM proyecciones WHERE id=%s", (proy_id,))
    if not row:
        return None
    row["desposte"] = _parse_json(row.get("desposte"))
    row["porcionado"] = _parse_json(row.get("porcionado"))
    return row


def eliminar(proy_id: int) -> int:
    return db.execute("DELETE FROM proyecciones WHERE id=%s", (proy_id,))


def resumen_por_cliente(desde: str | None = None, hasta: str | None = None) -> list[dict[str, Any]]:
    where = ""
    params: list[Any] = []
    if desde and hasta:
        where = "WHERE fecha BETWEEN %s AND %s"
        params.extend([desde, hasta])
    return db.fetch_all(
        "SELECT COALESCE(JSON_UNQUOTE(JSON_EXTRACT(jt.item, '$.cliente')), 'SIN CLIENTE') AS cliente, "
        "       AVG(CAST(JSON_UNQUOTE(JSON_EXTRACT(jt.item, '$.vel_canal_hh')) AS DECIMAL(10,2))) AS canal_hh, "
        "       AVG(CAST(JSON_UNQUOTE(JSON_EXTRACT(jt.item, '$.canales')) AS DECIMAL(10,2))) AS canales, "
        "       AVG(CAST(JSON_UNQUOTE(JSON_EXTRACT(jt.item, '$.operarios')) AS DECIMAL(10,2))) AS operarios, "
        "       COUNT(*) AS registros "
        "FROM proyecciones p "
        "JOIN JSON_TABLE(p.desposte, '$[*]' COLUMNS(item JSON PATH '$')) AS jt "
        + where + " "
        "GROUP BY COALESCE(JSON_UNQUOTE(JSON_EXTRACT(jt.item, '$.cliente')), 'SIN CLIENTE') "
        "ORDER BY registros DESC, cliente ASC",
        tuple(params),
    )
