"""Capa de acceso a base de datos para ORION.

Usamos PyMySQL puro Python para evitar dependencias compiladas.
Implementamos un pequenio pool por hilo para mantenerlo simple.
"""
from __future__ import annotations

import logging
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterable, Sequence

import pymysql
from pymysql.cursors import DictCursor

from config import config

log = logging.getLogger("orion.db")

_local = threading.local()


def _connection_kwargs(database: str | None) -> dict[str, Any]:
    return dict(
        host=config.DB_HOST,
        port=config.DB_PORT,
        user=config.DB_USER,
        password=config.DB_PASSWORD,
        database=database,
        charset="utf8mb4",
        autocommit=True,
        cursorclass=DictCursor,
    )


def init_database() -> None:
    """Asegura que la base de datos exista."""
    conn = pymysql.connect(**_connection_kwargs(database=None))
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"CREATE DATABASE IF NOT EXISTS `{config.DB_NAME}` "
                "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
        log.info("Base de datos '%s' lista", config.DB_NAME)
    finally:
        conn.close()


def ensure_schema() -> None:
    """Aplica el DDL definido en schema.sql y migraciones suaves."""
    schema_path = Path(__file__).resolve().parent / "schema.sql"
    sql_text = schema_path.read_text(encoding="utf-8")
    statements = [s.strip() for s in sql_text.split(";") if s.strip()]
    with get_connection() as conn:
        with conn.cursor() as cur:
            for stmt in statements:
                cur.execute(stmt)
    log.info("Esquema verificado / aplicado (%d sentencias)", len(statements))
    _apply_soft_migrations()


def _column_exists(table: str, column: str) -> bool:
    row = fetch_one(
        "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE table_schema=DATABASE() AND table_name=%s AND column_name=%s",
        (table, column),
    )
    return row is not None


def _apply_soft_migrations() -> None:
    """Migraciones idempotentes para BD que ya estaban creadas."""
    migrations = [
        ("base_datos", "origen",
         "ALTER TABLE base_datos ADD COLUMN origen VARCHAR(20) NOT NULL DEFAULT 'excel'"),
        ("base_datos", "creado_en",
         "ALTER TABLE base_datos ADD COLUMN creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"),
        ("merma_frio", "origen",
         "ALTER TABLE merma_frio ADD COLUMN origen VARCHAR(20) NOT NULL DEFAULT 'excel'"),
        ("merma_frio", "creado_en",
         "ALTER TABLE merma_frio ADD COLUMN creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"),
        ("paradas_std", "observaciones",
         "ALTER TABLE paradas_std ADD COLUMN observaciones VARCHAR(255) NULL"),
        ("paradas_std", "origen",
         "ALTER TABLE paradas_std ADD COLUMN origen VARCHAR(20) NOT NULL DEFAULT 'excel'"),
        ("paradas_std", "creado_en",
         "ALTER TABLE paradas_std ADD COLUMN creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"),
        ("paradas_std", "extras",
         "ALTER TABLE paradas_std ADD COLUMN extras JSON NULL"),
        ("users", "must_change_password",
         "ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 1"),
    ]
    applied = 0
    for table, column, ddl in migrations:
        if not _column_exists(table, column):
            execute(ddl)
            applied += 1
            log.info("Migracion: %s.%s agregada", table, column)
    if applied:
        log.info("Migraciones suaves aplicadas: %d", applied)


def _get_thread_connection() -> pymysql.Connection:
    conn: pymysql.Connection | None = getattr(_local, "conn", None)
    if conn is None:
        conn = pymysql.connect(**_connection_kwargs(database=config.DB_NAME))
        _local.conn = conn
    else:
        try:
            conn.ping(reconnect=True)
        except Exception:  # noqa: BLE001
            try:
                conn.close()
            except Exception:  # noqa: BLE001
                pass
            conn = pymysql.connect(**_connection_kwargs(database=config.DB_NAME))
            _local.conn = conn
    return conn


@contextmanager
def get_connection():
    """Context manager que entrega una conexion ya en la base de datos."""
    conn = _get_thread_connection()
    try:
        yield conn
    except Exception:
        try:
            conn.rollback()
        except Exception:  # noqa: BLE001
            pass
        raise


def fetch_all(sql: str, params: Sequence[Any] | None = None) -> list[dict[str, Any]]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            return list(cur.fetchall())


def fetch_one(sql: str, params: Sequence[Any] | None = None) -> dict[str, Any] | None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            row = cur.fetchone()
            return row


def execute(sql: str, params: Sequence[Any] | None = None) -> int:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            return cur.rowcount


def executemany(sql: str, rows: Iterable[Sequence[Any]]) -> int:
    rows = list(rows)
    if not rows:
        return 0
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, rows)
            return cur.rowcount


class _DBProxy:
    """Pequenio facade publico."""

    fetch_all = staticmethod(fetch_all)
    fetch_one = staticmethod(fetch_one)
    execute = staticmethod(execute)
    executemany = staticmethod(executemany)
    init_database = staticmethod(init_database)
    ensure_schema = staticmethod(ensure_schema)
    get_connection = staticmethod(get_connection)


db = _DBProxy()
