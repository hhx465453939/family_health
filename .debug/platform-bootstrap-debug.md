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

### [2026-02-16 15:35] 阶段 3 首版落地（MCP 配置与会话/本轮覆盖）
- 问题描述: 需要补齐 PRD 阶段 3 的 MCP 全局配置、选择性调用与降级策略。
- 根因定位: 缺失 mcp server/binding 数据模型、API 和 agent 侧路由逻辑。
- 解决方案: 新增 MCP 模块并接入 agent QA 执行链路，支持会话默认与本轮覆盖。
- 代码变更（文件/函数）:
  - `backend/app/models/mcp_server.py`, `backend/app/models/agent_mcp_binding.py`: MCP 数据模型
  - `backend/app/api/v1/mcp.py`: MCP server CRUD、ping、agent binding API
  - `backend/app/services/mcp_service.py`: server 管理、有效 MCP 解析、并发调用与降级
  - `backend/app/models/chat_session.py`: 新增 `default_enabled_mcp_ids_json`
  - `backend/app/services/chat_service.py`: 会话默认 MCP 配置持久化与读取
  - `backend/app/services/agent_service.py`: MCP 生效优先级（本轮 > 会话默认 > 全局绑定）与结果回传
- 验证结果:
  - `uv run ruff check .` 通过
  - `uv run ruff format --check .` 通过
  - `uv run pytest` 通过（6 passed）
- 影响评估: 对现有 auth/model/chat 基线无破坏，新增 API 均为向后兼容扩展。
- 文档更新（新增/修改的 docs 文件与更新点）:
  - 新增 `doc/api/mcp.md`
  - 更新 `doc/api/agent.md`（增加 MCP 覆盖与降级行为）
  - 更新 `doc/api/README.md`（MCP 状态更新）
  - 更新 `doc/DEPLOYMENT.md`（阶段 3 验证示例）

### [2026-02-16 16:00] 阶段 4 首版落地（KB / Retrieval / Export）
- 问题描述: 需补齐 PRD 阶段 4 的知识库构建、检索与数据导出主流程。
- 根因定位: 缺失 knowledge_base、retrieval、export 的模型、服务、API 与状态机实现。
- 解决方案: 新增 KB/文档/切块/导出任务数据模型，补齐构建、检索、打包下载 API，并覆盖自动化测试。
- 代码变更（文件/函数）:
  - `backend/app/models/{knowledge_base,kb_document,kb_chunk,export_job,export_item}.py`
  - `backend/app/services/knowledge_base_service.py`: KB CRUD、build/rebuild、retry-failed、检索
  - `backend/app/services/export_service.py`: export job 创建、manifest+zip 打包、查询、下载、删除
  - `backend/app/api/v1/{knowledge_base,retrieval,export}.py`: 阶段 4 API 暴露
  - `backend/app/api/v1/router.py`: 新增路由挂载
  - `backend/tests/test_stage4_kb_export_flow.py`: 集成测试
- 验证结果:
  - `uv run ruff check .` 通过
  - `uv run ruff format --check .` 通过
  - `uv run pytest` 通过（7 passed）
- 影响评估: 保持 API-First 边界，新增模块与现有 auth/chat/mcp 兼容。
- 文档更新（新增/修改的 docs 文件与更新点）:
  - 新增 `doc/api/knowledge_base.md`
  - 新增 `doc/api/retrieval.md`
  - 新增 `doc/api/export.md`
  - 新增 `doc/api/pipeline.md`（最小流程说明）
  - 更新 `doc/api/README.md`（阶段 4 状态）
  - 更新 `doc/DEPLOYMENT.md`（阶段 4 验证示例）

### [2026-02-16 18:10] 用户体验修复（注册、Provider 管理、附件模式、背景提示词）
- 问题描述: 设置中心缺少 Provider 删除与模型选择体验；聊天空文本+附件无法发送；缺少背景提示词上下文；登录页无注册入口。
- 根因定位: API 与前端交互能力缺口，Auth/Agent/ModelRegistry 未覆盖上述场景。
- 解决方案: 扩展后端接口并联动前端页面交互，补齐注册、Provider 删除、Agent 背景提示词与附件模式。
- 代码变更（文件/函数）:
  - `backend/app/api/v1/auth.py`: 新增 `POST /api/v1/auth/register`
  - `backend/app/services/auth_service.py`: 新增 `register_user`
  - `backend/app/api/v1/model_registry.py`: 新增 `DELETE /api/v1/model-providers/{id}`
  - `backend/app/services/model_registry_service.py`: 新增 `delete_provider`
  - `backend/app/schemas/agent.py`: `query` 改为可空，新增 `background_prompt`
  - `backend/app/services/agent_service.py`: 支持“仅附件模式”与背景提示词注入，纯空请求拦截
  - `backend/tests/test_auth_flow.py`: 新增注册后登录用例
  - `backend/tests/test_phase1_phase2_flow.py`: 新增 provider 删除与附件模式 QA 用例
- 验证结果:
  - `uv sync --extra dev` 成功
  - `uv run ruff check .` 通过
  - `uv run pytest` 通过（9 passed）
- 影响评估: 接口向后兼容扩展，现有流程可继续使用。
- 文档更新（新增/修改的 docs 文件与更新点）:
  - 更新 `doc/api/auth.md`
  - 更新 `doc/api/model_registry.md`
  - 更新 `doc/api/agent.md`
  - 更新 `doc/api/mcp.md`
  - 更新 `docs/USER_GUIDE.md`

### [2026-02-16 18:50] 修复管理员登录 500（naive/aware datetime 比较）
- 问题描述: 登录接口在账户锁定判断时抛出 `TypeError: can't compare offset-naive and offset-aware datetimes`，导致 500。
- 根因定位: SQLite 读出的 `lock_until` 可能是 naive datetime，而代码用 aware datetime (`timezone.utc`) 直接比较。
- 解决方案: 在 `_ensure_login_allowed` 内统一规范化 `lock_until`，naive 值按 UTC 解释后再比较。
- 代码变更（文件/函数）:
  - `backend/app/services/auth_service.py` -> `_ensure_login_allowed`
  - `backend/tests/test_auth_flow.py` -> 新增锁定后登录回归测试（确保返回 401 而不是 500）
- 验证结果:
  - `uv run ruff check .` 通过
  - `uv run pytest` 通过（10 passed）
- 影响评估: 仅修复时间比较逻辑，不改变认证业务规则。
- 文档更新（新增/修改的 docs 文件与更新点）:
  - 无（现有文档行为描述不变）

## 待追踪问题
- 是否引入 Alembic 迁移框架（当前用 `create_all`）
- refresh token 轮换冲突策略是否需要强一致锁
- 将 `@app.on_event("startup")` 迁移到 FastAPI lifespan

## 技术债务记录
- 初版 RBAC 为轻量实现，后续可抽象策略层。
