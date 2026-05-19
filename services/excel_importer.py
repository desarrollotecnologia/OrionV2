"""Importador unico del Excel ORION.xlsx hacia MySQL.

Todas las hojas y modulos se cargan desde este archivo (no hay importadores
por modulo). Registro central en IMPORT_JOBS al final.

Mapa hoja -> tabla -> modulos web:
  ORION              -> indicadores_orion     -> Dashboard, Mensual
  BASE DATOS         -> base_datos            -> Dashboard, Mensual, Captura BD
  MERMA FRIO         -> merma_frio            -> Dashboard, Captura merma
  MERMA FRIO% *      -> merma_resumen         -> Mensual
  PPTO DESP.         -> ppto_desp             -> Dashboard
  TABLERO IND.       -> tablero_ind           -> Tablero indicadores
  REPORTEOPER        -> reporte_*             -> Mensual
  PARADASTD          -> paradas_std           -> Dashboard, Mensual
  TIEMPO PRODUCCION  -> tiempo_produccion     -> Dashboard
  CARGOS             -> cargos                -> API /personal

Sincronizacion idempotente: TRUNCATE o DELETE origen=excel, luego INSERT.
"""
from __future__ import annotations

import logging
import math
import time
import unicodedata
from datetime import date, datetime, time as dtime
from pathlib import Path
from typing import Any, Iterable

import pandas as pd

from config import config
from database import db

log = logging.getLogger("orion.import")

MES_NUM = {
    "ENERO": 1, "FEBRERO": 2, "MARZO": 3, "ABRIL": 4,
    "MAYO": 5, "JUNIO": 6, "JULIO": 7, "AGOSTO": 8,
    "SEPTIEMBRE": 9, "SETIEMBRE": 9, "OCTUBRE": 10,
    "NOVIEMBRE": 11, "DICIEMBRE": 12,
}


# ---------------- Helpers ----------------

def _norm(text: Any) -> str:
    s = str(text or "").strip()
    nfkd = unicodedata.normalize("NFKD", s)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).upper()


def _is_blank(v: Any) -> bool:
    if v is None:
        return True
    if isinstance(v, float) and math.isnan(v):
        return True
    if isinstance(v, str) and not v.strip():
        return True
    return False


def _to_float(v: Any) -> float | None:
    if _is_blank(v):
        return None
    try:
        if isinstance(v, str):
            s = v.replace(",", ".").strip()
            if s.endswith("%"):
                return float(s[:-1]) / 100.0
            return float(s)
        f = float(v)
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    except (TypeError, ValueError):
        return None


def _to_int(v: Any) -> int | None:
    f = _to_float(v)
    if f is None:
        return None
    try:
        return int(round(f))
    except (TypeError, ValueError):
        return None


def _to_str(v: Any, max_len: int | None = None) -> str | None:
    if _is_blank(v):
        return None
    if isinstance(v, float):
        if math.isnan(v):
            return None
        if v.is_integer():
            v = int(v)
    s = str(v).strip()
    if not s or s == "nan":
        return None
    if max_len and len(s) > max_len:
        s = s[:max_len]
    return s


def _to_date(v: Any) -> date | None:
    if _is_blank(v):
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    if isinstance(v, (int, float)):
        try:
            return (datetime(1899, 12, 30) + pd.Timedelta(days=float(v))).date()
        except Exception:  # noqa: BLE001
            return None
    if isinstance(v, str):
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d"):
            try:
                return datetime.strptime(v.strip(), fmt).date()
            except ValueError:
                continue
    return None


def _to_time_str(v: Any) -> str | None:
    if _is_blank(v):
        return None
    if isinstance(v, dtime):
        return v.strftime("%H:%M:%S")
    if isinstance(v, datetime):
        return v.strftime("%H:%M:%S")
    if isinstance(v, (int, float)):
        try:
            seconds = int(round(float(v) * 86400))
            seconds = max(seconds, 0)
            h, rem = divmod(seconds, 3600)
            m, s = divmod(rem, 60)
            return f"{h:02d}:{m:02d}:{s:02d}"
        except Exception:  # noqa: BLE001
            return None
    if isinstance(v, str):
        return v.strip() or None
    return None


