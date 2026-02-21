"""
Family Health Platform — Windows 一键启动器
============================================
功能：
  1. 自动检测 uv / Node.js，若缺失则自动下载安装
  2. 安装后端 & 前端依赖
  3. 并行启动 backend + frontend
  4. 等前端就绪后自动打开浏览器
  5. 提供一个简易 GUI 控制台，点 ✕ 或「停止」按钮可一键关闭所有子进程

打包方法：
  pip install pyinstaller
  pyinstaller --onefile --noconsole --icon=docs/assets/fhp-logo.ico --name FamilyHealth launcher.py
"""

from __future__ import annotations

import os
import subprocess
import sys
import threading
import time
import webbrowser
import zipfile
from io import BytesIO
from pathlib import Path
from shutil import which
from urllib.request import urlopen

# ---------------------------------------------------------------------------
# 路径定位 — 兼容源码执行 & PyInstaller 打包
# ---------------------------------------------------------------------------

def _root_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


ROOT = _root_dir()
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"

UV_INSTALL_URL = "https://astral.sh/uv/install.ps1"
NODE_ZIP_URL = "https://nodejs.org/dist/v22.15.0/node-v22.15.0-win-x64.zip"
LOCAL_TOOLS = ROOT / ".tools"

FRONTEND_URL = "http://localhost:5173"

# ---------------------------------------------------------------------------
# 日志
# ---------------------------------------------------------------------------

_log_lines: list[str] = []
_log_lock = threading.Lock()
_log_callback: callable | None = None  # type: ignore[type-arg]


def log(msg: str) -> None:
    with _log_lock:
        _log_lines.append(msg)
    if _log_callback:
        _log_callback(msg)
    else:
        print(msg, flush=True)

# ---------------------------------------------------------------------------
# 工具检测 & 安装
# ---------------------------------------------------------------------------

def _env_with_tools() -> dict[str, str]:
    env = os.environ.copy()
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    tools_bin = str(LOCAL_TOOLS / "bin")
    tools_node = ""
    for d in LOCAL_TOOLS.iterdir() if LOCAL_TOOLS.exists() else []:
        if d.is_dir() and d.name.startswith("node-"):
            tools_node = str(d)
            break
    extra = os.pathsep.join(filter(None, [tools_bin, tools_node]))
    if extra:
        env["PATH"] = extra + os.pathsep + env.get("PATH", "")
    return env


_WIN = sys.platform == "win32"
_WIN_EXTS = (".cmd", ".bat", ".exe") if _WIN else ()
_SP_FLAGS: dict[str, int] = (
    {"creationflags": subprocess.CREATE_NO_WINDOW} if _WIN else {}
)


def _which(name: str, env: dict[str, str] | None = None) -> str | None:
    exts = (*_WIN_EXTS, "") if _WIN else ("", ".exe", ".cmd", ".bat")
    if env:
        for p in env.get("PATH", "").split(os.pathsep):
            for ext in exts:
                fp = Path(p) / (name + ext)
                if fp.is_file():
                    return str(fp)
    return which(name)


def _ensure_uv(env: dict[str, str]) -> dict[str, str]:
    if _which("uv", env):
        log("[OK] uv 已就绪")
        return env
    log("[INSTALL] 正在安装 uv …")
    try:
        subprocess.check_call(
            ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
             f"irm {UV_INSTALL_URL} | iex"],
            env=env, **_SP_FLAGS,
        )
    except Exception as exc:
        log(f"[WARN] PowerShell 安装 uv 失败 ({exc})，尝试 pip 安装…")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "uv"], env=env, **_SP_FLAGS)
    env = _env_with_tools()
    if _which("uv", env):
        log("[OK] uv 安装成功")
    else:
        raise RuntimeError("uv 安装失败，请手动安装: https://docs.astral.sh/uv/")
    return env


