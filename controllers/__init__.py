"""Controladores Flask del aplicativo ORION."""
from .auth import bp as auth_bp
from .dashboard import bp as dashboard_bp
from .tablero import bp as tablero_bp
from .mensual import bp as mensual_bp
from .captura import bp as captura_bp
from .paradas import bp as paradas_bp
from .usuarios import bp as usuarios_bp
from .api import bp as api_bp
from .email_bot import view_bp as email_bot_bp, api_bp as email_bot_api_bp

__all__ = [
    "auth_bp",
    "dashboard_bp",
    "tablero_bp",
    "mensual_bp",
    "captura_bp",
    "paradas_bp",
    "usuarios_bp",
    "api_bp",
    "email_bot_bp",
    "email_bot_api_bp",
]
