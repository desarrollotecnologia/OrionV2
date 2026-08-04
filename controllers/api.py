"""API JSON consumida por el frontend.

Todos los endpoints requieren sesion. Devuelven datos calculados a partir
de la base de datos local que se sincroniza desde el Excel.
"""
from __future__ import annotations

import time
from datetime import date, datetime

from flask import Blueprint, jsonify, request, session

from controllers.auth import login_required
from models import (
    base_datos as base_datos_model,
    cargos as cargos_model,
    indicadores as indicadores_model,
    mensual as mensual_model,
    merma_frio as merma_model,
    paradas as paradas_model,
    ppto_desp as ppto_model,
    reporte_oper as reporte_model,
    sync_log as sync_log_model,
    tablero_ind as tablero_model,
    tiempo_produccion as tiempo_model,
    proyeccion as proyeccion_model,
    usabilidad as usabilidad_model,
)
from config import config
from database import sirt as sirt_db
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


def _usab_allow() -> bool:
    return bool(session.get("usab_unlock") is True)


# -------- Endpoints generales --------

@bp.route("/health")
@login_required
def health():
    return jsonify({"ok": True, "ts": datetime.now().isoformat(timespec="seconds")})


@bp.route("/usabilidad/unlock", methods=["POST"])
@login_required
def usabilidad_unlock():
    if session.get("user_role") != "admin":
        return jsonify({"ok": False, "error": "No autorizado"}), 403
    payload = request.get_json(silent=True) or request.form.to_dict()
    cmd = (payload.get("cmd") or "").strip()
    if not cmd or cmd != config.USABILITY_DASH_CMD:
        return jsonify({"ok": False, "error": "Comando invalido"}), 400
    session["usab_unlock"] = True
    return jsonify({"ok": True, "url": "/_hidden/usabilidad"})


@bp.route("/usabilidad/data")
@login_required
def usabilidad_data():
    if session.get("user_role") != "admin" or not _usab_allow():
        return jsonify({"ok": False, "error": "No autorizado"}), 403
    return jsonify({
        "ok": True,
        "resumen": _serialize(usabilidad_model.resumen()),
        "capturas_diarias": _serialize_rows(usabilidad_model.capturas_diarias_30d()),
        "sync_diarias": _serialize_rows(usabilidad_model.sync_diarias_30d()),
        "actividad_usuario": _serialize_rows(usabilidad_model.actividad_usuario_30d()),
    })


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

def _rango_fechas():
    """Lee desde/hasta de la query. Por defecto: dia de hoy. Devuelve (desde, hasta)."""
    hoy = date.today().isoformat()
    desde = (request.args.get("desde") or "").strip() or hoy
    hasta = (request.args.get("hasta") or "").strip() or hoy
    if desde > hasta:
        desde, hasta = hasta, desde
    return desde, hasta


