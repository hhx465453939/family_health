from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parents[2]
_REPO_ROOT = _BACKEND_DIR.parent


class Settings(BaseSettings):
    app_name: str = "Family Health Backend"
    server_host: str = "127.0.0.1"
    server_port: int = 8000
    db_url: str = "sqlite:///./family_health.db"
    secret_key: str = "change-this-in-production-please-use-32-plus-bytes"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    login_lock_max_attempts: int = 5
    login_lock_minutes: int = 15
    data_root: str = "./data"
    raw_vault_dir: str = "raw_vault"
    sanitized_workspace_dir: str = "sanitized_workspace"
    chat_context_message_limit: int = 12
    mcp_max_parallel_tools: int = 3
    mcp_tool_timeout_ms: int = 8000
    mcp_total_budget_ms: int = 15000
    role_library_dir: str = "./app/roles"

    model_config = SettingsConfigDict(
        env_prefix="FH_",
        env_file=[_BACKEND_DIR / ".env", _REPO_ROOT / ".env"],
        extra="ignore",
    )


settings = Settings()
