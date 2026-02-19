# 脱敏预览与文件 IO Debug 记录

## 元信息
- 模块名称: desensitization-io
- 创建时间: 2026-02-19
- 最后更新: 2026-02-19
- 相关文件: backend/app/api/v1/file_preview.py, backend/app/api/v1/chat.py, backend/app/services/desensitization_service.py, backend/app/services/knowledge_base_service.py, backend/app/services/chat_service.py, frontend/src/components/DesensitizationModal.tsx, frontend/src/pages/ChatCenter.tsx, frontend/src/pages/KnowledgeBaseCenter.tsx, frontend/src/pages/ExportCenter.tsx, docs/USER_GUIDE.md
- 依赖模块: 知识库、导出、聊天附件、脱敏规则
- 用户说明书路径（涉及前端功能时）: docs/USER_GUIDE.md
- 开发/部署文档路径（涉及后端或环境时）: doc/api/desensitization.md, doc/api/file_preview.md

## 运行上下文与测试规则（首次确认后填写，后续优先读取此处，不再反复询问）
- 运行环境: NAS Ubuntu 24（本机）
- SSH 方式（若远程）: N/A
- 远程项目路径（若远程）: /home/damncheater/Development/family_health
- 验证/Checkfix 执行方式: 直接在本机终端执行

## 上下文关系网络
- 文件结构: 文件预览 API -> 脱敏规则 CRUD -> 上传/导出弹窗
- 函数调用链: 预览 -> 规则新增 -> 实际上传/导出 -> sanitize_text -> PII 映射库
- 变量依赖图: 规则模板/选区 -> DesensitizationRule -> PiiMappingVault
- 数据流向: 原始文件 -> 文本抽取 -> 预览 -> 规则 -> 脱敏后入库/导出

## Debug 历史
### [2026-02-19 00:30] 默认批量上传/下载
- 问题描述: 脱敏规则的复用需要批量上传/下载作为默认入口。
- 根因定位: 上传与下载入口均为单文件/单任务处理，批量流程不顺滑。
- 解决方案: 上传入口支持多文件队列；导出任务支持批量下载。
- 代码变更（文件/函数）: `frontend/src/pages/ChatCenter.tsx`, `frontend/src/pages/KnowledgeBaseCenter.tsx`, `frontend/src/pages/ExportCenter.tsx`
- 验证结果: 未执行（待 Checkfix）
- 影响评估: 仅影响 UI 流程与批量操作体验。

### [2026-02-19 00:45] 选中即建规则与多行匹配
- 问题描述: 选区填入规则步骤不够流畅，且需保留换行以精准命中。
- 根因定位: 需要减少步骤并确保 selection 原样进入规则。
- 解决方案: 选区按钮直接创建规则（literal），保留换行内容不做 trim。
- 代码变更（文件/函数）: `frontend/src/components/DesensitizationModal.tsx`
- 验证结果: 未执行（待 Checkfix）
- 影响评估: 仅优化交互，不改变脱敏逻辑。

### [2026-02-19 01:00] 规则高亮与对比预览
- 问题描述: 预览缺少规则命中高亮与对比视图，规则管理不够商品化。
- 根因定位: 预览仍以纯文本 textarea 展示，缺少批量管理入口。
- 解决方案: 增加高亮渲染、左右对比预览，规则批量选择/删除/清空。
- 代码变更（文件/函数）: `frontend/src/components/DesensitizationModal.tsx`, `frontend/src/styles/global.css`
- 验证结果: 未执行（待 Checkfix）
- 影响评估: 仅影响前端交互与视觉。

### [2026-02-19 01:20] 规则分组与导入导出
- 问题描述: 规则管理入口不够显眼，缺少标签分组与模板导入导出；黑色背景下部分文字对比度不足。
- 根因定位: 规则管理按钮分散在面板内部，规则缺少 tag 字段承载分组；暗色主题未对 muted 文本做覆盖。
- 解决方案: 新增规则 tag 字段与标签筛选/分组展示；规则支持导入导出；顶部加入“规则管理”快捷入口；优化暗色文案对比度与规则区样式。
- 代码变更（文件/函数）: `backend/app/models/desensitization_rule.py`, `backend/app/core/schema_migration.py`, `backend/app/schemas/chat.py`, `backend/app/services/desensitization_service.py`, `backend/app/api/v1/chat.py`, `frontend/src/components/DesensitizationModal.tsx`, `frontend/src/styles/global.css`, `docs/USER_GUIDE.md`, `doc/api/desensitization.md`
- 验证结果: 未执行（待 Checkfix）
- 影响评估: 规则管理体验提升，新增 tag 字段需 SQLite 启动迁移。

