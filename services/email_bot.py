"""Envio de correos con adjuntos PDF para clientes."""
from __future__ import annotations

import logging
import smtplib
import ssl
import uuid
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from pathlib import Path

from config import config

log = logging.getLogger("orion.email_bot")

DOCUMENT_TYPES = {
    "retoma": "Retoma",
    "destinos": "Destinos",
    "rendimiento": "Rendimiento",
    "cargue": "Cargue",
}


def smtp_configured() -> bool:
    return bool(config.SMTP_HOST and config.SMTP_FROM and config.SMTP_USER)


def _ssl_context() -> ssl.SSLContext:
    if config.SMTP_SSL_VERIFY:
        return ssl.create_default_context()
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def _format_from() -> str:
    if config.SMTP_FROM_NAME:
        return formataddr((config.SMTP_FROM_NAME, config.SMTP_FROM))
    return config.SMTP_FROM


def _connect_smtp() -> smtplib.SMTP:
    timeout = config.SMTP_TIMEOUT
    context = _ssl_context()
    if config.SMTP_USE_SSL:
        server = smtplib.SMTP_SSL(
            config.SMTP_HOST,
            config.SMTP_PORT,
            timeout=timeout,
            context=context,
        )
    else:
        server = smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=timeout)
        if config.SMTP_USE_TLS:
            server.starttls(context=context)
    if config.SMTP_USER:
        server.login(config.SMTP_USER, config.SMTP_PASSWORD)
    return server


def ensure_upload_dir() -> Path:
    path = config.EMAIL_UPLOAD_DIR
    path.mkdir(parents=True, exist_ok=True)
    return path


def new_batch_id() -> str:
    return uuid.uuid4().hex


def batch_dir(batch_id: str) -> Path:
    safe = "".join(c for c in batch_id if c.isalnum())
    return ensure_upload_dir() / safe


def save_upload(batch_id: str, doc_type: str, filename: str, data: bytes) -> dict:
    if doc_type not in DOCUMENT_TYPES:
        raise ValueError(f"Tipo de documento invalido: {doc_type}")
    if not filename.lower().endswith(".pdf"):
        raise ValueError("Solo se permiten archivos PDF")
    if len(data) > 15 * 1024 * 1024:
        raise ValueError("El archivo supera el limite de 15 MB")

    folder = batch_dir(batch_id)
    folder.mkdir(parents=True, exist_ok=True)
    dest = folder / f"{doc_type}.pdf"
    dest.write_bytes(data)

    return {
        "doc_type": doc_type,
        "label": DOCUMENT_TYPES[doc_type],
        "filename": filename,
        "stored_as": dest.name,
        "size_bytes": len(data),
    }


def list_uploads(batch_id: str) -> list[dict]:
    folder = batch_dir(batch_id)
    if not folder.exists():
        return []
    out = []
    for doc_type, label in DOCUMENT_TYPES.items():
        path = folder / f"{doc_type}.pdf"
        if path.exists():
            out.append({
                "doc_type": doc_type,
                "label": label,
                "filename": path.name,
                "size_bytes": path.stat().st_size,
            })
    return out


def build_preview(
    destinatarios: list[dict],
    asunto: str,
    cuerpo: str,
    documentos: list[str],
    uploads: list[dict],
) -> dict:
    docs_by_type = {u["doc_type"]: u for u in uploads}
    adjuntos = []
    faltantes = []
    for doc_type in documentos:
        if doc_type in docs_by_type:
            adjuntos.append(docs_by_type[doc_type])
        else:
            faltantes.append(DOCUMENT_TYPES.get(doc_type, doc_type))

    return {
        "destinatarios": destinatarios,
        "asunto": asunto,
        "cuerpo": cuerpo,
        "adjuntos": adjuntos,
        "faltantes": faltantes,
        "smtp_ok": smtp_configured(),
        "total_destinatarios": len(destinatarios),
        "total_adjuntos": len(adjuntos),
    }


def _read_attachments(batch_id: str, documentos: list[str]) -> list[tuple[str, bytes]]:
    folder = batch_dir(batch_id)
    files: list[tuple[str, bytes]] = []
    for doc_type in documentos:
        path = folder / f"{doc_type}.pdf"
        if not path.exists():
            raise FileNotFoundError(
                f"Falta el PDF de {DOCUMENT_TYPES.get(doc_type, doc_type)}"
            )
        label = DOCUMENT_TYPES.get(doc_type, doc_type)
        files.append((f"{label}.pdf", path.read_bytes()))
    return files


def send_message(
    to_email: str,
    subject: str,
    body: str,
    attachments: list[tuple[str, bytes]],
) -> None:
    if not smtp_configured():
        raise RuntimeError(
            "SMTP no configurado. Revisa MAIL_SERVER, MAIL_FROM y MAIL_USERNAME en .env"
        )

    msg = MIMEMultipart()
    msg["From"] = _format_from()
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain", "utf-8"))

    for filename, data in attachments:
        part = MIMEApplication(data, _subtype="pdf")
        part.add_header("Content-Disposition", "attachment", filename=filename)
        msg.attach(part)

    with _connect_smtp() as server:
        server.sendmail(config.SMTP_FROM, [to_email], msg.as_string())

    log.info("Correo enviado a %s (%d adjuntos)", to_email, len(attachments))


def send_batch(
    batch_id: str,
    destinatarios: list[dict],
    asunto: str,
    cuerpo: str,
    documentos: list[str],
) -> list[dict]:
    attachments = _read_attachments(batch_id, documentos)
    results = []
    for dest in destinatarios:
        email = dest["email"]
        cliente = dest.get("cliente")
        try:
            send_message(email, asunto, cuerpo, attachments)
            results.append({
                "email": email,
                "cliente": cliente,
                "ok": True,
                "mensaje": "Enviado",
            })
        except Exception as exc:  # noqa: BLE001
            log.exception("Error enviando a %s", email)
            results.append({
                "email": email,
                "cliente": cliente,
                "ok": False,
                "mensaje": str(exc),
            })
    return results


def read_upload_bytes(batch_id: str, doc_type: str) -> tuple[bytes, str] | None:
    """Lee un PDF subido; retorna (bytes, filename) o None."""
    if doc_type not in DOCUMENT_TYPES:
        return None
    path = batch_dir(batch_id) / f"{doc_type}.pdf"
    if not path.exists():
        return None
    label = DOCUMENT_TYPES[doc_type]
    return path.read_bytes(), f"{label}.pdf"


def remove_upload(batch_id: str, doc_type: str) -> None:
    if doc_type not in DOCUMENT_TYPES:
        raise ValueError(f"Tipo de documento invalido: {doc_type}")
    path = batch_dir(batch_id) / f"{doc_type}.pdf"
    if path.exists():
        path.unlink()


def cleanup_batch(batch_id: str) -> None:
    folder = batch_dir(batch_id)
    if folder.exists():
        for f in folder.glob("*"):
            f.unlink(missing_ok=True)
        folder.rmdir()
