# 家庭健康管理助手 — 开发与部署指南

> 目标：**新开发者可按此独立完成环境搭建、本地运行、联调验收与发布前检查**。与 [PRD.md](./PRD.md) 中的系统设计、数据模型及分阶段执行指令保持一致。

---

## 1. 环境要求

| 项目 | 要求 |
|------|------|
| Python | 3.11+，**优先使用 [uv](https://docs.astral.sh/uv/) 管理依赖与虚拟环境**（`uv` > 直接 pip > conda） |
| Node | 18+（前端构建与开发） |
| SQLite | 3.x（随 Python 或系统提供，无需单独安装） |
| 运行场景 | 默认**家庭内网**；生产不默认暴露公网 |

---

## 2. 本地开发环境搭建

### 2.1 克隆与进入项目

```bash
git clone <repo_url>
cd family_health
```

### 2.2 后端

```bash
cd backend
uv venv
uv sync
# 或: uv pip install -r requirements.txt
```

- **统一端口配置（推荐）**：
  - 在仓库根目录 `.env` 配置后端地址，前端代理会自动跟随（可参考 `.env.example`）：
    ```
    FH_SERVER_HOST=127.0.0.1
    FH_SERVER_PORT=8000
    ```
- **启动服务**:
  ```bash
  uv run python -m app
  ```
- 若出现 `Address already in use`，请在根目录 `.env` 中修改 `FH_SERVER_PORT` 后重试。
- **兼容迁移**:
  - 启动时会自动执行 SQLite 轻量兼容迁移（仅补齐缺失列，不清空数据），用于兼容旧数据库结构导致的设置中心/聊天中心/知识库中心 `500` 问题（如 `knowledge_bases.user_id`、知识库策略字段、`desensitization_rules.user_id`、`pii_mapping_vault.user_id`、`chat_sessions.context_message_limit`、`chat_attachments.content_type/is_image` 缺失）。
- **数据目录**（首次运行会自动创建）:
  - `data/raw_vault/` — 未脱敏域
  - `data/sanitized_workspace/` — 脱敏域
- **角色库目录**:
  - `backend/app/roles/*.md`（会在聊天中心新建会话时作为医学角色下拉项自动加载）
- **新建会话默认角色**（可选）:
  - `FH_DEFAULT_CHAT_ROLE_ID=私人医疗架构师`
  - 若未配置，默认使用 `私人医疗架构师`；设为空字符串则表示不默认绑定角色
- **环境变量**（可选）: 本机加密密钥等敏感配置建议通过环境变量注入，不要写进代码或提交到仓库。

### 2.3 前端

```bash
cd frontend
npm install
npm run dev
# 需要局域网其他设备访问时:
# npm run dev:lan
# 或: npm run build && 通过后端静态托管
```

- 开发时前端默认将 `/api` 代理到后端 `http://localhost:8000`（见 `frontend/vite.config.ts`）。
- 若修改了 `.env` 中的 `FH_SERVER_HOST/FH_SERVER_PORT`，前端代理会自动切换到新地址。
- Windows 若遇到 `WinError 10013`（套接字权限错误），请优先保持 `--host 127.0.0.1`；仅在需要内网其他设备访问时再改成 `--host 0.0.0.0`。
- 如果 `npm run dev` 只能本机访问（`localhost:5173`），请改用 `npm run dev:lan`，再通过 `http://<局域网IP>:5173` 访问。

### 2.4 基础验证

- 浏览器访问前端地址，应出现登录/注册页（首次部署也可选 Owner 初始化页）。
- 调用健康检查或登录接口，确认后端与 DB 正常。

后端最小验证（PowerShell 示例）:

```powershell
Invoke-RestMethod -Method GET http://localhost:8000/health
Invoke-RestMethod -Method POST http://localhost:8000/api/v1/auth/bootstrap-owner `
  -ContentType "application/json" `
  -Body '{"username":"owner","password":"owner-pass-123","display_name":"Owner"}'
Invoke-RestMethod -Method POST http://localhost:8000/api/v1/auth/login `
  -ContentType "application/json" `
  -Body '{"username":"owner","password":"owner-pass-123"}'
```

说明：`owner-pass-123` 仅是示例值，系统没有内置默认 Owner 密码。当前默认推荐直接使用注册功能创建用户。

---

## 3. 联调与 Checkfix

### 3.1 全链路联调验收脚本（推荐）

- 脚本: `scripts/acceptance_integration.ps1`
- 覆盖链路: 登录 -> 配置 -> 对话 -> MCP -> KB -> 检索 -> 导出下载

执行示例:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\acceptance_integration.ps1 -SkipFrontendCheck
```

只做流程演练（不发真实请求）:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\acceptance_integration.ps1 -DryRun -SkipFrontendCheck
```

### 3.2 日常 Checkfix 闭环（必选）

| 层级 | 命令 |
|------|------|
| 后端 | `uv sync` -> `uv run ruff check .` -> `uv run ruff format --check .` -> `uv run pytest` |
| 前端 | 依赖变更时 `npm install`；每次变更后 `npm run lint`，可选 `npm run build` |
| 通用 | 若项目内已配置 pre-commit / CI 脚本，优先执行项目既有脚本 |

---

## 4. 打包 .exe（规划）

- **工具**: PyInstaller 或 Nuitka（以 PRD 与项目 `packager/` 为准）。
- **内容**: Python 运行时 + 后端应用 + 前端静态资源；首次运行创建可写目录（如 `data/`）、初始化 SQLite、可选打开浏览器访问配置页。
- **说明**: 具体命令、参数与输出物将在 packager 配置就绪后补充到本节；发布前需执行 PRD 阶段 6「集成验收与发布」并做打包冒烟验证。

---

## 5. 部署与安全注意

- **默认仅内网访问**: 绑定 `0.0.0.0` 时注意仅在内网使用，避免默认暴露公网。
- **敏感配置**: API Key、加密密钥等通过环境变量或首次启动配置页写入，禁止明文提交。
- **认证策略**: 首次可选 `bootstrap-owner` 一次；也可直接走 `register`。用户的模型/MCP/知识库/聊天/导出均按账号隔离。连续登录失败达到阈值会触发临时锁定。
- **脱敏与双域**: 严格遵循 PRD「脱敏双域隔离」：Agent 与检索仅访问 Sanitized Workspace，Raw Vault 与 PII 映射库不向 Agent 开放。

---

## 5.1 systemd 服务化部署（Ubuntu/NAS）

> 适用于内网服务器/NAS，将前后端作为 systemd 服务常驻运行。

### 5.1.1 统一配置（建议）

在仓库根目录 `.env` 中配置端口与数据目录（示例）:
```
FH_SERVER_HOST=0.0.0.0
FH_SERVER_PORT=8000
FH_DATA_ROOT=/home/<user>/family_health/data
FH_RAW_VAULT_DIR=raw_vault
FH_SANITIZED_WORKSPACE_DIR=sanitized_workspace
```

说明：
- `FH_DATA_ROOT` 建议指向独立数据盘或 NAS 数据目录。
- `FH_RAW_VAULT_DIR` 与 `FH_SANITIZED_WORKSPACE_DIR` 会在 `FH_DATA_ROOT` 下自动创建。

### 5.1.2 后端服务

创建服务文件 `/etc/systemd/system/family-health-backend.service`：
```
[Unit]
Description=Family Health Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/<user>/family_health/backend
Environment=PYTHONUNBUFFERED=1
EnvironmentFile=/home/<user>/family_health/.env
ExecStart=/usr/bin/env uv run python -m app
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

启用与管理：
```
sudo systemctl daemon-reload
sudo systemctl enable --now family-health-backend
sudo systemctl status family-health-backend
```

停止与删除：
```
sudo systemctl disable --now family-health-backend
sudo rm /etc/systemd/system/family-health-backend.service
sudo systemctl daemon-reload
```

查看日志：
```
journalctl -u family-health-backend -f
```

### 5.1.3 前端服务（内网访问）

前端建议先构建再预览（适合内网常驻）。

首次构建：
```
cd /home/<user>/family_health/frontend
npm install
npm run build
```

创建服务文件 `/etc/systemd/system/family-health-frontend.service`：
```
[Unit]
Description=Family Health Frontend
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/<user>/family_health/frontend
EnvironmentFile=/home/<user>/family_health/.env
ExecStart=/usr/bin/env npm run preview -- --host 0.0.0.0 --port 5173
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

启用与管理：
```
sudo systemctl daemon-reload
sudo systemctl enable --now family-health-frontend
sudo systemctl status family-health-frontend
```

停止与删除：
```
sudo systemctl disable --now family-health-frontend
sudo rm /etc/systemd/system/family-health-frontend.service
sudo systemctl daemon-reload
```

查看日志：
```
journalctl -u family-health-frontend -f
```

### 5.1.4 端口与访问

- 后端: `http://<server-ip>:8000`
- 前端: `http://<server-ip>:5173`

若需要更改端口：
- 后端修改 `.env` 的 `FH_SERVER_PORT`
- 前端 `npm run preview -- --port <port>`

注意：
- `npm run preview` 为简化内网部署方案；如需更强的生产能力，建议使用 Nginx 或 Caddy 托管 `frontend/dist`。

### 5.1.5 卸载与清理

```
sudo systemctl disable --now family-health-backend family-health-frontend
sudo rm /etc/systemd/system/family-health-backend.service
sudo rm /etc/systemd/system/family-health-frontend.service
sudo systemctl daemon-reload
```

---

## 6. 文档维护约定

- 每次**功能或环境变更**时，检查并更新本文档，确保步骤可执行。
- **后端/API/环境**相关变更同步更新 `doc/api/*.md`；**前端功能**相关变更同步更新 `docs/USER_GUIDE.md`（零基础可执行：目标、前置条件、步骤、预期结果、常见问题、回滚）。

---

## 7. 相关文档

| 文档 | 说明 |
|------|------|
| [PRD.md](./PRD.md) | 需求审计、ADR、系统设计、数据模型、状态机、API 契约、分阶段 AI 执行指令 |
| [api/README.md](./api/README.md) | 各 API 模块接口文档目录 |
| [../docs/USER_GUIDE.md](../docs/USER_GUIDE.md) | 用户说明书（与前端功能同步） |
| [../scripts/README.md](../scripts/README.md) | 联调验收脚本说明 |
