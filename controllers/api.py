"""API JSON consumida por el frontend.

Todos los endpoints requieren sesion. Devuelven datos calculados a partir
de la base de datos local que se sincroniza desde el Excel.
"""
from __future__ import annotations

import time
from datetime import date, datetime

from flask import Blueprint, jsonify, request

from controllers.auth import login_required
from models import (
    base_datos as base_datos_model,
    cargos as cargos_model,
    indicadores as indicadores_model,
    merma_frio as merma_model,
    paradas as paradas_model,
    ppto_desp as ppto_model,
    reporte_oper as reporte_model,
    sync_log as sync_log_model,
    tablero_ind as tablero_model,
    tiempo_produccion as tiempo_model,
)
from services.excel_importer import import_all
from services import live as live_bus

bp = Blueprint("api", __name__, url_prefix="/api")


def _serialize(value):
    if isinstance(value, (datetime,)):
        return value.isoformat(timespec="seconds")
    if isinstance(value, date):
        return value.isoformat()
    return value


def _serialize_rows(rows):
    out = []
    for row in rows:
        if isinstance(row, dict):
            out.append({k: _serialize(v) for k, v in row.items()})
        else:
            out.append(row)
    return out


# -------- Endpoints generales --------

@bp.route("/health")
@login_required
def health():
    return jsonify({"ok": True, "ts": datetime.now().isoformat(timespec="seconds")})


@bp.route("/sync", methods=["POST"])
@login_required
def sync_now():
    """Permite forzar una sincronizacion manual desde la UI."""
    started = time.perf_counter()
    summary = import_all()
    summary["duracion_seg"] = round(time.perf_counter() - started, 3)
    sync_log_model.add(
        "ok" if summary.get("ok") else "warn",
        summary.get("archivo", ""),
        f"manual hojas={summary.get('hojas')}",
        summary["duracion_seg"],
    )
    live_bus.broadcast("orion:sync", {"summary": summary})
    return jsonify(summary)


@bp.route("/sync/last")
@login_required
def sync_last():
    return jsonify(_serialize(sync_log_model.ultimo()) or {})


# -------- Dashboard --------

@bp.route("/dashboard")
@login_required
def dashboard_data():
    header = indicadores_model.get_header() or {}
    ppto = ppto_model.serie_anio()
    ppto_kpi = ppto_model.kpi_actual()
    merma_kpi = merma_model.kpi_actual()
    merma_dias = merma_model.tiempo_promedio_dias()
    tiempo_dia = tiempo_model.tiempo_total_dia()
    base_dia = base_datos_model.resumen_dia()
    velocidades = base_datos_model.velocidad_por_proceso()
    paradas_categoria = paradas_model.total_por_categoria()
    paradas_tendencia = paradas_model.tendencia_diaria()
    paradas_recientes = paradas_model.recientes(15)
    paradas_ultima_fecha = paradas_model._ultima_fecha()
    cifras_mes = indicadores_model.get_cifras_mes()

    return jsonify({
        "header": header,
        "ppto": _serialize_rows(ppto),
        "ppto_kpi": _serialize(ppto_kpi),
        "merma_kpi": _serialize(merma_kpi),
        "merma_dias": _serialize(merma_dias),
        "tiempo_produccion_dia": tiempo_dia,
        "base_dia": _serialize(base_dia),
        "velocidades": _serialize_rows(velocidades),
        "paradas_categoria": _serialize_rows(paradas_categoria),
        "paradas_tendencia": _serialize_rows(paradas_tendencia),
        "paradas_recientes": _serialize_rows(paradas_recientes),
        "paradas_ultima_fecha": _serialize(paradas_ultima_fecha),
        "cifras_mes": _serialize_rows(cifras_mes),
        "ultima_sync": _serialize(sync_log_model.ultimo()),
    })


# -------- Tablero indicadores --------

@bp.route("/tablero")
@login_required
def tablero_data():
    bovinos = tablero_model.por_especie("BOVINOS")
    porcinos = tablero_model.por_especie("PORCINOS")
    return jsonify({
        "bovinos": _serialize_rows(bovinos),
        "porcinos": _serialize_rows(porcinos),
        "ultima_sync": _serialize(sync_log_model.ultimo()),
    })


# -------- Mensual --------

