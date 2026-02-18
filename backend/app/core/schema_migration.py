from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy.engine import Engine


_SQLITE_USER_SCOPED_COLUMNS: dict[str, tuple[str, ...]] = {
    "model_providers": ("user_id",),
    "llm_runtime_profiles": ("user_id",),
    "mcp_servers": ("user_id",),
    "agent_mcp_bindings": ("user_id",),
}


def _existing_columns(conn, table_name: str) -> set[str]:
    rows = conn.exec_driver_sql(f"PRAGMA table_info({table_name})").all()
    return {row[1] for row in rows}


def _add_missing_columns(conn, table_name: str, missing_columns: Iterable[str]) -> None:
    for column_name in missing_columns:
        conn.exec_driver_sql(
            f"ALTER TABLE {table_name} ADD COLUMN {column_name} VARCHAR(36)"
        )
        conn.exec_driver_sql(
            f"CREATE INDEX IF NOT EXISTS idx_{table_name}_{column_name} ON {table_name} ({column_name})"
        )


def run_startup_migrations(engine: Engine, db_url: str) -> None:
    if not db_url.startswith("sqlite"):
        return

    with engine.begin() as conn:
        for table_name, required_columns in _SQLITE_USER_SCOPED_COLUMNS.items():
            existing = _existing_columns(conn, table_name)
            if not existing:
                continue
            missing = [column for column in required_columns if column not in existing]
            if missing:
                _add_missing_columns(conn, table_name, missing)
