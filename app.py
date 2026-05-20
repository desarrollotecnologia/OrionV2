"""ORION - aplicativo Flask + SocketIO con MVC tradicional."""
from __future__ import annotations

import logging
import sys
from pathlib import Path

from flask import Flask, redirect, url_for
from flask_socketio import SocketIO

from config import config
from database import db
from controllers import (
    auth_bp,
    dashboard_bp,
    tablero_bp,
    mensual_bp,
    captura_bp,
    paradas_bp,
    api_bp,
)
from models import user as user_model
from services import live as live_bus
from services.excel_importer import import_all
from services.excel_watcher import ExcelWatcher
from models import sync_log as sync_log_model


BASE_DIR = Path(__file__).resolve().parent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("orion.app")


def _init_database() -> bool:
    """Inicializa la BD; retorna False si no se pudo conectar."""
    try:
        db.init_database()
        db.ensure_schema()
        user_model.ensure_default_admin()
        log.info("Base de datos lista. Usuario admin asegurado.")
        return True
    except Exception as exc:  # noqa: BLE001
        log.error(
            "No se pudo conectar/preparar la base de datos: %s. "
            "Verifica DB_HOST/DB_USER/DB_PASSWORD en .env",
            exc,
        )
        return False


def _initial_import() -> None:
    if not config.EXCEL_PATH.exists():
        log.warning(
            "No se encontro el Excel ORION en %s. "
            "Ajusta EXCEL_PATH en .env o copia el archivo.",
            config.EXCEL_PATH,
        )
        return
    log.info("Importacion inicial del Excel...")
    summary = import_all()
    estado = "ok" if summary.get("ok") else "warn"
    sync_log_model.add(
        estado,
        summary.get("archivo", ""),
        f"inicial hojas={summary.get('hojas')}",
        summary.get("duracion_seg"),
    )
    log.info("Resumen importacion: %s", summary)


def create_app() -> tuple[Flask, SocketIO]:
    app = Flask(
        __name__,
        template_folder=str(BASE_DIR / "views" / "templates"),
        static_folder=str(BASE_DIR / "static"),
    )
    app.config["SECRET_KEY"] = config.SECRET_KEY
    app.config["JSON_AS_ASCII"] = False
    app.config["TEMPLATES_AUTO_RELOAD"] = config.FLASK_DEBUG

    app.register_blueprint(auth_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(tablero_bp)
    app.register_blueprint(mensual_bp)
    app.register_blueprint(captura_bp)
    app.register_blueprint(paradas_bp)
    app.register_blueprint(api_bp)

    @app.route("/healthz")
    def healthz():
        return {"status": "ok"}

    @app.errorhandler(404)
    def not_found(_):
        return redirect(url_for("dashboard.index"))

    socketio = SocketIO(
        app,
        async_mode="threading",
        cors_allowed_origins="*",
        logger=False,
        engineio_logger=False,
    )

    @socketio.on("connect", namespace="/live")
    def on_connect():
        log.info("Cliente conectado al canal /live")

    @socketio.on("disconnect", namespace="/live")
    def on_disconnect():
        log.info("Cliente desconectado del canal /live")

    live_bus.configure(socketio)
    return app, socketio


def main() -> int:
    if not _init_database():
        log.error(
            "No se puede continuar sin la base de datos. Asegurate de que "
            "MariaDB (XAMPP) este corriendo y revisa DB_* en el archivo .env."
        )
        return 1

    _initial_import()
    app, socketio = create_app()

    watcher: ExcelWatcher | None = None
    if config.WATCHER_ENABLED:
        def on_change(summary):
            live_bus.broadcast("orion:sync", {"summary": summary})
        watcher = ExcelWatcher(on_change=on_change)
        watcher.start()

    try:
        log.info(
            "Servidor ORION listo en http://%s:%s/  (CTRL+C para detener)",
            config.FLASK_HOST,
            config.FLASK_PORT,
        )
        socketio.run(
            app,
            host=config.FLASK_HOST,
            port=config.FLASK_PORT,
            debug=config.FLASK_DEBUG,
            use_reloader=False,
            allow_unsafe_werkzeug=True,
        )
    finally:
        if watcher is not None:
            watcher.stop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
