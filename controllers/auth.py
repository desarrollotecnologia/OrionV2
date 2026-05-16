"""Autenticacion (login / logout)."""
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
        return view(*args, **kwargs)
    return wrapper


@bp.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        password = request.form.get("password") or ""
        u = user_model.get_by_username(username)
        if not u or not user_model.verify_password(password, u["password_hash"]):
            flash("Credenciales invalidas", "error")
            return render_template("login.html", username=username), 401
        session.clear()
        session["user_id"] = u["id"]
        session["user_name"] = u.get("nombre") or u["username"]
        session["user_role"] = u.get("rol", "user")
        next_url = request.args.get("next") or url_for("dashboard.index")
        return redirect(next_url)
    return render_template("login.html")


@bp.route("/logout", methods=["POST", "GET"])
def logout():
    session.clear()
    return redirect(url_for("auth.login"))
