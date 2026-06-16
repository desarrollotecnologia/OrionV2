"""Metricas de uso internas (dashboard oculto de usabilidad)."""
from __future__ import annotations

from database import db


def _n(sql: str, params: tuple = ()) -> int:
    row = db.fetch_one(sql, params) or {}
    return int(row.get("n") or 0)


def resumen() -> dict:
    return {
        "usuarios_activos": _n("SELECT COUNT(*) AS n FROM users WHERE activo=1"),
        "usuarios_totales": _n("SELECT COUNT(*) AS n FROM users"),
        "sync_7d": _n(
            "SELECT COUNT(*) AS n FROM sync_log "
            "WHERE sincronizado_en >= DATE_SUB(NOW(), INTERVAL 7 DAY)"
        ),
        "capturas_bd_7d": _n(
            "SELECT COUNT(*) AS n FROM base_datos "
            "WHERE origen='manual' AND creado_en >= DATE_SUB(NOW(), INTERVAL 7 DAY)"
        ),
        "capturas_merma_7d": _n(
            "SELECT COUNT(*) AS n FROM merma_frio "
            "WHERE origen='manual' AND creado_en >= DATE_SUB(NOW(), INTERVAL 7 DAY)"
        ),
        "capturas_paradas_7d": _n(
            "SELECT COUNT(*) AS n FROM paradas_std "
            "WHERE origen='manual' AND creado_en >= DATE_SUB(NOW(), INTERVAL 7 DAY)"
        ),
        "proyecciones_7d": _n(
            "SELECT COUNT(*) AS n FROM proyecciones "
            "WHERE creado_en >= DATE_SUB(NOW(), INTERVAL 7 DAY)"
        ),
    }


def capturas_diarias_30d() -> list[dict]:
    return db.fetch_all(
        "SELECT DATE(creado_en) AS fecha, COUNT(*) AS total "
        "FROM base_datos "
        "WHERE origen='manual' AND creado_en >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) "
        "GROUP BY DATE(creado_en) ORDER BY fecha ASC"
    )


def sync_diarias_30d() -> list[dict]:
    return db.fetch_all(
        "SELECT DATE(sincronizado_en) AS fecha, COUNT(*) AS total "
        "FROM sync_log "
        "WHERE sincronizado_en >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) "
        "GROUP BY DATE(sincronizado_en) ORDER BY fecha ASC"
    )


def actividad_usuario_30d() -> list[dict]:
    return db.fetch_all(
        "SELECT COALESCE(creado_por, 'SIN USUARIO') AS usuario, COUNT(*) AS total "
        "FROM proyecciones "
        "WHERE creado_en >= DATE_SUB(NOW(), INTERVAL 30 DAY) "
        "GROUP BY COALESCE(creado_por, 'SIN USUARIO') "
        "ORDER BY total DESC LIMIT 15"
    )
