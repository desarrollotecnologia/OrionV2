"""Punto comun para emitir eventos en vivo via SocketIO."""
from __future__ import annotations

from typing import Any

_socketio = None


def configure(socketio):
    global _socketio
    _socketio = socketio


def broadcast(event: str, payload: dict[str, Any] | None = None) -> None:
    if _socketio is None:
        return
    _socketio.emit(event, payload or {}, namespace="/live")