def _read_sheet(path: Path, name: str) -> pd.DataFrame | None:
    try:
        return pd.read_excel(path, sheet_name=name, header=None, engine="openpyxl")
    except Exception as exc:  # noqa: BLE001
        log.warning("No se pudo leer la hoja '%s': %s", name, exc)
        return None


def _truncate_insert(table: str, insert_sql: str, rows: list[tuple]) -> int:
    db.execute(f"TRUNCATE TABLE {table}")
    if rows:
        db.executemany(insert_sql, rows)
    return len(rows)


def _replace_excel_rows(table: str, insert_sql: str, rows: list[tuple]) -> int:
    db.execute(f"DELETE FROM {table} WHERE origen = 'excel'")
    if rows:
        db.executemany(insert_sql, rows)
    return len(rows)


# ---------------- Importadores por hoja (logica especifica) ----------------

def _import_orion(path: Path) -> int:
    df = _read_sheet(path, "ORION")
    if df is None or df.empty:
        return 0
    cells = df.values
    rows: list[tuple] = []

    def _value(r: int, c: int) -> Any:
        if r < 0 or r >= cells.shape[0] or c < 0 or c >= cells.shape[1]:
            return None
        return cells[r][c]

    mes = _to_int(_value(1, 4))
    anio = _to_int(_value(2, 4))
    fecha = _to_date(_value(3, 4))

    # Indicadores BOVINOS / PORCINOS (col B = seccion, C = #, D = criterio,
    # E = HOY, F = ACUMULADO)
    seccion_actual = None
    for r in range(8, cells.shape[0]):
        seccion_celda = _to_str(_value(r, 1))
        if seccion_celda:
            seccion_actual = _norm(seccion_celda)
        item = _to_int(_value(r, 2))
        criterio = _to_str(_value(r, 3))
        if not criterio or not seccion_actual:
            continue
        if _norm(criterio).startswith("OBSERVACIONES"):
            break
        hoy = _to_float(_value(r, 4))
        acumulado = _to_float(_value(r, 5))
        rows.append((
            mes, anio, fecha,
            seccion_actual, "INDICADORES",
            item, criterio,
            hoy, acumulado,
            None, None, None,
            None, None,
        ))

    # Cumplimiento de metas (col H=#, I=criterio, K=meta hoy, L=ejec hoy,
    # M=cump hoy, N=meta acum, O=ejec acum, P=cump acum)
    for r in range(8, cells.shape[0]):
        item = _to_int(_value(r, 7))
        criterio = _to_str(_value(r, 8))
        if not criterio:
            continue
        if _norm(criterio).startswith("OBSERVACIONES"):
            break
        meta_h = _to_float(_value(r, 10))
        ejec_h = _to_float(_value(r, 11))
        cump_h = _to_float(_value(r, 12))
        meta_a = _to_float(_value(r, 13))
        ejec_a = _to_float(_value(r, 14))
        cump_a = _to_float(_value(r, 15))
        if any(v is not None for v in (meta_h, ejec_h, cump_h)):
            rows.append((
                mes, anio, fecha,
                "GENERAL", "CUMPLIMIENTO_HOY",
                item, criterio,
                None, None,
                meta_h, ejec_h, cump_h,
                None, None,
            ))
        if any(v is not None for v in (meta_a, ejec_a, cump_a)):
            rows.append((
                mes, anio, fecha,
                "GENERAL", "CUMPLIMIENTO_ACUM",
                item, criterio,
                None, None,
                meta_a, ejec_a, cump_a,
                None, None,
            ))

    # Operatividad (col Q=item col17, R=criterio col18, S=cant col19, T=% col20)
    # Para a la primera fila que diga TOTAL en cualquiera de las dos primeras cols.
    import re
    has_letter = re.compile(r"[A-Za-zÁÉÍÓÚÑáéíóúñ]")
    for r in range(8, cells.shape[0]):
        item_raw = _to_str(_value(r, 17))
        criterio = _to_str(_value(r, 18))
        # Stop conditions
        if (item_raw and _norm(item_raw).startswith("TOTAL")) or \
           (criterio and _norm(criterio).startswith("TOTAL")):
            break
        if not criterio:
            continue
        n = _norm(criterio)
        if n.startswith("OBSERVACIONES"):
            break
        if not has_letter.search(criterio):
            continue
        # Solo aceptamos filas con item numerico para evitar headers/sub-bloques
        item = _to_int(_value(r, 17))
        if item is None:
            continue
        cantidad = _to_float(_value(r, 19))
        porcentaje = _to_float(_value(r, 20))
        rows.append((
            mes, anio, fecha,
            "OPERATIVIDAD", "OPERATIVIDAD",
            item, criterio,
            None, None,
            None, None, None,
            cantidad, porcentaje,
        ))

    # Cifras del mes (col W=22 contiene el nombre del bloque o % REND;
    # col X=23 contiene % MERMA). Patron en el Excel:
    #   Fila N : C22="DESPOSTE"        (nombre bloque)
    #   Fila N+2: C22="% REND."        C23="% MERMA"   (subheader)
    #   Fila N+3: C22=valor rend       C23=valor merma
    secciones_cifras = []
    for r in range(5, cells.shape[0]):
        nombre = _to_str(_value(r, 22))
        if not nombre:
            continue
        n = _norm(nombre)
        if n not in ("DESPOSTE", "PORCIONADO", "MOLIDO", "DESPALE", "REPELE"):
            continue
        # Buscamos "% REND." en las siguientes 4 filas
        rend, merma = None, None
        for k in range(1, 5):
            rr = r + k
            if rr >= cells.shape[0]:
                break
            label22 = _to_str(_value(rr, 22))
            if label22 and "REND" in _norm(label22):
                # los valores estan en la fila siguiente
                if rr + 1 < cells.shape[0]:
                    rend = _to_float(_value(rr + 1, 22))
                    merma = _to_float(_value(rr + 1, 23))
                break
        if n not in [s[0] for s in secciones_cifras]:
            secciones_cifras.append((n, rend, merma))

    for idx, (sec, rend, merma) in enumerate(secciones_cifras, start=1):
        rows.append((
            mes, anio, fecha,
            sec, "CIFRAS",
            idx, "% REND",
            rend, None,
            None, None, None,
            None, None,
        ))
        rows.append((
            mes, anio, fecha,
            sec, "CIFRAS",
            idx, "% MERMA",
            merma, None,
            None, None, None,
            None, None,
        ))

    return _truncate_insert(
        "indicadores_orion",
        "INSERT INTO indicadores_orion "
        "(mes, anio, fecha, seccion, bloque, item, criterio, hoy, acumulado, "
        " meta, ejecutado, cumplimiento, cantidad, porcentaje) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        rows,
    )