def _ensure_node(env: dict[str, str]) -> dict[str, str]:
    if _which("node", env) and _which("npm", env):
        log("[OK] Node.js & npm 已就绪")
        return env
    log("[INSTALL] 正在下载 Node.js 便携版 …")
    LOCAL_TOOLS.mkdir(parents=True, exist_ok=True)
    data = urlopen(NODE_ZIP_URL).read()
    with zipfile.ZipFile(BytesIO(data)) as zf:
        zf.extractall(LOCAL_TOOLS)
    env = _env_with_tools()
    if _which("node", env) and _which("npm", env):
        log("[OK] Node.js 安装成功")
    else:
        raise RuntimeError("Node.js 安装失败，请手动安装: https://nodejs.org/")
    return env

# ---------------------------------------------------------------------------
# 启动逻辑
# ---------------------------------------------------------------------------

_procs: list[subprocess.Popen] = []


def _stream_output(proc: subprocess.Popen, label: str) -> None:
    assert proc.stdout
    for raw in iter(proc.stdout.readline, b""):
        line = raw.decode("utf-8", errors="replace").rstrip()
        log(f"[{label}] {line}")
    proc.stdout.close()


def _wait_for_frontend(timeout: int = 60) -> bool:
    import urllib.request
    import urllib.error
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(FRONTEND_URL, timeout=2)
            return True
        except Exception:
            time.sleep(1)
    return False


def launch(lan: bool = False) -> None:
    global _procs
    env = _env_with_tools()
    env = _ensure_uv(env)
    env = _ensure_node(env)

    uv = _which("uv", env)
    npm = _which("npm", env)

    log(f"[INFO] uv  → {uv}")
    log(f"[INFO] npm → {npm}")

    if (BACKEND / ".venv").exists():
        log("[OK] 后端虚拟环境已存在，跳过创建")
    else:
        log("[STEP] 初始化后端虚拟环境…")
        subprocess.check_call([uv, "venv"], cwd=str(BACKEND), env=env, **_SP_FLAGS)
    log("[STEP] 安装/同步后端依赖…")
    subprocess.check_call([uv, "sync"], cwd=str(BACKEND), env=env, **_SP_FLAGS)

    if not (FRONTEND / "node_modules").exists():
        log("[STEP] 安装前端依赖…")
        subprocess.check_call([npm, "install"], cwd=str(FRONTEND), env=env, **_SP_FLAGS)

    log("[STEP] 启动后端…")
    be = subprocess.Popen(
        [uv, "run", "python", "-m", "app"],
        cwd=str(BACKEND), env=env,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        **_SP_FLAGS,
    )
    _procs.append(be)
    threading.Thread(target=_stream_output, args=(be, "Backend"), daemon=True).start()

    fe_cmd = [npm, "run", "dev:lan"] if lan else [npm, "run", "dev"]
    log(f"[STEP] 启动前端 ({'LAN' if lan else 'localhost'})…")
    fe = subprocess.Popen(
        fe_cmd,
        cwd=str(FRONTEND), env=env,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        **_SP_FLAGS,
    )
    _procs.append(fe)
    threading.Thread(target=_stream_output, args=(fe, "Frontend"), daemon=True).start()

    log("[WAIT] 等待前端服务就绪…")
    if _wait_for_frontend():
        log(f"[OK] 前端已就绪，正在打开浏览器 → {FRONTEND_URL}")
        webbrowser.open(FRONTEND_URL)
    else:
        log("[WARN] 前端启动超时，请手动打开浏览器访问 " + FRONTEND_URL)


def shutdown() -> None:
    log("[INFO] 正在关闭所有服务…")
    for p in _procs:
        if p.poll() is None:
            p.terminate()
    for p in _procs:
        try:
            p.wait(timeout=5)
        except subprocess.TimeoutExpired:
            p.kill()
    _procs.clear()
    log("[INFO] 已全部关闭")

# ---------------------------------------------------------------------------
# GUI（tkinter — Python 自带，无需额外安装）
# ---------------------------------------------------------------------------

