"""Prepara la base de datos e importa el Excel (ejecutar en el servidor).

Uso:
    python setup_db.py
    python setup_db.py --solo-esquema
"""
from __future__ import annotations

import argparse
import logging
import sys

from config import config
from database import db
from models import user as user_model
from services.excel_importer import import_all

log = logging.getLogger("orion.setup")


def main() -> int:
    parser = argparse.ArgumentParser(description="Inicializa BD Cut Beef e importa Excel")
    parser.add_argument(
        "--solo-esquema",
        action="store_true",
        help="Solo crea tablas y usuario web; no importa Excel",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    log.info("Conectando a MySQL %s:%s como %s", config.DB_HOST, config.DB_PORT, config.DB_USER)
    log.info("Base de datos: %s", config.DB_NAME)

    try:
        db.init_database()
        db.ensure_schema()
        user_model.ensure_default_admin()
        log.info("Esquema listo. Usuario web inicial verificado.")
    except Exception as exc:  # noqa: BLE001
        log.error("No se pudo preparar la base de datos: %s", exc)
        log.error(
            "Ejecuta database/grant_admin.sql como root en MySQL "
            "y revisa DB_USER/DB_PASSWORD en .env"
        )
        return 1

    if args.solo_esquema:
        log.info("Modo solo-esquema: importacion Excel omitida.")
        return 0

    if not config.EXCEL_PATH.exists():
        log.error("No se encontro el Excel: %s", config.EXCEL_PATH)
        log.error("Ajusta EXCEL_PATH en .env con la ruta real en este servidor.")
        return 1

    log.info("Importando Excel: %s", config.EXCEL_PATH)
    summary = import_all()
    if summary.get("ok"):
        log.info("Importacion OK en %.1f s", summary.get("duracion_seg", 0))
        for hoja, n in (summary.get("hojas") or {}).items():
            log.info("  %-18s -> %s", hoja, n)
        return 0

    log.error("Importacion con errores: %s", summary)
    return 1


if __name__ == "__main__":
    sys.exit(main())
