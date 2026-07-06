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
    usuarios_bp,
    api_bp,
    email_bot_bp,
    email_bot_api_bp,
    usabilidad_bp,
)
from models import user as user_model
from services import live as live_bus


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
        log.info("Base de datos lista. Usuario administrador inicial verificado.")
        return True
    except Exception as exc:  # noqa: BLE001
        log.error(
            "No se pudo conectar/preparar la base de datos: %s. "
            "Verifica DB_HOST/DB_USER/DB_PASSWORD en .env",
            exc,
        )
        return False


def create_app() -> tuple[Flask, SocketIO]:
    app = Flask(
        __name__,
        template_folder=str(BASE_DIR / "views" / "templates"),
        static_folder=str(BASE_DIR / "static"),
    )
    app.config["SECRET_KEY"] = config.SECRET_KEY
    app.config["JSON_AS_ASCII"] = False
    app.config["TEMPLATES_AUTO_RELOAD"] = config.FLASK_DEBUG

    @app.context_processor
    def inject_branding():
        return {
            "app_name": "Cut Beef",
            "site_portal_url": config.SITE_PORTAL_URL,
            "app_public_url": config.APP_PUBLIC_URL,
        }

    app.register_blueprint(auth_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(tablero_bp)
    app.register_blueprint(mensual_bp)
    app.register_blueprint(captura_bp)
    app.register_blueprint(paradas_bp)
    app.register_blueprint(usuarios_bp)
    app.register_blueprint(api_bp)
    app.register_blueprint(email_bot_bp)
    app.register_blueprint(email_bot_api_bp)
    app.register_blueprint(usabilidad_bp)

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
        allow_upgrades=False,
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

    app, socketio = create_app()

    log.info(
        "Servidor Cut Beef listo en http://%s:%s/  (CTRL+C para detener)",
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
    return 0


if __name__ == "__main__":
    sys.exit(main())
