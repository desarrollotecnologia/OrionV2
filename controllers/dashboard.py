"""Pantalla principal del dashboard."""
from __future__ import annotations

from flask import Blueprint, render_template

from controllers.auth import login_required

bp = Blueprint("dashboard", __name__)


@bp.route("/")
@login_required
def index():
    return render_template("dashboard.html", page="dashboard")