def _run_gui() -> None:
    import tkinter as tk
    from tkinter import scrolledtext

    win = tk.Tk()
    win.title("Family Health Platform Launcher")
    win.geometry("820x520")
    win.configure(bg="#1e1e2e")

    txt = scrolledtext.ScrolledText(
        win, wrap=tk.WORD, font=("Consolas", 10),
        bg="#1e1e2e", fg="#cdd6f4", insertbackground="#cdd6f4",
        state=tk.DISABLED, relief=tk.FLAT, padx=8, pady=8,
    )
    txt.pack(fill=tk.BOTH, expand=True, padx=6, pady=(6, 0))

    tag_colors = {
        "[OK]": "#a6e3a1", "[STEP]": "#89b4fa", "[INSTALL]": "#f9e2af",
        "[WARN]": "#fab387", "[ERROR]": "#f38ba8",
        "[Backend]": "#cba6f7", "[Frontend]": "#94e2d5",
    }
    for tag, color in tag_colors.items():
        txt.tag_configure(tag, foreground=color)

    def append(msg: str) -> None:
        txt.configure(state=tk.NORMAL)
        tag = None
        for t in tag_colors:
            if msg.startswith(t):
                tag = t
                break
        txt.insert(tk.END, msg + "\n", tag)
        txt.see(tk.END)
        txt.configure(state=tk.DISABLED)

    def gui_log(msg: str) -> None:
        win.after(0, append, msg)

    global _log_callback
    _log_callback = gui_log

    btn_frame = tk.Frame(win, bg="#1e1e2e")
    btn_frame.pack(fill=tk.X, padx=6, pady=6)

    lan_var = tk.BooleanVar(value=False)
    tk.Checkbutton(
        btn_frame, text="LAN 模式（内网可访问）", variable=lan_var,
        bg="#1e1e2e", fg="#cdd6f4", selectcolor="#313244",
        activebackground="#1e1e2e", activeforeground="#cdd6f4",
        font=("Microsoft YaHei UI", 9),
    ).pack(side=tk.LEFT, padx=(0, 12))

    started = threading.Event()

    def on_start() -> None:
        if started.is_set():
            return
        started.set()
        start_btn.configure(state=tk.DISABLED)
        stop_btn.configure(state=tk.NORMAL)

        def worker() -> None:
            try:
                launch(lan=lan_var.get())
            except Exception as exc:
                gui_log(f"[ERROR] {exc}")

        threading.Thread(target=worker, daemon=True).start()

    def on_stop() -> None:
        shutdown()
        start_btn.configure(state=tk.NORMAL)
        stop_btn.configure(state=tk.DISABLED)
        started.clear()

    start_btn = tk.Button(
        btn_frame, text="▶ 启动", command=on_start,
        bg="#a6e3a1", fg="#1e1e2e", font=("Microsoft YaHei UI", 10, "bold"),
        relief=tk.FLAT, padx=16, pady=4,
    )
    start_btn.pack(side=tk.LEFT, padx=4)

    stop_btn = tk.Button(
        btn_frame, text="■ 停止", command=on_stop, state=tk.DISABLED,
        bg="#f38ba8", fg="#1e1e2e", font=("Microsoft YaHei UI", 10, "bold"),
        relief=tk.FLAT, padx=16, pady=4,
    )
    stop_btn.pack(side=tk.LEFT, padx=4)

    def on_close() -> None:
        shutdown()
        win.destroy()

    win.protocol("WM_DELETE_WINDOW", on_close)
    win.mainloop()

# ---------------------------------------------------------------------------
# 命令行入口
# ---------------------------------------------------------------------------

def main() -> int:
    if "--nogui" in sys.argv:
        try:
            launch(lan="--lan" in sys.argv)
            log("按 Ctrl+C 停止所有服务…")
            while any(p.poll() is None for p in _procs):
                time.sleep(1)
        except KeyboardInterrupt:
            shutdown()
        return 0
    _run_gui()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
