"""Modelo Merma Frio (detalle y resumen)."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from database import db


MES_TEXTO = ['', 'ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
             'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']


def detalle_reciente(limit: int = 30) -> list[dict]:
    return db.fetch_all(
        "SELECT fecha_beneficio, fecha_produccion, cliente, especie, "
        "       total_canales, peso_caliente, peso_frio, merma_frio, observaciones "
        "FROM merma_frio "
        "WHERE merma_frio IS NOT NULL "
        "ORDER BY fecha_produccion DESC, id DESC LIMIT %s",
        (limit,),
    )


def resumen_anual(periodo: str = "25-26") -> list[dict]:
    return db.fetch_all(
        "SELECT mes_num, mes_texto, anio, "
        "       merma_prom_mensual, merma_prom_anual, comportamiento "
        "FROM merma_resumen WHERE periodo=%s ORDER BY anio, mes_num",
        (periodo,),
    )


def kpi_actual() -> dict:
    """Promedio del mes actual y comparativo con el mes anterior."""
    row = db.fetch_one(
        "SELECT AVG(merma_frio) AS promedio_mes, COUNT(*) AS lotes "
        "FROM merma_frio "
        "WHERE merma_frio IS NOT NULL "
        "  AND MONTH(fecha_produccion) = MONTH(CURDATE()) "
        "  AND YEAR(fecha_produccion)  = YEAR(CURDATE())"
    )
    return row or {}


def tiempo_promedio_dias() -> dict:
    """Promedio de dias de cava (FECHA_PRODUCCION - FECHA_BENEFICIO)."""
    row = db.fetch_one(
        "SELECT AVG(DATEDIFF(fecha_produccion, fecha_beneficio)) AS dias_promedio, "
        "       MIN(DATEDIFF(fecha_produccion, fecha_beneficio)) AS dias_min, "
        "       MAX(DATEDIFF(fecha_produccion, fecha_beneficio)) AS dias_max "
        "FROM merma_frio "
        "WHERE fecha_beneficio IS NOT NULL AND fecha_produccion IS NOT NULL"
    )
    return row or {}


# ---------------- Opciones para captura ----------------

def clientes() -> list[str]:
    rows = db.fetch_all(
        "SELECT cliente, COUNT(*) AS c FROM merma_frio "
        "WHERE cliente IS NOT NULL AND cliente <> '' "
        "GROUP BY cliente ORDER BY c DESC, cliente ASC"
    )
    return [r["cliente"] for r in rows]


def especies() -> list[str]:
    rows = db.fetch_all(
        "SELECT DISTINCT especie FROM merma_frio "
        "WHERE especie IS NOT NULL AND especie <> '' ORDER BY especie"
    )
    return [r["especie"] for r in rows]


def cavas() -> list[str]:
    rows = db.fetch_all(
        "SELECT DISTINCT cava FROM merma_frio "
        "WHERE cava IS NOT NULL AND cava <> '' ORDER BY cava"
    )
    return [r["cava"] for r in rows]


def siguiente_item() -> int:
    row = db.fetch_one("SELECT COALESCE(MAX(item),0)+1 AS nx FROM merma_frio")
    return int(row["nx"]) if row else 1


# ---------------- Captura manual ----------------

def insertar_manual(payload: dict[str, Any]) -> dict[str, Any]:
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

    fecha_beneficio = payload.get("fecha_beneficio")
    fecha_produccion = payload.get("fecha_produccion")
    fb = datetime.strptime(fecha_beneficio, "%Y-%m-%d").date() if fecha_beneficio else None
    fp = datetime.strptime(fecha_produccion, "%Y-%m-%d").date() if fecha_produccion else date.today()

    cliente = (payload.get("cliente") or "").strip().upper()
    if not cliente:
        raise ValueError("El cliente es obligatorio")

    especie = (payload.get("especie") or "").strip().upper() or None
    cant_machos = _flt("cant_machos") or 0
    cant_hembras = _flt("cant_hembras") or 0
    total_canales = cant_machos + cant_hembras
    if total_canales == 0:
        total_canales = _flt("total_canales") or 0

    lote = (payload.get("lote") or "").strip().upper() or None
    peso_caliente = _flt("peso_caliente")
    peso_frio = _flt("peso_frio")
    merma = None
    if peso_caliente and peso_frio is not None and peso_caliente > 0:
        merma = (peso_caliente - peso_frio) / peso_caliente

    cava = (payload.get("cava") or "").strip() or None

    observaciones = (payload.get("observaciones") or "").strip() or None
    if not observaciones and fb and fp:
        dias = (fp - fb).days
        if dias >= 0:
            observaciones = f"{dias} dias en cava"

    item = siguiente_item()
    mes = fp.month
    anio = fp.year
    mes_texto = MES_TEXTO[mes]

    db.execute(
        "INSERT INTO merma_frio "
        "(item, fecha_beneficio, fecha_produccion, mes, cliente, especie, "
        " cant_machos, cant_hembras, total_canales, lote, peso_caliente, peso_frio, "
        " merma_frio, cava, observaciones, mes_texto, anio, fecha, origen) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'manual')",
        (
            item, fb, fp, mes, cliente, especie,
            cant_machos, cant_hembras, total_canales, lote,
            peso_caliente, peso_frio, merma, cava, observaciones,
            mes_texto, anio, fp,
        ),
    )
    last = db.fetch_one("SELECT LAST_INSERT_ID() AS id")
    return {
        "id": int(last["id"]) if last else 0,
        "item": item,
        "fecha_produccion": fp.isoformat(),
        "fecha_beneficio": fb.isoformat() if fb else None,
        "cliente": cliente,
        "especie": especie,
        "total_canales": total_canales,
        "merma_frio": merma,
        "observaciones": observaciones,
    }


def manuales_recientes(limit: int = 30) -> list[dict]:
    return db.fetch_all(
        "SELECT id, creado_en, item, fecha_beneficio, fecha_produccion, "
        "       cliente, especie, total_canales, peso_caliente, peso_frio, "
        "       merma_frio, cava, observaciones "
        "FROM merma_frio WHERE origen='manual' "
        "ORDER BY id DESC LIMIT %s",
        (limit,),
    )


def eliminar_manual(registro_id: int) -> int:
    return db.execute(
        "DELETE FROM merma_frio WHERE id=%s AND origen='manual'",
        (registro_id,),
    )