def _import_base_datos(path: Path) -> int:
    df = _read_sheet(path, "BASE DATOS")
    if df is None or df.empty:
        return 0
    cells = df.values
    rows = []
    for r in range(2, cells.shape[0]):
        fecha = _to_date(cells[r][1] if cells.shape[1] > 1 else None)
        cliente = _to_str(cells[r][4] if cells.shape[1] > 4 else None, 200)
        if not fecha and not cliente:
            continue
        rows.append((
            _to_int(cells[r][0]),
            fecha,
            _to_int(cells[r][2]),
            _to_int(cells[r][3]),
            cliente,
            _to_str(cells[r][5], 50),
            _to_str(cells[r][6], 50),
            _to_str(cells[r][7], 80),
            _to_int(cells[r][8]),
            _to_str(cells[r][9], 80),
            _to_float(cells[r][10]),
            _to_float(cells[r][11]),
            _to_time_str(cells[r][12]),
            _to_time_str(cells[r][13]),
            _to_time_str(cells[r][14]),
            _to_time_str(cells[r][15]),
            _to_float(cells[r][16]),
            _to_float(cells[r][17]),
            _to_float(cells[r][18]),
            _to_str(cells[r][19] if cells.shape[1] > 19 else None, 20),
        ))

    return _replace_excel_rows(
        "base_datos",
        "INSERT INTO base_datos "
        "(item, fecha, mes, anio, cliente, especie, limpieza, proceso, operarios, lote, "
        " canales, kilos, hora_inicio, hora_fin, tiempo_reposo, tiempo_total, "
        " velocidad_canal_h, velocidad_kilos_h, velocidad_canal_hh, mes_texto, origen) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'excel')",
        rows,
    )


