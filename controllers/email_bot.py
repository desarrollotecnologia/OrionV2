"""Bot de correo: envio de PDFs a clientes."""
from __future__ import annotations

from datetime import datetime

from flask import Blueprint, jsonify, render_template, request, session

from controllers.auth import login_required
from models import cliente_contacto as contacto_model
from models import email_log as email_log_model
from services import email_bot as email_service

view_bp = Blueprint("email_bot", __name__, url_prefix="/correo")
api_bp = Blueprint("email_bot_api", __name__, url_prefix="/api/email-bot")


@view_bp.route("/")
@login_required
def index():
    return render_template(
        "email_bot.html",
        page="email_bot",
        document_types=email_service.DOCUMENT_TYPES,
        smtp_ok=email_service.smtp_configured(),
    )


@api_bp.route("/session", methods=["POST"])
@login_required
def new_session():
    return jsonify({"batch_id": email_service.new_batch_id()})


@api_bp.route("/upload", methods=["POST"])
@login_required
def upload():
    batch_id = (request.form.get("batch_id") or "").strip()
    doc_type = (request.form.get("doc_type") or "").strip()
    file = request.files.get("file")
    if not batch_id or not doc_type or not file:
        return jsonify({"ok": False, "error": "Faltan batch_id, doc_type o archivo"}), 400
    try:
        meta = email_service.save_upload(
            batch_id, doc_type, file.filename or "documento.pdf", file.read()
        )
        return jsonify({"ok": True, "file": meta})
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400


@api_bp.route("/uploads/<batch_id>")
@login_required
def uploads(batch_id: str):
    return jsonify({"files": email_service.list_uploads(batch_id)})


@api_bp.route("/contactos", methods=["GET"])
@login_required
def contactos_list():
    return jsonify({
        "contactos": contacto_model.listar(),
        "sin_email": contacto_model.listar_con_nombres_sin_email(),
    })


@api_bp.route("/contactos", methods=["POST"])
@login_required
def contactos_create():
    data = request.get_json(silent=True) or {}
    try:
        cid = contacto_model.crear(
            data.get("cliente", ""),
            data.get("email", ""),
        )
        return jsonify({"ok": True, "id": cid})
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400


@api_bp.route("/contactos/<int:contacto_id>", methods=["PUT"])
@login_required
def contactos_update(contacto_id: int):
    data = request.get_json(silent=True) or {}
    try:
        contacto_model.actualizar(
            contacto_id,
            data.get("cliente", ""),
            data.get("email", ""),
            bool(data.get("activo", True)),
        )
        return jsonify({"ok": True})
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400


@api_bp.route("/contactos/<int:contacto_id>", methods=["DELETE"])
@login_required
def contactos_delete(contacto_id: int):
    contacto_model.eliminar(contacto_id)
    return jsonify({"ok": True})


@api_bp.route("/file/<batch_id>/<doc_type>")
@login_required
def file_preview(batch_id: str, doc_type: str):
    from flask import Response

    result = email_service.read_upload_bytes(batch_id, doc_type)
    if not result:
        return jsonify({"ok": False, "error": "Archivo no encontrado"}), 404
    data, filename = result
    return Response(
        data,
        mimetype="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@api_bp.route("/file/<batch_id>/<doc_type>", methods=["DELETE"])
@login_required
def file_delete(batch_id: str, doc_type: str):
    try:
        email_service.remove_upload(batch_id, doc_type)
        return jsonify({"ok": True})
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400


@api_bp.route("/preview", methods=["POST"])
@login_required
def preview():
    data = request.get_json(silent=True) or {}
    batch_id = (data.get("batch_id") or "").strip()
    documentos = data.get("documentos") or []
    destinatarios = data.get("destinatarios") or []
    asunto = (data.get("asunto") or "").strip()
    cuerpo = (data.get("cuerpo") or "").strip()

    if not batch_id:
        return jsonify({"ok": False, "error": "Sesion de archivos invalida"}), 400
    if not documentos:
        return jsonify({"ok": False, "error": "Selecciona al menos un documento"}), 400
    if not destinatarios:
        return jsonify({"ok": False, "error": "Selecciona al menos un destinatario"}), 400
    if not asunto:
        return jsonify({"ok": False, "error": "El asunto es obligatorio"}), 400

    uploads = email_service.list_uploads(batch_id)
    preview_data = email_service.build_preview(
        destinatarios, asunto, cuerpo, documentos, uploads
    )
    preview_data["ok"] = len(preview_data["faltantes"]) == 0
    if preview_data["faltantes"]:
        preview_data["error"] = (
            "Faltan PDF por subir: " + ", ".join(preview_data["faltantes"])
        )
    return jsonify(preview_data)


@api_bp.route("/send", methods=["POST"])
@login_required
def send():
    data = request.get_json(silent=True) or {}
    batch_id = (data.get("batch_id") or "").strip()
    documentos = data.get("documentos") or []
    destinatarios = data.get("destinatarios") or []
    asunto = (data.get("asunto") or "").strip()
    cuerpo = (data.get("cuerpo") or "").strip()

    if not email_service.smtp_configured():
        return jsonify({
            "ok": False,
            "error": "SMTP no configurado. Agrega MAIL_SERVER, MAIL_FROM y MAIL_USERNAME en .env",
        }), 400

    uploads = email_service.list_uploads(batch_id)
    preview_data = email_service.build_preview(
        destinatarios, asunto, cuerpo, documentos, uploads
    )
    if preview_data["faltantes"]:
        return jsonify({
            "ok": False,
            "error": "Faltan PDF: " + ", ".join(preview_data["faltantes"]),
        }), 400

    docs_label = ", ".join(
        email_service.DOCUMENT_TYPES.get(d, d) for d in documentos
    )
    enviado_por = session.get("user_name") or session.get("user_id")
    results = email_service.send_batch(
        batch_id, destinatarios, asunto, cuerpo, documentos
    )

    for r in results:
        email_log_model.registrar(
            destinatario=r["email"],
            cliente=r.get("cliente"),
            asunto=asunto,
            documentos=docs_label,
            estado="ok" if r["ok"] else "error",
            mensaje=r.get("mensaje"),
            enviado_por=str(enviado_por) if enviado_por else None,
        )

    ok_count = sum(1 for r in results if r["ok"])
    try:
        email_service.cleanup_batch(batch_id)
    except OSError:
        pass

    return jsonify({
        "ok": ok_count == len(results),
        "enviados": ok_count,
        "total": len(results),
        "results": results,
        "ts": datetime.now().isoformat(timespec="seconds"),
    })


@api_bp.route("/cleanup", methods=["POST"])
@login_required
def cleanup():
    data = request.get_json(silent=True) or {}
    batch_id = (data.get("batch_id") or "").strip()
    if batch_id:
        try:
            email_service.cleanup_batch(batch_id)
        except OSError:
            pass
    return jsonify({"ok": True})


@api_bp.route("/historial")
@login_required
def historial():
    return jsonify({"items": email_log_model.recientes(25)})
