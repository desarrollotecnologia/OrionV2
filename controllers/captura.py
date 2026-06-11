"""Vistas para alimentar la base de datos desde el aplicativo."""
from __future__ import annotations

from flask import Blueprint, render_template

from controllers.auth import login_required

bp = Blueprint("captura", __name__, url_prefix="/captura")


@bp.route("/base-datos")
@login_required
def base_datos():
    return render_template("captura_base_datos.html", page="captura_bd")


@bp.route("/merma-frio")
@login_required
def merma_frio():
    return render_template("captura_merma_frio.html", page="captura_merma")


@bp.route("/paradas")
@login_required
def paradas():
    return render_template("captura_paradas.html", page="captura_paradas")


@bp.route("/proyeccion")
@login_required
def proyeccion():
    return render_template("proyeccion.html", page="captura_proyeccion")