@bp.route("/mensual")
@login_required
def mensual_data():
    header = indicadores_model.get_header() or {}
    indicadores = indicadores_model.get_indicadores_mayo()
    cumplimiento = indicadores_model.get_cumplimiento_metas()
    operatividad = indicadores_model.get_operatividad()
    cifras = indicadores_model.get_cifras_mes()
    extras = reporte_model.extras_por_mes()
    kilogramos = reporte_model.kilogramos()
    operatividad_planta = reporte_model.operatividad()
    merma_resumen = merma_model.resumen_anual("25-26")
    paradas_categoria = paradas_model.total_por_categoria()
    paradas_recientes = paradas_model.recientes(15)
    velocidades = base_datos_model.velocidades_recientes(60)

    return jsonify({
        "header": header,
        "indicadores": _serialize_rows(indicadores),
        "cumplimiento": _serialize_rows(cumplimiento),
        "operatividad": _serialize_rows(operatividad),
        "operatividad_planta": _serialize_rows(operatividad_planta),
        "cifras": _serialize_rows(cifras),
        "extras": _serialize_rows(extras),
        "kilogramos": _serialize_rows(kilogramos),
        "merma_resumen": _serialize_rows(merma_resumen),
        "paradas_categoria": _serialize_rows(paradas_categoria),
        "paradas_recientes": _serialize_rows(paradas_recientes),
        "velocidades": _serialize_rows(velocidades),
        "ultima_sync": _serialize(sync_log_model.ultimo()),
    })


# -------- Cargos / personal --------

@bp.route("/personal")
@login_required
def personal_data():
    return jsonify({
        "personal": _serialize_rows(cargos_model.todos()),
        "por_cargo": _serialize_rows(cargos_model.por_cargo()),
    })


# -------- Captura: opciones para los formularios --------

@bp.route("/captura/options")
@login_required
def captura_options():
    """Listas para llenar combos de los formularios de captura."""
    bd_cli = base_datos_model.clientes()
    mf_cli = merma_model.clientes()
    todos_clientes = sorted(set(bd_cli + mf_cli))
    bd_esp = base_datos_model.especies()
    mf_esp = merma_model.especies()
    todas_especies = sorted(set(bd_esp + mf_esp))
    if not todas_especies:
        todas_especies = ["BOVINOS", "BUFALINOS", "PORCINOS"]

    procesos = base_datos_model.procesos() or [
        "DESPOSTE", "DESPALE", "PORCIONADO", "MOLIDO", "REPELE",
        "ACONDICIONAMIENTO", "REPROCESO", "VISCERAS ACONDICIONADAS",
    ]
    limpiezas_db = base_datos_model.limpiezas() or ["1", "2", "3", "4"]
    limpiezas = ["NINGUNA"] + sorted(set(limpiezas_db))
    cavas = merma_model.cavas() or [str(n) for n in range(1, 12)]

    return jsonify({
        "clientes": todos_clientes,
        "clientes_base_datos": bd_cli,
        "clientes_merma": mf_cli,
        "especies": todas_especies,
        "procesos": sorted(procesos),
        "limpiezas": limpiezas,
        "cavas": cavas,
    })


# -------- Captura: BASE DATOS --------

@bp.route("/captura/base-datos", methods=["POST"])
@login_required
def captura_base_datos_create():
    payload = request.get_json(silent=True) or request.form.to_dict()
    try:
        result = base_datos_model.insertar_manual(payload)
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    live_bus.broadcast("orion:sync", {"summary": {"ok": True, "fuente": "captura"}})
    return jsonify({"ok": True, "registro": result})


@bp.route("/captura/base-datos")
@login_required
def captura_base_datos_list():
    return jsonify({
        "manuales": _serialize_rows(base_datos_model.manuales_recientes(50)),
    })


@bp.route("/captura/base-datos/<int:reg_id>", methods=["DELETE"])
@login_required
def captura_base_datos_delete(reg_id: int):
    n = base_datos_model.eliminar_manual(reg_id)
    if n:
        live_bus.broadcast("orion:sync", {"summary": {"ok": True, "fuente": "captura"}})
    return jsonify({"ok": bool(n), "eliminados": n})


# -------- Captura: MERMA FRIO --------

@bp.route("/captura/merma-frio", methods=["POST"])
@login_required
def captura_merma_create():
    payload = request.get_json(silent=True) or request.form.to_dict()
    try:
        result = merma_model.insertar_manual(payload)
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    live_bus.broadcast("orion:sync", {"summary": {"ok": True, "fuente": "captura"}})
    return jsonify({"ok": True, "registro": result})


@bp.route("/captura/merma-frio")
@login_required
def captura_merma_list():
    return jsonify({
        "manuales": _serialize_rows(merma_model.manuales_recientes(50)),
    })


@bp.route("/captura/merma-frio/<int:reg_id>", methods=["DELETE"])
@login_required
def captura_merma_delete(reg_id: int):
    n = merma_model.eliminar_manual(reg_id)
    if n:
        live_bus.broadcast("orion:sync", {"summary": {"ok": True, "fuente": "captura"}})
    return jsonify({"ok": bool(n), "eliminados": n})
