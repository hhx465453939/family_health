# Family Health Platform

家庭健康管理中台（内网优先），提供认证、聊天 Agent、MCP 工具配置、知识库构建、脱敏隔离与数据导出能力。

## 核心能力
- 本地账号与多用户独立数据空间（每个账号可独立配置模型/MCP/知识库/导出）
- 聊天中心：会话管理、附件上传、Agent 问答
- MCP 中心：个人配置、连通性检测、QA 绑定
- 知识库中心：构建/重建、检索、文档状态
- 导出中心：多类型数据打包下载
- 脱敏双域：`raw_vault` 与 `sanitized_workspace` 严格隔离

## 技术栈
- Backend: FastAPI + SQLAlchemy + SQLite + pytest + ruff
- Frontend: React + Vite + TypeScript + ESLint
- 运行环境: Windows 家庭内网优先（也可迁移到 Linux）

## 快速启动
### 1) 后端
```powershell
cd backend
uv venv
uv sync
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 2) 前端
```powershell
cd frontend
npm install
npm run dev
# 内网其他设备访问前端开发服务:
# npm run dev:lan
```

默认访问:
- 前端: `http://localhost:5173`
- 后端: `http://localhost:8000`
- 内网访问前端（启用 `npm run dev:lan` 后）: `http://<你的局域网IP>:5173`

说明:
- Windows 下若出现 `WinError 10013`，优先使用 `--host 127.0.0.1`。
- 仅在需要内网其他设备访问时再切换为 `--host 0.0.0.0`。
- 无默认管理员密码；可直接注册普通用户使用全部核心功能。

## 联调验收（一键脚本）
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\acceptance_integration.ps1 -SkipFrontendCheck
```

脚本覆盖链路：登录 -> 配置 -> 对话 -> MCP -> KB -> 检索 -> 导出下载。

## 检查命令
### Backend
```powershell
cd backend
uv run ruff check .
uv run ruff format --check .
uv run pytest
```

### Frontend
```powershell
cd frontend
npm run lint
npm run build
```

## 文档入口
- 产品与技术规范: `doc/PRD.md`
- 开发部署: `doc/DEPLOYMENT.md`
- API 文档: `doc/api/README.md`
- 用户说明书: `docs/USER_GUIDE.md`
- 联调脚本说明: `scripts/README.md`

## 当前状态
- 后端阶段 0~4 已落地并通过测试
- 前端阶段 5（四中心）已实现并可构建
- 待推进：阶段 6 发布清单与 `.exe` 打包冒烟
