#!/usr/bin/env python3
from __future__ import annotations

import os
import signal
import subprocess
import sys
from pathlib import Path
from shutil import which


def _print(msg: str) -> None:
    sys.stdout.write(msg + "\n")


def _require_tool(name: str, install_hint: str) -> None:
    if which(name):
        return
    _print(f"[ERROR] Missing required tool: {name}")
    _print(install_hint)
    sys.exit(1)


def _run(cmd: list[str], cwd: Path) -> None:
    _print(f"[RUN] {' '.join(cmd)} (cwd={cwd})")
    subprocess.check_call(cmd, cwd=str(cwd))


def _load_env(root: Path) -> dict[str, str]:
    env_path = root / ".env"
    env = {}
    if not env_path.exists():
        return env
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip()
    return env


def main() -> int:
    root = Path(__file__).resolve().parent
    backend = root / "backend"
    frontend = root / "frontend"

    _require_tool(
        "uv",
        "Install uv first. Example (Ubuntu):\n  sudo snap install astral-uv\n",
    )
    _require_tool(
        "npm",
        "Install Node.js and npm first. Example (Ubuntu):\n  sudo apt-get install -y nodejs npm\n",
    )

    _print("[INFO] Preparing backend environment...")
    _run(["uv", "venv"], backend)
    _run(["uv", "sync"], backend)

    _print("[INFO] Preparing frontend environment...")
    if not (frontend / "node_modules").exists():
        _run(["npm", "install"], frontend)

    env = os.environ.copy()
    env.update(_load_env(root))

    use_lan = "--lan" in sys.argv
    frontend_cmd = ["npm", "run", "dev:lan"] if use_lan else ["npm", "run", "dev"]
    backend_cmd = ["uv", "run", "python", "-m", "app"]

    _print("[INFO] Starting backend and frontend...")
    backend_proc = subprocess.Popen(backend_cmd, cwd=str(backend), env=env)
    frontend_proc = subprocess.Popen(frontend_cmd, cwd=str(frontend), env=env)

    def _shutdown(*_args: object) -> None:
        _print("\n[INFO] Shutting down...")
        for proc in (backend_proc, frontend_proc):
            if proc.poll() is None:
                proc.terminate()
        for proc in (backend_proc, frontend_proc):
            try:
                proc.wait(timeout=8)
            except subprocess.TimeoutExpired:
                proc.kill()

    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    try:
        while True:
            if backend_proc.poll() is not None or frontend_proc.poll() is not None:
                _shutdown()
                return 1
            signal.pause()
    except KeyboardInterrupt:
        _shutdown()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
