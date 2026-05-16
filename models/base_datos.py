"""Acceso a la hoja BASE DATOS (registros operativos)."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from database import db


MES_TEXTO = ['', 'ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
             'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']


def latest(limit: int = 50) -> list[dict]:
    return db.fetch_all(
        "SELECT fecha, cliente, especie, proceso, operarios, lote, "
        "       canales, kilos, hora_inicio, hora_fin, tiempo_total, "
        "       velocidad_canal_h, velocidad_kilos_h, velocidad_canal_hh "
        "FROM base_datos WHERE fecha IS NOT NULL "
        "ORDER BY fecha DESC, id DESC LIMIT %s",
        (limit,),
    )


def velocidad_por_proceso(limit: int = 30) -> list[dict]:
    """Velocidades agregadas para visualizar."""
    return db.fetch_all(
        "SELECT proceso, "
        "       AVG(velocidad_canal_h)  AS canal_h, "
        "       AVG(velocidad_kilos_h)  AS kilos_h, "
        "       AVG(velocidad_canal_hh) AS canal_hh, "
        "       COUNT(*) AS registros "
        "FROM base_datos "
        "WHERE proceso IS NOT NULL AND proceso <> '' "
        "GROUP BY proceso ORDER BY registros DESC LIMIT %s",
        (limit,),
    )


def velocidades_recientes(dias: int = 30) -> list[dict]:
    return db.fetch_all(
        "SELECT fecha, cliente, especie, proceso, "
        "       velocidad_canal_h, velocidad_kilos_h, velocidad_canal_hh "
        "FROM base_datos "
        "WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL %s DAY) "
        "  AND velocidad_canal_h IS NOT NULL "
        "ORDER BY fecha DESC, id DESC LIMIT 200",
        (dias,),
    )


def resumen_dia() -> dict:
    row = db.fetch_one(
        "SELECT MAX(fecha) AS ultima_fecha, "
        "       SUM(canales) AS canales, SUM(kilos) AS kilos, "
        "       AVG(velocidad_canal_h) AS canal_h_prom, "
        "       AVG(velocidad_kilos_h) AS kilos_h_prom "
        "FROM base_datos "
        "WHERE fecha = (SELECT MAX(fecha) FROM base_datos)"
    )
    return row or {}


# ---------------- Opciones para captura ----------------

def clientes() -> list[str]:
    rows = db.fetch_all(
        "SELECT cliente, COUNT(*) AS c FROM base_datos "
        "WHERE cliente IS NOT NULL AND cliente <> '' "
        "GROUP BY cliente ORDER BY c DESC, cliente ASC"
    )
    return [r["cliente"] for r in rows]


def especies() -> list[str]:
    rows = db.fetch_all(
        "SELECT DISTINCT especie FROM base_datos "
        "WHERE especie IS NOT NULL AND especie <> '' ORDER BY especie"
    )
    return [r["especie"] for r in rows]


def procesos() -> list[str]:
    rows = db.fetch_all(
        "SELECT DISTINCT proceso FROM base_datos "
        "WHERE proceso IS NOT NULL AND proceso <> '' ORDER BY proceso"
    )
    return [r["proceso"] for r in rows]


def limpiezas() -> list[str]:
    rows = db.fetch_all(
        "SELECT DISTINCT limpieza FROM base_datos "
        "WHERE limpieza IS NOT NULL AND limpieza <> '' ORDER BY limpieza"
    )
    return [r["limpieza"] for r in rows]


# ---------------- Captura manual ----------------

def _calc_velocidades(
    canales: float | None,
    kilos: float | None,
    operarios: int | None,
    tiempo_total_seg: int | None,
) -> dict[str, float | None]:
    horas = (tiempo_total_seg / 3600.0) if (tiempo_total_seg and tiempo_total_seg > 0) else None
    out = {"velocidad_canal_h": None, "velocidad_kilos_h": None, "velocidad_canal_hh": None}
    if horas:
        if canales is not None:
            out["velocidad_canal_h"] = canales / horas
            if operarios:
                out["velocidad_canal_hh"] = canales / horas / operarios
        if kilos is not None:
            out["velocidad_kilos_h"] = kilos / horas
    return out


def _hhmmss_to_seconds(value: str | None) -> int | None:
    if not value:
        return None
    parts = value.split(":")
    try:
        if len(parts) == 2:
            h, m = int(parts[0]), int(parts[1])
            return h * 3600 + m * 60
        if len(parts) == 3:
            h, m, s = int(parts[0]), int(parts[1]), int(parts[2])
            return h * 3600 + m * 60 + s
    except ValueError:
        return None
    return None


def _seconds_to_hhmmss(seconds: int) -> str:
    seconds = max(int(seconds), 0)
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def insertar_manual(payload: dict[str, Any]) -> dict[str, Any]:
    """Inserta un registro nuevo a partir del formulario de captura."""
    fecha_str = (payload.get("fecha") or "").strip()
    fecha_obj = datetime.strptime(fecha_str, "%Y-%m-%d").date() if fecha_str else date.today()
    mes = fecha_obj.month
    anio = fecha_obj.year
    mes_texto = MES_TEXTO[mes]

    cliente = (payload.get("cliente") or "").strip().upper()
    if not cliente:
        raise ValueError("El cliente es obligatorio")

    especie = (payload.get("especie") or "").strip().upper() or None
    limpieza_in = (payload.get("limpieza") or "").strip()
    limpieza = None if limpieza_in.upper() == "NINGUNA" else (limpieza_in or None)
    proceso = (payload.get("proceso") or "").strip().upper() or None

    def _flt(key: str) -> float | None:
        v = payload.get(key)
        if v in (None, "", "null"):
            return None
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    def _int(key: str) -> int | None:
        f = _flt(key)
        return int(f) if f is not None else None

    operarios = _int("operarios")
    canales = _flt("canales")
    kilos = _flt("kilos")
    lote = (payload.get("lote") or "").strip().upper() or None
    hora_inicio = (payload.get("hora_inicio") or "").strip() or None
    hora_fin = (payload.get("hora_fin") or "").strip() or None
    tiempo_reposo = (payload.get("tiempo_reposo") or "00:00:00").strip() or "00:00:00"

    # Calcular tiempo total = (hora_fin - hora_inicio) - tiempo_reposo
    tiempo_total_str = None
    tiempo_total_seg = None
    if hora_inicio and hora_fin:
        s_ini = _hhmmss_to_seconds(hora_inicio)
        s_fin = _hhmmss_to_seconds(hora_fin)
        s_rep = _hhmmss_to_seconds(tiempo_reposo) or 0
        if s_ini is not None and s_fin is not None:
            diff = s_fin - s_ini
            if diff < 0:
                diff += 24 * 3600  # dia siguiente
            total = max(diff - s_rep, 0)
            tiempo_total_seg = total
            tiempo_total_str = _seconds_to_hhmmss(total)

    velocidades = _calc_velocidades(canales, kilos, operarios, tiempo_total_seg)

    db.execute(
        "INSERT INTO base_datos "
        "(fecha, mes, anio, cliente, especie, limpieza, proceso, operarios, lote, "
        " canales, kilos, hora_inicio, hora_fin, tiempo_reposo, tiempo_total, "
        " velocidad_canal_h, velocidad_kilos_h, velocidad_canal_hh, mes_texto, origen) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'manual')",
        (
            fecha_obj, mes, anio, cliente, especie, limpieza, proceso, operarios, lote,
            canales, kilos, hora_inicio, hora_fin, tiempo_reposo, tiempo_total_str,
            velocidades["velocidad_canal_h"],
            velocidades["velocidad_kilos_h"],
            velocidades["velocidad_canal_hh"],
            mes_texto,
        ),
    )
    last = db.fetch_one("SELECT LAST_INSERT_ID() AS id")
    return {
        "id": int(last["id"]) if last else 0,
        "fecha": fecha_obj.isoformat(),
        "cliente": cliente,
        "especie": especie,
        "proceso": proceso,
        "tiempo_total": tiempo_total_str,
        "velocidades": velocidades,
    }


def manuales_recientes(limit: int = 30) -> list[dict]:
    return db.fetch_all(
        "SELECT id, creado_en, fecha, cliente, especie, proceso, operarios, "
        "       canales, kilos, hora_inicio, hora_fin, tiempo_total, "
        "       velocidad_canal_h, velocidad_kilos_h "
        "FROM base_datos WHERE origen='manual' "
        "ORDER BY id DESC LIMIT %s",
        (limit,),
    )


def eliminar_manual(registro_id: int) -> int:
    return db.execute(
        "DELETE FROM base_datos WHERE id=%s AND origen='manual'",
        (registro_id,),
    )
