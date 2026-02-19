from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy.engine import Engine


_SQLITE_COMPAT_COLUMNS: dict[str, dict[str, str]] = {
    "model_providers": {"user_id": "VARCHAR(36)"},
    "llm_runtime_profiles": {"user_id": "VARCHAR(36)"},
    "mcp_servers": {"user_id": "VARCHAR(36)"},
    "agent_mcp_bindings": {"user_id": "VARCHAR(36)"},
    "desensitization_rules": {"user_id": "VARCHAR(36)", "tag": "VARCHAR(40)"},
    "pii_mapping_vault": {
        "user_id": "VARCHAR(36)",
        "source_type": "VARCHAR(60)",
        "source_id": "VARCHAR(64)",
        "source_path": "TEXT",
    },
    "knowledge_bases": {
        "user_id": "VARCHAR(36)",
        "semantic_model_id": "VARCHAR(36)",
        "use_global_defaults": "BOOLEAN",
        "retrieval_strategy": "VARCHAR(20)",
        "keyword_weight": "FLOAT",
        "semantic_weight": "FLOAT",
        "rerank_weight": "FLOAT",
        "strategy_params_json": "TEXT",
    },
    "chat_sessions": {
        "role_id": "VARCHAR(120)",
        "background_prompt": "TEXT",
        "reasoning_enabled": "BOOLEAN",
        "reasoning_budget": "INTEGER",
        "show_reasoning": "BOOLEAN",
        "context_message_limit": "INTEGER",
    },
    "chat_attachments": {
        "content_type": "VARCHAR(120)",
        "is_image": "BOOLEAN",
    },
    "chat_messages": {
        "reasoning_content": "TEXT",
    },
}


def _existing_columns(conn, table_name: str) -> set[str]:
    rows = conn.exec_driver_sql(f"PRAGMA table_info({table_name})").all()
    return {row[1] for row in rows}


def _add_missing_columns(
    conn,
    table_name: str,
    missing_columns: Iterable[str],
    column_types: dict[str, str],
) -> None:
    for column_name in missing_columns:
        column_type = column_types[column_name]
        conn.exec_driver_sql(
            f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"
        )
        if table_name == "chat_sessions" and column_name == "show_reasoning":
            conn.exec_driver_sql("UPDATE chat_sessions SET show_reasoning = 1 WHERE show_reasoning IS NULL")
        if table_name == "chat_sessions" and column_name == "context_message_limit":
            conn.exec_driver_sql(
                "UPDATE chat_sessions SET context_message_limit = 20 WHERE context_message_limit IS NULL"
            )
        if table_name == "chat_attachments" and column_name == "is_image":
            conn.exec_driver_sql(
                "UPDATE chat_attachments SET is_image = 0 WHERE is_image IS NULL"
            )
        if table_name == "knowledge_bases" and column_name == "use_global_defaults":
            conn.exec_driver_sql(
                "UPDATE knowledge_bases SET use_global_defaults = 1 WHERE use_global_defaults IS NULL"
            )
        if table_name == "knowledge_bases" and column_name == "retrieval_strategy":
            conn.exec_driver_sql(
                "UPDATE knowledge_bases SET retrieval_strategy = 'hybrid' WHERE retrieval_strategy IS NULL"
            )
        if table_name == "knowledge_bases" and column_name == "keyword_weight":
            conn.exec_driver_sql(
                "UPDATE knowledge_bases SET keyword_weight = 0.5 WHERE keyword_weight IS NULL"
            )
        if table_name == "knowledge_bases" and column_name == "semantic_weight":
            conn.exec_driver_sql(
                "UPDATE knowledge_bases SET semantic_weight = 0.5 WHERE semantic_weight IS NULL"
            )
        if table_name == "knowledge_bases" and column_name == "rerank_weight":
            conn.exec_driver_sql(
                "UPDATE knowledge_bases SET rerank_weight = 0 WHERE rerank_weight IS NULL"
            )
        if column_name.endswith("_id") or column_name == "user_id":
            conn.exec_driver_sql(
                f"CREATE INDEX IF NOT EXISTS idx_{table_name}_{column_name} ON {table_name} ({column_name})"
            )


def run_startup_migrations(engine: Engine, db_url: str) -> None:
    if not db_url.startswith("sqlite"):
        return

    with engine.begin() as conn:
        for table_name, column_types in _SQLITE_COMPAT_COLUMNS.items():
            existing = _existing_columns(conn, table_name)
            if not existing:
                continue
            missing = [column for column in column_types if column not in existing]
            if missing:
                _add_missing_columns(conn, table_name, missing, column_types)
