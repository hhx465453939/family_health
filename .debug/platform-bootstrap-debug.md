# Platform Bootstrap Debug 记录

## 元信息
- 模块名称: platform-bootstrap
- 创建时间: 2026-02-16
- 最后更新: 2026-02-16
- 相关文件: `backend/*`, `doc/api/auth.md`, `doc/DEPLOYMENT.md`
- 依赖模块: auth, database, api
- 用户说明书路径（涉及前端功能时）: N/A
- 开发/部署文档路径（涉及后端或环境时）: `doc/DEPLOYMENT.md`

## 运行上下文与测试规则
- 运行环境: 本机 Windows
- SSH 方式（若远程）: N/A
- 远程项目路径（若远程）: N/A
- 验证/Checkfix 执行方式: 在本地终端执行（工作目录 `backend/`）

## 上下文关系网络
- 文件结构:
  - `backend/app/main.py` -> 应用入口
  - `backend/app/api/v1/auth.py` -> 认证接口
  - `backend/app/services/auth_service.py` -> 认证业务逻辑
  - `backend/app/models/*` -> 数据模型
- 函数调用链:
  - API -> Service -> Model/DB -> Response
- 变量依赖图:
  - `settings` 贯穿安全参数、数据库路径、token TTL
- 数据流向:
  - 登录输入 -> 密码校验 -> access/refresh 发放 -> session/audit 落库

## Debug 历史
### [2026-02-16 13:35] 初始化后端骨架与认证闭环
- 问题描述: 仓库仅有 PRD 文档，需开始按 PRD 开发与测试。
- 根因定位: 缺失基础后端结构、认证模块、测试与部署文档细节。
- 解决方案: 实现阶段 0 + 0.5 的最小闭环（FastAPI + SQLite + Auth + RBAC + pytest）。
- 代码变更（文件/函数）:
  - `backend/app/main.py`: 应用入口、trace_id 中间件、健康检查、建表启动逻辑
  - `backend/app/api/v1/auth.py`: bootstrap/login/refresh/logout/用户管理接口
  - `backend/app/services/auth_service.py`: 认证核心逻辑、登录锁定、refresh 轮换、审计写入
  - `backend/app/core/*`: 配置、数据库、响应包络、安全工具、依赖注入
  - `backend/app/models/*`: users/user_sessions/auth_audit_logs 模型
  - `backend/tests/*`: 认证流程测试与内存库测试夹具
  - `backend/pyproject.toml`: 项目依赖与检查配置
- 验证结果:
  - `uv sync --extra dev` 成功
  - `uv run ruff check .` 通过
  - `uv run ruff format --check .` 通过
  - `uv run pytest` 通过（2 passed）
  - 已知 warning: FastAPI `on_event` 弃用警告（后续迁移 lifespan）
- 影响评估: 新增后端目录与接口，不影响现有文档结构。
- 文档更新（新增/修改的 docs 文件与更新点）:
  - 新增 `doc/api/auth.md`: 认证与用户接口契约
  - 更新 `doc/api/README.md`: auth 模块状态更新为首版已实现
  - 更新 `doc/DEPLOYMENT.md`: 本轮后端运行、验证与认证策略说明

### [2026-02-16 15:05] 阶段 1+2 首版落地（模型配置 + 聊天/附件/Agent）
- 问题描述: PRD 阶段 1/2 仍缺失后端实现，无法进入前端联调。
- 根因定位: 缺少 model registry、runtime profile、chat/session、附件脱敏门禁与 agent QA API。
- 解决方案: 在现有认证基础上新增相关模型、服务、API、文档与测试，先打通最小可运行闭环。
- 代码变更（文件/函数）:
  - `backend/app/models/*`: 新增 `model_providers/model_catalog/llm_runtime_profiles/chat_sessions/chat_messages/chat_attachments/desensitization_rules/pii_mapping_vault`
  - `backend/app/services/model_registry_service.py`: provider 管理、模型刷新、runtime profile 与 capability 裁剪
  - `backend/app/services/desensitization_service.py`: 线性脱敏、PII 加密映射库写入、未脱敏高风险门禁
  - `backend/app/services/chat_service.py`: 会话 CRUD、消息、附件上传与 raw/sanitized 双域落盘
  - `backend/app/services/agent_service.py`: 最小 QA 链路（历史裁剪 + 脱敏附件注入）
  - `backend/app/api/v1/{model_registry.py,chat.py,agent.py}`: 阶段 1/2 API 暴露
  - `backend/app/main.py`: 启动时确保双域目录存在
- 验证结果:
  - `uv run ruff check .` 通过
  - `uv run ruff format --check .` 通过（先执行过 `uv run ruff format .`）
  - `uv run pytest` 通过（4 passed）
- 影响评估: 新增多模块但保持 API-First 边界；认证模块接口行为不变。
- 文档更新（新增/修改的 docs 文件与更新点）:
  - 新增 `doc/api/model_registry.md`
  - 新增 `doc/api/chat.md`
  - 新增 `doc/api/agent.md`
  - 新增 `doc/api/desensitization.md`
  - 更新 `doc/api/README.md` 模块实现状态
  - 更新 `doc/DEPLOYMENT.md` 阶段 1/2 验证示例

## 待追踪问题
- 是否引入 Alembic 迁移框架（当前用 `create_all`）
- refresh token 轮换冲突策略是否需要强一致锁
- 将 `@app.on_event("startup")` 迁移到 FastAPI lifespan

## 技术债务记录
- 初版 RBAC 为轻量实现，后续可抽象策略层。
