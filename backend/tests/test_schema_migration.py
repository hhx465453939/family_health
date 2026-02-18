from sqlalchemy import create_engine

from app.core.schema_migration import run_startup_migrations


def test_startup_migration_adds_user_id_to_knowledge_bases(tmp_path):
    db_file = tmp_path / "migration.sqlite3"
    db_url = f"sqlite:///{db_file.as_posix()}"
    engine = create_engine(db_url, future=True)

    with engine.begin() as conn:
        conn.exec_driver_sql(
            """
            CREATE TABLE knowledge_bases (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(100),
                status VARCHAR(20),
                updated_at DATETIME
            )
            """
        )

    run_startup_migrations(engine, db_url)

    with engine.begin() as conn:
        cols = conn.exec_driver_sql("PRAGMA table_info(knowledge_bases)").all()
        names = {row[1] for row in cols}
        assert "user_id" in names
        assert "retrieval_strategy" in names
        assert "keyword_weight" in names


def test_startup_migration_adds_user_id_to_desensitization_tables(tmp_path):
    db_file = tmp_path / "migration_desensitize.sqlite3"
    db_url = f"sqlite:///{db_file.as_posix()}"
    engine = create_engine(db_url, future=True)

    with engine.begin() as conn:
        conn.exec_driver_sql(
            """
            CREATE TABLE desensitization_rules (
                id VARCHAR(36) PRIMARY KEY,
                member_scope VARCHAR(36),
                rule_type VARCHAR(20),
                pattern VARCHAR(500),
                replacement_token VARCHAR(100),
                enabled BOOLEAN,
                updated_at DATETIME
            )
            """
        )
        conn.exec_driver_sql(
            """
            CREATE TABLE pii_mapping_vault (
                id VARCHAR(36) PRIMARY KEY,
                mapping_key VARCHAR(36),
                original_value_encrypted TEXT,
                replacement_token VARCHAR(100),
                hash_fingerprint VARCHAR(64),
                created_at DATETIME
            )
            """
        )

    run_startup_migrations(engine, db_url)

    with engine.begin() as conn:
        rule_cols = conn.exec_driver_sql("PRAGMA table_info(desensitization_rules)").all()
        pii_cols = conn.exec_driver_sql("PRAGMA table_info(pii_mapping_vault)").all()
        assert "user_id" in {row[1] for row in rule_cols}
        assert "user_id" in {row[1] for row in pii_cols}
