"""Gestion de usuarios (solo administradores)."""
from __future__ import annotations

from flask import Blueprint, flash, redirect, render_template, request, session, url_for

from config import config
from controllers.auth import admin_required, login_required
from models import user as user_model

bp = Blueprint("usuarios", __name__, url_prefix="/usuarios")


@bp.route("/")
@login_required
@admin_required
def index():
    return render_template(
        "usuarios.html",
        page="usuarios",
        usuarios=user_model.listar(),
        roles=user_model.ROLES,
        reset_password=config.DEFAULT_RESET_PASSWORD,
    )


@bp.route("/crear", methods=["POST"])
@login_required
@admin_required
def crear():
    username = (request.form.get("username") or "").strip().lower()
    nombre = (request.form.get("nombre") or "").strip() or None
    rol = (request.form.get("rol") or "user").strip()
    try:
        user_model.create_user(
            username=username,
            password=config.DEFAULT_RESET_PASSWORD,
            nombre=nombre,
            rol=rol,
            must_change=True,
        )
        flash(
            f"Usuario {username} creado. Contrasena inicial: {config.DEFAULT_RESET_PASSWORD}",
            "ok",
        )
    except ValueError as exc:
        flash(str(exc), "error")
    return redirect(url_for("usuarios.index"))


@bp.route("/<int:user_id>/restablecer", methods=["POST"])
@login_required
@admin_required
def restablecer(user_id: int):
    if user_id == session.get("user_id"):
        flash("No puedes restablecer tu propia contrasena desde aqui.", "error")
        return redirect(url_for("usuarios.index"))
    try:
        user_model.restablecer_password(user_id)
        flash(
            f"Contrasena restablecida a {config.DEFAULT_RESET_PASSWORD}. "
            "El usuario debera cambiarla al iniciar sesion.",
            "ok",
        )
    except ValueError as exc:
        flash(str(exc), "error")
    return redirect(url_for("usuarios.index"))


@bp.route("/<int:user_id>/eliminar", methods=["POST"])
@login_required
@admin_required
def eliminar(user_id: int):
    if user_id == session.get("user_id"):
        flash("No puedes eliminar tu propia cuenta.", "error")
        return redirect(url_for("usuarios.index"))
    try:
        u = user_model.get_by_id(user_id)
        username = u["username"] if u else str(user_id)
        user_model.eliminar(user_id)
        flash(f"Usuario {username} eliminado.", "ok")
    except ValueError as exc:
        flash(str(exc), "error")
    return redirect(url_for("usuarios.index"))