### [2026-02-19 01:40] 预览对比度与前端构建修复
- 问题描述: 脱敏预览中的输入/提示文案偏暗；前端构建报 unused 变量错误。
- 根因定位: 暗色弹窗未覆盖 label/placeholder/ghost 按钮颜色；ChatCenter 中遗留未使用函数。
- 解决方案: 提升预览弹窗 label/placeholder/ghost 对比度；移除未使用函数并复跑 build。
- 代码变更（文件/函数）: `frontend/src/styles/global.css`, `frontend/src/pages/ChatCenter.tsx`
- 验证结果: `npm run build` ✅
- 影响评估: 仅 UI 可读性与构建通过性改进。

### [2026-02-19 02:00] 预览缩放/全屏移除与按钮布局调整
- 问题描述: 缩放/全屏影响体验，规则管理按钮需要顶部靠左展示。
- 根因定位: 预览工具条含缩放控件，标题行按钮布局偏右。
- 解决方案: 移除缩放与全屏逻辑，标题行左侧保留规则管理按钮并居中标题。
- 代码变更（文件/函数）: `frontend/src/components/DesensitizationModal.tsx`, `frontend/src/styles/global.css`
- 验证结果: `npm run build` ✅
- 影响评估: 预览交互更简洁，布局更符合预期。

### [2026-02-19 02:10] 规则管理可见性优化
- 问题描述: 点击“规则管理”后仍不易找到新增/删除入口。
- 根因定位: 规则表单在列表下方，视觉上不够突出；规则区域缺少明显边界。
- 解决方案: 规则表单移至规则区顶部，增加空状态提示，规则区增加边框与背景。
- 代码变更（文件/函数）: `frontend/src/components/DesensitizationModal.tsx`, `frontend/src/styles/global.css`
- 验证结果: 未执行（待 Checkfix）
- 影响评估: 规则管理入口更直观。

### [2026-02-19 02:20] 知识库区域横向滚动优化
- 问题描述: 知识库上传区域出现横向滚动条。
- 根因定位: Grid 子项默认最小宽度导致溢出，长文本不换行。
- 解决方案: `mini-grid` 使用 `minmax(0,1fr)` 并允许子项收缩，列表文本启用断行。
- 代码变更（文件/函数）: `frontend/src/styles/global.css`
- 验证结果: `npm run build` ✅
- 影响评估: 视觉布局更自适应，避免横向滚动。

### [2026-02-19 02:30] 规则区顶部固定与布局调整
- 问题描述: 规则区在右侧导致长文档时要滚动很久才能操作。
- 根因定位: 预览左右布局导致规则操作离顶部远。
- 解决方案: 规则区整体移动到弹窗顶部，预览区单列展示。
- 代码变更（文件/函数）: `frontend/src/components/DesensitizationModal.tsx`, `frontend/src/styles/global.css`
- 验证结果: `npm run build` ✅
- 影响评估: 规则操作始终可见，预览更清晰。

### [2026-02-19 03:00] 文档切换动画与全量预览
- 问题描述: 批量文档切换缺少明显反馈，容易误判文档未切换。
- 根因定位: 预览区域无切换动画与提示。
- 解决方案: 文档切换时预览区增加轻量动画；保持全文显示，不做截断。
- 代码变更（文件/函数）: `frontend/src/components/DesensitizationModal.tsx`, `frontend/src/styles/global.css`, `docs/USER_GUIDE.md`
- 验证结果: `npm run build` ✅
- 影响评估: 切换反馈更明确，避免误操作。

### [2026-02-19 00:00] 文件 IO 脱敏预览闭环
- 问题描述: 上传/导出需提供全文预览与用户自定义脱敏规则。
- 根因定位: 现有仅有规则与门禁，缺少预览与交互。
- 解决方案: 新增预览 API、规则 CRUD + 预设模板、前端全屏预览弹窗与搜索。
- 代码变更（文件/函数）: 见元信息。
- 验证结果: 未执行（待 Checkfix）
- 影响评估: 文件 IO 全链路新增脱敏预览与规则管理。
- 文档更新（新增/修改的 docs 文件与更新点）: docs/USER_GUIDE.md, doc/api/desensitization.md, doc/api/file_preview.md

## 待追踪问题
- Phase 2 图片遮罩预览与融合入库

## 技术债务记录
## 架构决策记录（可选）
