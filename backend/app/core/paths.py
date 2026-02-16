from __future__ import annotations

from pathlib import Path

from app.core.config import settings


def _ensure(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def data_root() -> Path:
    return _ensure(Path(settings.data_root).resolve())


def raw_vault_root() -> Path:
    return _ensure(data_root() / settings.raw_vault_dir)


def sanitized_workspace_root() -> Path:
    return _ensure(data_root() / settings.sanitized_workspace_dir)
