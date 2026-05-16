"""Tablero de indicadores semanal."""
from __future__ import annotations

from flask import Blueprint, render_template

from controllers.auth import login_required

bp = Blueprint("tablero", __name__)


@bp.route("/tablero")
@login_required
def index():
    return render_template("tablero.html", page="tablero")
