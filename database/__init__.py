"""Paquete de base de datos."""
from .db import (
    db,
    get_connection,
    init_database,
    ensure_schema,
    fetch_all,
    fetch_one,
    execute,
)

__all__ = [
    "db",
    "get_connection",
    "init_database",
    "ensure_schema",
    "fetch_all",
    "fetch_one",
    "execute",
]
