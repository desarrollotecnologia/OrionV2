"""Historial de envios del bot de correo."""
from __future__ import annotations

from database import db


def registrar(
    destinatario: str,
    cliente: str | None,
    asunto: str,
    documentos: str | None,
    estado: str,
    mensaje: str | None,
    enviado_por: str | None,
) -> None:
    db.execute(
        "INSERT INTO email_log "
        "(destinatario, cliente, asunto, documentos, estado, mensaje, enviado_por) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (destinatario, cliente, asunto, documentos, estado, mensaje, enviado_por),
    )


def recientes(limit: int = 20) -> list[dict]:
    return db.fetch_all(
        "SELECT id, destinatario, cliente, asunto, documentos, estado, mensaje, "
        "enviado_por, enviado_en "
        "FROM email_log ORDER BY enviado_en DESC LIMIT %s",
        (limit,),
    )