@bp.route("/dashboard")
@login_required
def dashboard_data():
    desde, hasta = _rango_fechas()
    header = indicadores_model.get_header() or {}
    ppto = ppto_model.serie_anio()
    ppto_kpi = ppto_model.kpi_actual()
    merma_kpi = merma_model.kpi_actual()
    merma_dias = merma_model.tiempo_promedio_dias()
    tiempo_dia = tiempo_model.tiempo_total_dia()
    base_dia = base_datos_model.resumen_dia(desde, hasta)
    velocidades = base_datos_model.velocidad_por_proceso(desde=desde, hasta=hasta)
    paradas_categoria = paradas_model.total_por_categoria(desde=desde, hasta=hasta)
    paradas_tendencia = paradas_model.tendencia_diaria(desde=desde, hasta=hasta)
    paradas_recientes = paradas_model.recientes(15, desde=desde, hasta=hasta)
    paradas_ultima_fecha = paradas_model._ultima_fecha()
    cifras_mes = indicadores_model.get_cifras_mes()
    proyeccion_clientes = proyeccion_model.resumen_por_cliente(desde, hasta)

    return jsonify({
        "rango": {"desde": desde, "hasta": hasta},
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
        "proyeccion_clientes": _serialize_rows(proyeccion_clientes),
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
    # Mes seleccionado (por defecto, el mas reciente con datos en la base)
    meses = mensual_model.meses_disponibles()
    anio_def, mes_def = mensual_model.mes_mas_reciente()
    try:
        anio = int(request.args.get("anio") or anio_def)
        mes = int(request.args.get("mes") or mes_def)
    except (TypeError, ValueError):
        anio, mes = anio_def, mes_def
    if mes < 1 or mes > 12:
        anio, mes = anio_def, mes_def
    desde, hasta = mensual_model._rango(anio, mes)

    # --- Calculado EN VIVO desde el detalle (base_datos / merma_frio / paradas) ---
    header = mensual_model.header(anio, mes)
    indicadores = mensual_model.indicadores(anio, mes)
    cifras = mensual_model.cifras(anio, mes)
    kpis = mensual_model.kpis(anio, mes)
    velocidades = mensual_model.velocidades(anio, mes)
    paradas_categoria = paradas_model.total_por_categoria(desde=desde, hasta=hasta)
    paradas_recientes = paradas_model.recientes(15, desde=desde, hasta=hasta)

    # --- Aun desde el Excel (metas, personal y series historicas) ---
    cumplimiento = indicadores_model.get_cumplimiento_metas()
    operatividad = indicadores_model.get_operatividad()
    extras = reporte_model.extras_por_mes()
    kilogramos = reporte_model.kilogramos()
    operatividad_planta = reporte_model.operatividad()
    merma_resumen = merma_model.resumen_anual("25-26")

    return jsonify({
        "rango": {"desde": desde, "hasta": hasta},
        "meses": _serialize_rows(meses),
        "seleccion": {"anio": anio, "mes": mes},
        "header": header,
        "kpis": _serialize(kpis),
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

@bp.route("/captura/tiempo-produccion", methods=["GET", "POST"])
@login_required
def captura_tiempo_produccion():
    if request.method == "GET":
        cliente = (request.args.get("cliente") or "").strip()
        if cliente:
            ref = tiempo_model.referencia_cliente(cliente)
            return jsonify({"ok": True, "referencia": _serialize(ref) if ref else None})
        return jsonify({"ok": True, "referencias": _serialize_rows(tiempo_model.por_cliente())})

    payload = request.get_json(silent=True) or request.form.to_dict()
    try:
        ref = tiempo_model.upsert_referencia(payload)
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    live_bus.broadcast("orion:sync", {"summary": {"ok": True, "fuente": "captura"}})
    return jsonify({"ok": True, "referencia": _serialize(ref)})


@bp.route("/proyeccion/options")
@login_required
def proyeccion_options():
    """Datos para la herramienta de proyeccion de tiempos de desposte."""
    return jsonify({
        "clientes": base_datos_model.clientes(),
        "velocidades": _serialize_rows(base_datos_model.velocidades_por_cliente()),
    })


@bp.route("/proyeccion", methods=["GET", "POST"])
@login_required
def proyeccion_historico():
    if request.method == "GET":
        return jsonify({
            "ok": True,
            "proyecciones": _serialize_rows(proyeccion_model.listar(60)),
        })
    payload = request.get_json(silent=True) or {}
    try:
        guardada = proyeccion_model.crear(payload, session.get("user_name"))
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    return jsonify({"ok": True, "proyeccion": _serialize_rows([guardada])[0]})


@bp.route("/proyeccion/<int:proy_id>")
@login_required
def proyeccion_detalle(proy_id: int):
    row = proyeccion_model.obtener(proy_id)
    if not row:
        return jsonify({"ok": False, "error": "No existe la proyeccion"}), 404
    return jsonify({"ok": True, "proyeccion": _serialize_rows([row])[0]})


@bp.route("/proyeccion/<int:proy_id>", methods=["DELETE"])
@login_required
def proyeccion_eliminar(proy_id: int):
    n = proyeccion_model.eliminar(proy_id)
    return jsonify({"ok": bool(n), "eliminados": n})


@bp.route("/proyeccion/<int:proy_id>", methods=["PUT"])
@login_required
def proyeccion_actualizar(proy_id: int):
    payload = request.get_json(silent=True) or {}
    try:
        row = proyeccion_model.actualizar(proy_id, payload, session.get("user_name"))
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    return jsonify({"ok": True, "proyeccion": _serialize_rows([row])[0]})


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


_ESPECIE_SIRT = {
    "BOVINO": "BOVINOS", "BOVINOS": "BOVINOS",
    "BUFALINO": "BUFALINOS", "BUFALINOS": "BUFALINOS",
    "PORCINO": "PORCINOS", "PORCINOS": "PORCINOS",
}


@bp.route("/captura/merma-frio/sirt")
@login_required
def captura_merma_sirt():
    """Trae peso caliente y peso frio de SIRT (Desposte) para un lote."""
    lote = (request.args.get("lote") or "").strip()
    cliente = (request.args.get("cliente") or "").strip()
    if not lote:
        return jsonify({"ok": False, "error": "Falta el lote"}), 400
    if not sirt_db.disponible():
        return jsonify({"ok": False, "error": "Conexion a SIRT no disponible"}), 503

    try:
        datos = sirt_db.pesos_por_lote(lote, cliente)
    except sirt_db.SirtConexionError as exc:
        return jsonify({"ok": False, "encontrado": False,
                        "error": f"Sin conexion a SIRT: {exc}"}), 503
    if not datos:
        return jsonify({"ok": False, "encontrado": False,
                        "error": "Lote no encontrado en SIRT"}), 404

    if datos.get("especie"):
        datos["especie"] = _ESPECIE_SIRT.get(
            datos["especie"].strip().upper(), datos["especie"].strip().upper()
        )
    return jsonify({"ok": True, "encontrado": True, "datos": datos})


@bp.route("/captura/merma-frio/sirt/diagnostico")
@login_required
def captura_merma_sirt_diag():
    """Estado de la conexion a SIRT (para depurar desde el servidor)."""
    return jsonify(sirt_db.diagnostico())


@bp.route("/captura/merma-frio/<int:reg_id>", methods=["DELETE"])
@login_required
def captura_merma_delete(reg_id: int):
    n = merma_model.eliminar_manual(reg_id)
    if n:
        live_bus.broadcast("orion:sync", {"summary": {"ok": True, "fuente": "captura"}})
    return jsonify({"ok": bool(n), "eliminados": n})


# -------- Captura: PARADAS --------

@bp.route("/captura/paradas/options")
@login_required
def captura_paradas_options():
    cats = paradas_model.listar_categorias()
    return jsonify({
        "categorias": [
            {
                "key": c["clave"],
                "label": c["etiqueta"],
                "short": c["clave"][:12],
                "es_sistema": bool(c.get("es_sistema")),
            }
            for c in cats
        ],
    })


@bp.route("/captura/paradas/categorias", methods=["POST"])
@login_required
def captura_paradas_categoria_create():
    payload = request.get_json(silent=True) or request.form.to_dict()
    etiqueta = (payload.get("etiqueta") or payload.get("label") or "").strip()
    try:
        cat = paradas_model.agregar_categoria(etiqueta)
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    return jsonify({
        "ok": True,
        "categoria": {
            "key": cat["clave"],
            "label": cat["etiqueta"],
            "es_sistema": bool(cat.get("es_sistema")),
        },
    })


@bp.route("/captura/paradas", methods=["POST"])
@login_required
def captura_paradas_create():
    payload = request.get_json(silent=True) or request.form.to_dict()
    try:
        result = paradas_model.insertar_manual(payload)
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    live_bus.broadcast("orion:sync", {"summary": {"ok": True, "fuente": "captura"}})
    return jsonify({"ok": True, "registro": result})


@bp.route("/captura/paradas")
@login_required
def captura_paradas_list():
    return jsonify({
        "manuales": _serialize_rows(paradas_model.manuales_recientes(50)),
    })


@bp.route("/captura/paradas/<int:reg_id>", methods=["DELETE"])
@login_required
def captura_paradas_delete(reg_id: int):
    n = paradas_model.eliminar_manual(reg_id)
    if n:
        live_bus.broadcast("orion:sync", {"summary": {"ok": True, "fuente": "captura"}})
    return jsonify({"ok": bool(n), "eliminados": n})


# -------- Dashboard de paradas (vista dedicada) --------

@bp.route("/paradas-dashboard")
@login_required
def paradas_dashboard():
    anio = date.today().year
    return jsonify({
        "anio": anio,
        "resumen": _serialize({**paradas_model.resumen(anio=anio)}),
        "por_categoria": _serialize_rows(paradas_model.total_por_categoria(anio=anio)),
        "tendencia": _serialize_rows(paradas_model.tendencia_diaria(anio=anio)),
        "evolucion_mensual": _serialize_rows(paradas_model.evolucion_mensual(anio=anio)),
        "recientes": _serialize_rows(paradas_model.recientes(20, anio=anio)),
        "manuales": _serialize_rows(paradas_model.manuales_recientes(10, anio=anio)),
        "ultima_sync": _serialize(sync_log_model.ultimo()),
    })
