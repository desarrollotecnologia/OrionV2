"""Dashboard dedicado al reporte de paradas."""
from __future__ import annotations

from flask import Blueprint, render_template

from controllers.auth import login_required

bp = Blueprint("paradas", __name__, url_prefix="/paradas")


@bp.route("/")
@login_required
def index():
    return render_template("paradas.html", page="paradas")
