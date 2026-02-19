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
```

## Tests

```bash
uv run pytest
```
