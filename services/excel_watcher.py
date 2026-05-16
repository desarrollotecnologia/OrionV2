"""Vigia el archivo ORION.xlsx y dispara una resincronizacion en vivo."""
from __future__ import annotations

import logging
import threading
import time
from pathlib import Path
from typing import Callable

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from config import config
from models import sync_log
from services.excel_importer import import_all

log = logging.getLogger("orion.watcher")


class _DebouncedHandler(FileSystemEventHandler):
    def __init__(self, target: Path, on_change: Callable[[dict], None]):
        super().__init__()
        self.target_name = target.name.lower()
        self.on_change = on_change
        self._lock = threading.Lock()
        self._pending: threading.Timer | None = None

    def _matches(self, path: str) -> bool:
        try:
            return Path(path).name.lower() == self.target_name
        except Exception:  # noqa: BLE001
            return False

    def _trigger(self):
        with self._lock:
            self._pending = None
        log.info("Detectado cambio en %s. Sincronizando...", self.target_name)
        started = time.perf_counter()
        try:
            summary = import_all()
            duracion = round(time.perf_counter() - started, 3)
            sync_log.add(
                "ok" if summary.get("ok") else "warn",
                summary.get("archivo", ""),
                f"hojas={summary.get('hojas')}",
                duracion,
            )
            self.on_change(summary)
        except Exception as exc:  # noqa: BLE001
            log.exception("Fallo en sincronizacion automatica")
            sync_log.add("error", str(config.EXCEL_PATH), str(exc))
            self.on_change({"ok": False, "error": str(exc)})

    def _schedule(self):
        with self._lock:
            if self._pending is not None:
                self._pending.cancel()
            self._pending = threading.Timer(config.WATCHER_DEBOUNCE_SEC, self._trigger)
            self._pending.daemon = True
            self._pending.start()

    def on_modified(self, event):
        if not event.is_directory and self._matches(event.src_path):
            self._schedule()

    def on_created(self, event):
        if not event.is_directory and self._matches(event.src_path):
            self._schedule()

    def on_moved(self, event):
        if not event.is_directory and self._matches(event.dest_path):
            self._schedule()


class ExcelWatcher:
    """Encapsula el observer de watchdog."""

    def __init__(self, on_change: Callable[[dict], None]):
        self.on_change = on_change
        self.observer: Observer | None = None
        self.handler: _DebouncedHandler | None = None

    def start(self):
        path = config.EXCEL_PATH
        if not path.exists():
            log.warning(
                "No se inicia watcher: archivo no encontrado en %s. "
                "Crealo o ajusta EXCEL_PATH en .env.",
                path,
            )
            return
        self.handler = _DebouncedHandler(path, self.on_change)
        self.observer = Observer()
        self.observer.schedule(self.handler, str(path.parent), recursive=False)
        self.observer.daemon = True
        self.observer.start()
        log.info("Watcher activo sobre %s", path)

    def stop(self):
        if self.observer is not None:
            self.observer.stop()
            self.observer.join(timeout=2)
            self.observer = None
