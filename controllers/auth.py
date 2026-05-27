"""Autenticacion (login / logout / cambio de contrasena)."""
from __future__ import annotations

from functools import wraps

from flask import Blueprint, flash, redirect, render_template, request, session, url_for

from models import user as user_model

bp = Blueprint("auth", __name__)


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if not session.get("user_id"):
            return redirect(url_for("auth.login", next=request.path))
        if session.get("must_change_password"):
            allowed = {"auth.cambiar_contrasena", "auth.logout"}
            if request.endpoint not in allowed:
                return redirect(url_for("auth.cambiar_contrasena"))
        return view(*args, **kwargs)
    return wrapper


def admin_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if session.get("user_role") != "admin":
            flash("No tienes permiso para acceder a esa seccion.", "error")
            return redirect(url_for("dashboard.index"))
        return view(*args, **kwargs)
    return wrapper


def _set_session(u: dict) -> None:
    session.clear()
    session["user_id"] = u["id"]
    session["user_name"] = u.get("nombre") or u["username"]
    session["user_role"] = u.get("rol", "user")
    session["must_change_password"] = bool(u.get("must_change_password"))


@bp.route("/login", methods=["GET", "POST"])
def login():
    if session.get("user_id") and not session.get("must_change_password"):
        return redirect(url_for("dashboard.index"))
    if request.method == "POST":
        username = (request.form.get("username") or "").strip().lower()
        password = request.form.get("password") or ""
        u = user_model.get_by_username(username)
        if not u or not user_model.verify_password(password, u["password_hash"]):
            flash("Credenciales invalidas", "error")
            return render_template("login.html", username=username), 401
        _set_session(u)
        if session.get("must_change_password"):
            flash("Debes cambiar tu contrasena antes de continuar.", "info")
            return redirect(url_for("auth.cambiar_contrasena"))
        next_url = request.args.get("next") or url_for("dashboard.index")
        return redirect(next_url)
    return render_template("login.html")


@bp.route("/cambiar-contrasena", methods=["GET", "POST"])
@login_required
def cambiar_contrasena():
    if request.method == "POST":
        actual = request.form.get("password_actual") or ""
        nueva = request.form.get("password_nueva") or ""
        confirm = request.form.get("password_confirm") or ""
        if nueva != confirm:
            flash("La confirmacion no coincide.", "error")
            return render_template("cambiar_contrasena.html"), 400
        try:
            user_model.cambiar_password(session["user_id"], actual, nueva)
        except ValueError as exc:
            flash(str(exc), "error")
            return render_template("cambiar_contrasena.html"), 400
        session["must_change_password"] = False
        flash("Contrasena actualizada correctamente.", "ok")
        return redirect(url_for("dashboard.index"))
    return render_template(
        "cambiar_contrasena.html",
        obligatorio=bool(session.get("must_change_password")),
    )


@bp.route("/logout", methods=["POST", "GET"])
def logout():
    session.clear()
    return redirect(url_for("auth.login"))