def _import_merma_frio(path: Path) -> int:
    df = _read_sheet(path, "MERMA FRIO")
    if df is None or df.empty:
        return 0
    cells = df.values
    rows = []
    for r in range(1, cells.shape[0]):
        item = _to_int(cells[r][0])
        cliente = _to_str(cells[r][4] if cells.shape[1] > 4 else None, 200)
        if item is None and not cliente:
            continue
        rows.append((
            item,
            _to_date(cells[r][1]),
            _to_date(cells[r][2]),
            _to_int(cells[r][3]),
            cliente,
            _to_str(cells[r][5], 50),
            _to_float(cells[r][6]),
            _to_float(cells[r][7]),
            _to_float(cells[r][8]),
            _to_str(cells[r][9], 80),
            _to_float(cells[r][10]),
            _to_float(cells[r][11]),
            _to_float(cells[r][12]),
            _to_str(cells[r][13], 50),
            _to_str(cells[r][14], 255),
            _to_str(cells[r][15] if cells.shape[1] > 15 else None, 20),
            _to_int(cells[r][16] if cells.shape[1] > 16 else None),
            _to_date(cells[r][17] if cells.shape[1] > 17 else None),
        ))
    return _replace_excel_rows(
        "merma_frio",
        "INSERT INTO merma_frio "
        "(item, fecha_beneficio, fecha_produccion, mes, cliente, especie, "
        " cant_machos, cant_hembras, total_canales, lote, peso_caliente, peso_frio, "
        " merma_frio, cava, observaciones, mes_texto, anio, fecha, origen) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'excel')",
        rows,
    )


def _import_merma_resumen(path: Path) -> int:
    rows: list[tuple] = []
    for sheet, periodo in (("MERMA FRIO% 25-26", "25-26"), ("MERMA FRIO% 24-25", "24-25")):
        df = _read_sheet(path, sheet)
        if df is None or df.empty:
            continue
        cells = df.values
        for r in range(1, cells.shape[0]):
            item = _to_int(cells[r][0])
            anio = _to_int(cells[r][1])
            mes_texto = _to_str(cells[r][2], 20)
            mes_num = MES_NUM.get(_norm(mes_texto)) if mes_texto else None
            merma_mensual = _to_float(cells[r][3])
            if item is None and mes_texto is None and merma_mensual is None:
                continue
            rows.append((
                item, anio, mes_texto, mes_num,
                merma_mensual,
                _to_float(cells[r][4]),
                _to_float(cells[r][5]),
                periodo,
            ))
    return _truncate_insert(
        "merma_resumen",
        "INSERT INTO merma_resumen "
        "(item, anio, mes_texto, mes_num, merma_prom_mensual, merma_prom_anual, "
        " comportamiento, periodo) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
        rows,
    )


