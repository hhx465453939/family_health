# 家庭健康管理助手 — 开发与部署指南

> 目标：**新开发者可按此独立完成环境搭建、本地运行与 .exe 打包**。与 [PRD.md](./PRD.md) 中的系统设计、数据模型及分阶段执行指令保持一致。

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

- **启动服务**:
  ```bash
  uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
  ```
- **数据目录**（首次运行会自动创建）:
  - `data/raw_vault/` — 未脱敏域
  - `data/sanitized_workspace/` — 脱敏域
- **环境变量**（可选）: 本机加密密钥等敏感配置建议通过环境变量注入，不要写进代码或提交到仓库。

### 2.3 前端

```bash
cd frontend
npm install
npm run dev
# 或: npm run build && 通过后端静态托管
```

- 开发时需将 API 代理到后端（如 `http://localhost:8000`），具体见前端 `vite.config` 或等价配置。

### 2.4 验证

- 浏览器访问前端地址，应出现登录页或首次 Owner 初始化页（视是否已有库而定）。
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

阶段 1/2 额外验证（模型目录 + 聊天附件脱敏门禁）:

```powershell
# 1) 创建模型 provider
$token = "<access_token>"
$headers = @{ Authorization = "Bearer $token" }
Invoke-RestMethod -Method POST http://localhost:8000/api/v1/model-providers `
  -Headers $headers `
  -ContentType "application/json" `
  -Body '{"provider_name":"gemini","base_url":"https://example.local","api_key":"demo","enabled":true}'

# 2) 创建脱敏规则（手机号）
Invoke-RestMethod -Method POST http://localhost:8000/api/v1/desensitization/rules `
  -Headers $headers `
  -ContentType "application/json" `
  -Body '{"member_scope":"global","rule_type":"literal","pattern":"13800138000","replacement_token":"[PHONE]","enabled":true}'

# 3) 创建 MCP server 并绑定到 qa agent
$mcp = Invoke-RestMethod -Method POST http://localhost:8000/api/v1/mcp/servers `
  -Headers $headers `
  -ContentType "application/json" `
  -Body '{"name":"tool-a","endpoint":"mock://tool-a","auth_type":"none","enabled":true,"timeout_ms":8000}'
Invoke-RestMethod -Method PUT http://localhost:8000/api/v1/mcp/bindings/qa `
  -Headers $headers `
  -ContentType "application/json" `
  -Body ("{`"mcp_server_ids`":[`"" + $mcp.data.id + "`"]}")

# 4) 创建 KB 并构建最小文档
$kb = Invoke-RestMethod -Method POST http://localhost:8000/api/v1/knowledge-bases `
  -Headers $headers `
  -ContentType "application/json" `
  -Body '{"name":"family-kb","chunk_size":400,"chunk_overlap":50}'
Invoke-RestMethod -Method POST ("http://localhost:8000/api/v1/knowledge-bases/" + $kb.data.id + "/build") `
  -Headers $headers `
  -ContentType "application/json" `
  -Body '{"documents":[{"title":"doc1","content":"高血压用药指南"}]}'
```

---

## 3. Checkfix 闭环（必选）

每次代码变更或每阶段完成后执行，与 PRD §5 一致。

| 层级 | 命令 |
|------|------|
| 后端 | `uv sync` → `ruff check .` → `ruff format --check .`（或 `black --check .`）→ `pytest` |
| 前端 | 依赖变更时 `npm install`；每次变更后 `npm run lint`，可选 `npm run build` |
| 通用 | 若项目内已配置 pre-commit / CI 脚本，优先执行项目既有脚本 |

### 3.1 联调验收脚本（阶段 6）

- 脚本: `scripts/acceptance_integration.ps1`
- 覆盖链路: 登录 -> 配置 -> 对话 -> MCP -> KB -> 检索 -> 导出下载

执行示例:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\acceptance_integration.ps1 -SkipFrontendCheck
```

---

## 4. 打包 .exe（规划）

- **工具**: PyInstaller 或 Nuitka（以 PRD 与项目 `packager/` 为准）。
- **内容**: Python 运行时 + 后端应用 + 前端静态资源；首次运行创建可写目录（如 `data/`）、初始化 SQLite、可选打开浏览器访问配置页。
- **说明**: 具体命令、参数与输出物将在 packager 配置就绪后补充到本节；发布前需执行 PRD 阶段 6「集成验收与发布」并做打包冒烟验证。

---

## 5. 部署与安全注意

- **默认仅内网访问**: 绑定 `0.0.0.0` 时注意仅在内网使用，避免默认暴露公网。
- **敏感配置**: API Key、加密密钥等通过环境变量或首次启动配置页写入，禁止明文提交。
- **认证策略**: 首次仅开放 `bootstrap-owner` 一次；后续由 Owner/Admin 创建用户。连续登录失败达到阈值会触发临时锁定。
- **脱敏与双域**: 严格遵循 PRD「脱敏双域隔离」：Agent 与检索仅访问 Sanitized Workspace，Raw Vault 与 PII 映射库不向 Agent 开放。

---

## 6. 文档维护约定

- 每次**功能或环境变更**时，检查并更新本文档，确保步骤可执行。
- **后端/API/环境**相关变更同步更新 `doc/api/*.md`；**前端功能**相关变更同步更新 `docs/USER_GUIDE.md`（零基础可执行：目标、前置条件、步骤、预期结果、常见问题、回滚）。

---

## 7. 相关文档

| 文档 | 说明 |
|------|------|
| [PRD.md](./PRD.md) | 需求审计、ADR、系统设计、数据模型、状态机、API 契约、分阶段 AI 执行指令 |
| [doc/api/](./api/) | 各 API 模块接口文档（auth / chat / agent / model_registry / mcp / knowledge_base / export 等） |
| [docs/USER_GUIDE.md](../docs/USER_GUIDE.md) | 用户说明书（与前端功能同步） |
