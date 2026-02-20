# Family Health Backend

## Quick Start

```bash
uv venv
uv sync
uv run python -m app
```

## Config

Backend host/port are read from repo root `.env` (see `.env.example`):

```
FH_SERVER_HOST=127.0.0.1
FH_SERVER_PORT=8000
FH_DEFAULT_CHAT_ROLE_ID=私人医疗架构师
```

## Tests

```bash
uv run pytest
```