def _import_ppto_desp(path: Path) -> int:
    df = _read_sheet(path, "PPTO DESP.")
    if df is None or df.empty:
        return 0
    cells = df.values
    anio = None
    for r in range(0, min(cells.shape[0], 12)):
        for c in range(0, min(cells.shape[1], 12)):
            v = _to_int(cells[r][c])
            if v and 2000 < v < 2100:
                anio = v
                break
        if anio:
            break
    rows = []
    # Encabezado en R02 col F-I, datos a partir de R03 (col F=mes, G=meta, H=ejec, I=cump)
    for r in range(3, cells.shape[0]):
        mes_texto = _to_str(cells[r][5] if cells.shape[1] > 5 else None, 20)
        if not mes_texto:
            continue
        mes_num = MES_NUM.get(_norm(mes_texto))
        meta = _to_float(cells[r][6])
        ejec = _to_float(cells[r][7])
        cump = _to_float(cells[r][8])
        if not mes_num and meta is None and ejec is None:
            continue
        rows.append((anio, mes_texto, mes_num, meta, ejec, cump))
    return _truncate_insert(
        "ppto_desp",
        "INSERT INTO ppto_desp (anio, mes_texto, mes_num, meta, ejecucion, cumplimiento) "
        "VALUES (%s,%s,%s,%s,%s,%s)",
        rows,
    )


def _import_tablero_ind(path: Path) -> int:
    df = _read_sheet(path, "TABLERO IND.")
    if df is None or df.empty:
        return 0
    cells = df.values
    rows = []
    # Bloques: BOVINOS (filas 3-7) y PORCINOS (filas 11-15) en columnas Y(24)/Z(25)/AA(26)
    blocks = [
        ("BOVINOS", range(3, 8)),
        ("PORCINOS", range(11, 16)),
    ]
    for especie, rng in blocks:
        for r in rng:
            if r >= cells.shape[0]:
                continue
            semana = _to_int(cells[r][24] if cells.shape[1] > 24 else None)
            if semana is None:
                continue
            meta = _to_float(cells[r][25] if cells.shape[1] > 25 else None)
            ejec = _to_float(cells[r][26] if cells.shape[1] > 26 else None)
            cump = (ejec / meta) if (ejec is not None and meta) else None
            rows.append((especie, semana, meta, ejec, cump))
    return _truncate_insert(
        "tablero_ind",
        "INSERT INTO tablero_ind (especie, semana, meta, ejecucion, cumplimiento) "
        "VALUES (%s,%s,%s,%s,%s)",
        rows,
    )


