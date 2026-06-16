"""Dashboard oculto de usabilidad (solo desbloqueo por comando)."""
from __future__ import annotations

from flask import Blueprint, abort, render_template, session

from controllers.auth import admin_required, login_required

bp = Blueprint("usabilidad", __name__)


def _allow() -> bool:
    return bool(session.get("usab_unlock") is True)


@bp.route("/_hidden/usabilidad")
@login_required
@admin_required
def index():
    if not _allow():
        abort(404)
    return render_template("usabilidad.html", page=None)
