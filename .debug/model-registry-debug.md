# Model Registry Debug 记录

## 元信息
- 模块名称: model-registry
- 创建时间: 2026-02-18
- 最后更新: 2026-02-18
- 相关文件: `backend/app/services/model_registry_service.py`, `backend/app/api/v1/model_registry.py`, `frontend/src/pages/SettingsCenter.tsx`, `frontend/src/api/client.ts`, `doc/api/model_registry.md`, `docs/USER_GUIDE.md`
- 依赖模块: auth, settings-center, runtime-profile
- 用户说明书路径（涉及前端功能时）: `docs/USER_GUIDE.md`
- 开发/部署文档路径（涉及后端或环境时）: `doc/api/model_registry.md`

## 运行上下文与测试规则（首次确认后填写，后续优先读取此处，不再反复询问）
- 运行环境: 本机 Windows
- SSH 方式（若远程）: N/A
- 远程项目路径（若远程）: N/A
- 验证/Checkfix 执行方式: 本地终端执行；后端在 `backend/` 下执行 `uv run ruff check .` 与 `uv run pytest`，前端在 `frontend/` 下执行 `npm run build`

## 上下文关系网络
- 文件结构
  - `backend/app/api/v1/model_registry.py`: provider API 暴露层
  - `backend/app/services/model_registry_service.py`: provider 预置、去重与模型刷新业务
  - `frontend/src/pages/SettingsCenter.tsx`: provider 管理 UI
  - `frontend/src/api/client.ts`: API 封装与错误处理
- 函数调用链
  - SettingsCenter -> api.createProvider/listProviderPresets -> `/api/v1/model-providers` + `/api/v1/model-provider-presets` -> model_registry_service
- 变量依赖图
  - `providerPresetKey` 驱动 `providerForm.provider_name/base_url` 自动填充
  - `provider_name + base_url` 作为后端重复校验组合键
- 数据流向
  - 用户在 UI 选预置/自定义 -> 提交 provider -> 后端加密 API Key 入库 -> 刷新模型目录

## Debug 历史
### [2026-02-18 15:40] Provider 预置端点与 401 误判修复
- 问题描述
  - 用户按现有默认值配置 Gemini 后报错，且 `POST /api/v1/model-providers` 出现 401。
  - 需要内置经典供应商完整端点，并保留可无限新增的自定义模式。
- 根因定位
  - 前端默认 `base_url` 为占位地址 `https://example.local/gemini`，易导致误配置。
  - `model-providers` 接口要求 Bearer Token，401 是鉴权失败（常见于 token 过期/缺失），并非 Gemini 端点本身错误。
  - 后端去重仅按 `provider_name`，无法支持同供应商多端点（如智谱 chat/coding 两个地址）。
- 解决方案
  - 新增 `GET /api/v1/model-provider-presets` 统一下发预置供应商模板。
  - 预置 Gemini/OpenAI/Zhipu(Chat/Coding)/SiliconFlow/OpenRouter + Custom。
  - provider 去重规则改为 `(provider_name, base_url)`。
  - 设置中心新增“预置供应商”下拉，支持一键填充与 Custom 自定义。
  - API 错误解析增加对 FastAPI `detail` 的兼容，401 提示更明确。
- 代码变更（文件/函数）
  - `backend/app/services/model_registry_service.py`: `_PROVIDER_PRESETS`, `list_provider_presets`, `_normalize_base_url`, create/update 去重逻辑
  - `backend/app/api/v1/model_registry.py`: 新增 `list_provider_presets_api`，完善 provider 错误返回
  - `frontend/src/api/types.ts`: 新增 `ProviderPreset`
  - `frontend/src/api/client.ts`: 新增 `listProviderPresets`，强化错误解析
  - `frontend/src/pages/SettingsCenter.tsx`: 预置选择与表单自动填充
  - `backend/tests/test_phase1_phase2_flow.py`: 预置接口与同供应商多端点测试
- 验证结果
  - 待执行 checkfix。
- 影响评估
  - 仅扩展 provider 管理能力，不影响既有 chat/kb/export 主流程。
- 文档更新（新增/修改的 docs 文件与更新点）
  - `doc/api/model_registry.md`: 新增预置接口、端点清单、去重规则
  - `docs/USER_GUIDE.md`: 新增预置/自定义操作步骤与 401 排查

## 待追踪问题
- 后续可考虑对 `provider_name` 和 `base_url` 增加数据库层唯一约束，避免并发下重复写入。

## 技术债务记录
- 当前预置仅用于配置填充，未直接对接真实供应商模型自动发现。

### [2026-02-18 23:58] 模型刷新体验修复（自动发现供应商模型）
- 问题
  - 刷新模型后常需手动填写（SiliconFlow / Gemini 新模型未自动出现）。
- 根因
  - `refresh_models` 仅使用本地静态默认列表，未调用供应商真实模型列表接口。
- 修复
  - 新增供应商模型自动发现链路：
    - Gemini: 使用 `GET {base_url}?key=API_KEY` 解析 `models`。
    - OpenAI 兼容: 自动从 `.../chat/completions` 推导 `.../models` 并 `GET`。
  - 新增模型类型推断（llm/embedding/reranker）与能力标记（DeepSeek reasoning、常见多模态模型）。
  - 自动发现失败时回退到原默认列表，避免阻塞使用。
  - 去重 discovered + manual models。
  - Settings 默认 `manualModels` 改为空字符串，避免刷新时人为注入占位模型。
- 影响文件
  - `backend/app/services/model_registry_service.py`
  - `frontend/src/pages/SettingsCenter.tsx`
- 验证
  - `uv run ruff check .` 通过
  - `uv run pytest tests/test_phase1_phase2_flow.py` 通过

### [2026-02-19 00:18] SiliconFlow embedding 分类补强（BAAI/bge-m3）
- 问题
  - 刷新模型后部分 embedding（如 `BAAI/bge-m3`）未进入 Embedding 列表。
- 根因
  - OpenAI 兼容发现逻辑仅按模型名中是否包含 `embedding` 进行分类；`bge-m3` 被误判为 llm。
- 修复
  - 新增 `row` 元数据优先分类（`model_type/type/task_type/category/capabilities`）。
  - 扩展名称兜底规则，覆盖 `bge-m3`、`bge-*`、`e5-*`、`gte-*`、`m3e-*`、`jina-embeddings` 等 embedding 命名。
  - 补充 reranker 命名识别（`bge-reranker` / `bce-reranker`）。
- 影响文件
  - `backend/app/services/model_registry_service.py`
- 验证
  - `uv run ruff check .` 通过
  - `uv run pytest tests/test_phase1_phase2_flow.py` 通过