def _import_reporte_oper(path: Path) -> int:
    df = _read_sheet(path, "REPORTEOPER")
    if df is None or df.empty:
        return 0
    cells = df.values
    operatividad: list[tuple] = []
    extras: list[tuple] = []
    kilogramos: list[tuple] = []

    # OPERATIVIDAD (col B-F, filas 4-12 aprox, hasta TOTAL)
    for r in range(4, min(cells.shape[0], 16)):
        criterio = _to_str(cells[r][2] if cells.shape[1] > 2 else None, 150)
        if not criterio:
            continue
        if _norm(criterio).startswith("TOTAL"):
            break
        item = _to_str(cells[r][1] if cells.shape[1] > 1 else None, 20)
        cant = _to_float(cells[r][3] if cells.shape[1] > 3 else None)
        porc = _to_float(cells[r][4] if cells.shape[1] > 4 else None)
        operarios = _to_str(cells[r][5] if cells.shape[1] > 5 else None, 150)
        operatividad.append((item, criterio, cant, porc, operarios))

    # EXTRAS (col I-M aprox), buscamos filas con mes_texto en col J
    for r in range(4, cells.shape[0]):
        mes_texto = _to_str(cells[r][9] if cells.shape[1] > 9 else None, 20)
        if not mes_texto:
            continue
        mes_num = MES_NUM.get(_norm(mes_texto))
        if not mes_num:
            continue
        item = _to_int(cells[r][8] if cells.shape[1] > 8 else None)
        ext = _to_float(cells[r][10] if cells.shape[1] > 10 else None)
        prom_he = _to_float(cells[r][11] if cells.shape[1] > 11 else None)
        prom_dia = _to_float(cells[r][12] if cells.shape[1] > 12 else None)
        extras.append((item, mes_texto, mes_num, ext, prom_he, prom_dia))

    # KILOGRAMOS: buscamos en columnas W-AC. Cada fila tiene un concepto en col Y
    # y meses como columnas (DICIEMBRE...ABRIL)
    header_row_idx = None
    for r in range(0, min(cells.shape[0], 8)):
        for c in range(20, min(cells.shape[1], 30)):
            t = _norm(_to_str(cells[r][c]))
            if t == "DICIEMBRE":
                header_row_idx = r
                break
        if header_row_idx is not None:
            break
    if header_row_idx is not None:
        meses_cols: list[tuple[int, str, int]] = []
        for c in range(0, cells.shape[1]):
            t = _to_str(cells[header_row_idx][c], 20)
            tn = _norm(t) if t else ""
            mn = MES_NUM.get(tn)
            if mn:
                meses_cols.append((c, t, mn))
        for r in range(header_row_idx + 1, cells.shape[0]):
            concepto = _to_str(cells[r][24] if cells.shape[1] > 24 else None, 150)
            if not concepto:
                continue
            item = _to_int(cells[r][22] if cells.shape[1] > 22 else None)
            for c_idx, mes_texto, mes_num in meses_cols:
                kg = _to_float(cells[r][c_idx])
                if kg is None:
                    continue
                kilogramos.append((item, concepto, mes_texto, mes_num, kg))

    db.execute("TRUNCATE TABLE reporte_operatividad")
    db.execute("TRUNCATE TABLE reporte_extras")
    db.execute("TRUNCATE TABLE reporte_kilogramos")
    if operatividad:
        db.executemany(
            "INSERT INTO reporte_operatividad (item, criterio, cant_personas, porcentaje, operarios) "
            "VALUES (%s,%s,%s,%s,%s)",
            operatividad,
        )
    if extras:
        db.executemany(
            "INSERT INTO reporte_extras (item, mes_texto, mes_num, extras, promedio_he_dia, promedio_dia_oper) "
            "VALUES (%s,%s,%s,%s,%s,%s)",
            extras,
        )
    if kilogramos:
        db.executemany(
            "INSERT INTO reporte_kilogramos (item, concepto, mes_texto, mes_num, kilogramos) "
            "VALUES (%s,%s,%s,%s,%s)",
            kilogramos,
        )
    return len(operatividad) + len(extras) + len(kilogramos)


def _import_paradas(path: Path) -> int:
    df = _read_sheet(path, "PARADASTD")
    if df is None or df.empty:
        return 0
    cells = df.values
    rows = []
    for r in range(1, cells.shape[0]):
        fecha = _to_date(cells[r][0] if cells.shape[1] > 0 else None)
        if not fecha:
            continue
        rows.append((
            fecha,
            _to_float(cells[r][1] if cells.shape[1] > 1 else None),
            _to_float(cells[r][2] if cells.shape[1] > 2 else None),
            _to_float(cells[r][3] if cells.shape[1] > 3 else None),
            _to_float(cells[r][4] if cells.shape[1] > 4 else None),
            _to_float(cells[r][5] if cells.shape[1] > 5 else None),
            _to_float(cells[r][6] if cells.shape[1] > 6 else None),
            _to_float(cells[r][7] if cells.shape[1] > 7 else None),
            _to_float(cells[r][8] if cells.shape[1] > 8 else None),
            _to_float(cells[r][9] if cells.shape[1] > 9 else None),
            _to_float(cells[r][10] if cells.shape[1] > 10 else None),
            _to_float(cells[r][11] if cells.shape[1] > 11 else None),
        ))
    return _truncate_insert(
        "paradas_std",
        "INSERT INTO paradas_std "
        "(fecha, tardanza_inicio, lavado_desinfeccion, dano_sistema_1, dano_sistema_2, "
        " fallas_electricas, fallas_sistema, falta_canastillas, parada_alimentacion, "
        " recepcion_entrega, reunion_magica, total) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        rows,
    )


