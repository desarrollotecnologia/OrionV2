"""Vista mensual: cumplimiento, indicadores, operatividad, paradas."""
from __future__ import annotations

from flask import Blueprint, render_template

from controllers.auth import login_required

bp = Blueprint("mensual", __name__)


@bp.route("/mensual")
@login_required
def index():
    return render_template("mensual.html", page="mensual")
