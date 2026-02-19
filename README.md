<div align="center">
  <img src="docs/assets/fhp-logo.svg" alt="Family Health Platform Logo" width="120" height="120" />
  <h1>Family Health Platform</h1>
  <p>高端家庭健康管理中台 · Family-grade Private Health Operations Console</p>

  <p>
    <img src="https://img.shields.io/badge/License-Apache%202.0-2ea44f" alt="License Apache 2.0" />
    <img src="https://img.shields.io/badge/Backend-FastAPI%20%7C%20SQLAlchemy-0f766e" alt="Backend" />
    <img src="https://img.shields.io/badge/Frontend-React%20%7C%20TypeScript-2563eb" alt="Frontend" />
    <img src="https://img.shields.io/badge/Runtime-Windows%20LAN%20First-7c3aed" alt="Runtime" />
    <img src="https://img.shields.io/badge/Security-PII%20Desensitization-b45309" alt="Security" />
  </p>
</div>

## 产品定位
面向高净值家庭与专业健康管理场景，提供以隐私安全为核心的健康数据治理、临床 AI 协作与知识库增强问答能力。

## 核心能力
- 多用户隔离：账号级独立模型、MCP、知识库、导出空间
- 聊天中心：会话管理、附件上传、流式问答、知识库增强 QA
- 模型中心：多供应商模型刷新与 Runtime Profile 管理
- MCP 中心：命令式接入、模板导入、Agent 绑定
- 知识库中心：文本/文档构建、检索策略与权重控制
- 导出中心：多类型打包下载，支持脱敏域治理
- 双域安全：`raw_vault` 与 `sanitized_workspace` 严格隔离

## 技术栈
- Backend: FastAPI, SQLAlchemy, SQLite, httpx, pytest, ruff
- Frontend: React, Vite, TypeScript
- 工程化: npm, uv

## 快速启动
### 1) 后端
```powershell
cd backend
uv venv
uv sync
uv run python -m app
```
端口统一从仓库根 `.env` 读取（参考 `.env.example`）：
```
FH_SERVER_HOST=127.0.0.1
FH_SERVER_PORT=8000
```

### 2) 前端
```powershell
cd frontend
npm install
# npm run dev
# 内网其他设备访问前端开发服务:
npm run dev:lan
```

默认访问地址:
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`
- LAN Frontend（`npm run dev:lan`）: `http://<你的局域网IP>:5173`

提示：若需要修改后端端口，改 `.env` 中 `FH_SERVER_PORT` 即可，前端代理会自动跟随。

## 质量检查
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
- 用户说明书: `docs/USER_GUIDE.md`
- API 文档: `doc/api/README.md`
- 部署说明: `doc/DEPLOYMENT.md`
- 联调脚本说明: `scripts/README.md`

## 协议
本项目采用 Apache License 2.0，详见 `LICENSE`。