def _import_tiempo_produccion(path: Path) -> int:
    df = _read_sheet(path, "TIEMPO PRODUCCION")
    if df is None or df.empty:
        return 0
    cells = df.values
    rows = []
    for r in range(2, cells.shape[0]):
        cliente = _to_str(cells[r][1] if cells.shape[1] > 1 else None, 200)
        if not cliente or _norm(cliente).startswith("CLIENTES"):
            continue
        rows.append((
            cliente,
            _to_float(cells[r][2] if cells.shape[1] > 2 else None),
            _to_float(cells[r][3] if cells.shape[1] > 3 else None),
            _to_time_str(cells[r][4] if cells.shape[1] > 4 else None),
            _to_time_str(cells[r][5] if cells.shape[1] > 5 else None),
        ))
    return _truncate_insert(
        "tiempo_produccion",
        "INSERT INTO tiempo_produccion (cliente, canales, canales_promedio, tiempo_promedio, tiempo_estimado) "
        "VALUES (%s,%s,%s,%s,%s)",
        rows,
    )


def _import_cargos(path: Path) -> int:
    df = _read_sheet(path, "CARGOS")
    if df is None or df.empty:
        return 0
    cells = df.values
    rows = []
    for r in range(3, cells.shape[0]):
        numero = _to_int(cells[r][1] if cells.shape[1] > 1 else None)
        nombre = _to_str(cells[r][2] if cells.shape[1] > 2 else None, 150)
        cargo = _to_str(cells[r][3] if cells.shape[1] > 3 else None, 120)
        if numero is None and not nombre:
            continue
        rows.append((numero, nombre, cargo))
    return _truncate_insert(
        "cargos",
        "INSERT INTO cargos (numero, nombre, cargo) VALUES (%s,%s,%s)",
        rows,
    )


# Un solo registro: etiqueta en resumen -> funcion importadora
IMPORT_JOBS: tuple[tuple[str, Any], ...] = (
    ("ORION", _import_orion),
    ("BASE DATOS", _import_base_datos),
    ("MERMA FRIO", _import_merma_frio),
    ("MERMA RESUMEN", _import_merma_resumen),
    ("PPTO DESP.", _import_ppto_desp),
    ("TABLERO IND.", _import_tablero_ind),
    ("REPORTEOPER", _import_reporte_oper),
    ("PARADASTD", _import_paradas),
    ("TIEMPO PRODUCCION", _import_tiempo_produccion),
    ("CARGOS", _import_cargos),
)


def import_all(path: Path | None = None) -> dict[str, Any]:
    """Importa todas las hojas de IMPORT_JOBS y devuelve un resumen."""
    p = Path(path) if path else config.EXCEL_PATH
    if not p.exists():
        msg = f"No existe el archivo Excel: {p}"
        log.error(msg)
        return {"ok": False, "error": msg}

    started = time.perf_counter()
    summary: dict[str, Any] = {"ok": True, "archivo": str(p), "hojas": {}}
    for nombre, func in IMPORT_JOBS:
        try:
            n = func(p)
            summary["hojas"][nombre] = n
            log.info("  hoja %-18s -> %d filas", nombre, n)
        except Exception as exc:  # noqa: BLE001
            summary["ok"] = False
            summary["hojas"][nombre] = f"error: {exc}"
            log.exception("Fallo importando %s", nombre)

    summary["duracion_seg"] = round(time.perf_counter() - started, 3)
    return summary


def _run_cli() -> int:
    """Permite importar sin levantar el servidor: python -m services.excel_importer"""
    import sys

    from database import db

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    if not Path(config.EXCEL_PATH).exists():
        log.error("No existe: %s", config.EXCEL_PATH)
        return 1
    try:
        db.init_database()
        db.ensure_schema()
    except Exception as exc:  # noqa: BLE001
        log.error("Base de datos no disponible: %s", exc)
        return 1
    summary = import_all()
    print(summary)
    return 0 if summary.get("ok") else 1


if __name__ == "__main__":
    import sys

    sys.exit(_run_cli())
