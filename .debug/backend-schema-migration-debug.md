# Backend Schema Migration Debug 记录

## 元信息
- 模块名称: backend-schema-migration
- 创建时间: 2026-02-18
- 最后更新: 2026-02-18
- 相关文件: `backend/app/core/schema_migration.py`, `backend/app/main.py`, `doc/DEPLOYMENT.md`
- 依赖模块: database, auth, model_registry, mcp, chat
- 用户说明书路径（涉及前端功能时）: N/A
- 开发/部署文档路径（涉及后端或环境时）: `doc/DEPLOYMENT.md`

## 运行上下文与测试规则（首次确认后填写，后续优先读取此处，不再反复询问）
- 运行环境: 本机 Windows
- SSH 方式（若远程）: N/A
- 远程项目路径（若远程）: N/A
- 验证/Checkfix 执行方式: 后端目录执行 `uv run ruff check .` 与 `uv run pytest`

## 上下文关系网络
- 文件结构
  - `backend/app/main.py`: 启动入口
  - `backend/app/core/schema_migration.py`: SQLite 启动兼容迁移
- 函数调用链
  - app startup -> `create_all` -> `run_startup_migrations` -> PRAGMA + ALTER TABLE
- 变量依赖图
  - `settings.db_url` 决定是否执行 SQLite 迁移
- 数据流向
  - 旧库缺失 user_id 列 -> 启动自动补列 -> 业务查询恢复

## Debug 历史
### [2026-02-18 17:10] 设置中心/聊天中心 500 修复（旧库结构漂移）
- 问题描述
  - 前端配置页和聊天页多个接口返回 500（`model-providers/model-catalog/runtime-profiles/mcp-servers`）。
- 根因定位
  - 本地 `backend/family_health.db` 为旧表结构，`model_providers/llm_runtime_profiles/mcp_servers/agent_mcp_bindings` 缺少 `user_id` 列。
  - 当前代码已按用户隔离查询（`... WHERE user_id = ?`），导致 SQLite 抛出 `no such column`，前端表现为 500。
- 解决方案
  - 新增启动时 SQLite 兼容迁移：自动补齐缺失 `user_id` 列并创建索引。
  - 迁移为幂等操作，仅在列缺失时执行，不清空数据。
- 代码变更（文件/函数）
  - `backend/app/core/schema_migration.py`: `run_startup_migrations`
  - `backend/app/main.py`: 启动时调用迁移函数
  - `doc/DEPLOYMENT.md`: 增加兼容迁移说明
- 验证结果
  - 待执行后端 checkfix。
- 影响评估
  - 仅影响 SQLite 启动流程，不改变 API 契约。
- 文档更新（新增/修改的 docs 文件与更新点）
  - 修改 `doc/DEPLOYMENT.md`

## 待追踪问题
- 后续应引入 Alembic 做正式版本化迁移，替代启动期轻迁移。

## 技术债务记录
- 当前迁移仅补列，不处理旧数据 user_id 归属映射。

### [2026-02-18 21:05] 知识库中心 500：knowledge_bases.user_id 缺失
- 问题描述
  - `GET/POST /api/v1/knowledge-bases` 500，SQLite 报错 `no such column: knowledge_bases.user_id`。
- 根因定位
  - 代码已按账号隔离查询 `KnowledgeBase.user_id`，但 SQLite 启动兼容迁移遗漏了 `knowledge_bases.user_id` 补列规则。
- 解决方案
  - 在 `run_startup_migrations` 的 SQLite 兼容列配置中补充：`knowledge_bases.user_id`。
  - 新增回归测试，确保旧库结构可在启动迁移后自动补齐该列。
  - 更新部署文档说明该场景。
- 代码变更（文件/函数）
  - `backend/app/core/schema_migration.py`
  - `backend/tests/test_schema_migration.py`
  - `doc/DEPLOYMENT.md`
- 验证结果
  - `uv run ruff check .` 通过
  - `uv run pytest` 通过（14 passed）
  - 一次性本地 DB 迁移验证：`PRAGMA table_info(knowledge_bases)` 包含 `user_id`（输出 `True`）
- 影响评估
  - 仅启动迁移逻辑增强，API 契约不变；可兼容已有 SQLite 数据文件。
