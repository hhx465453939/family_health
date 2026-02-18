# Frontend Four Centers Debug 记录

## 元信息
- 模块名称: frontend-four-centers
- 创建时间: 2026-02-16
- 最后更新: 2026-02-16
- 相关文件: `frontend/*`, `docs/USER_GUIDE.md`, `doc/DEPLOYMENT.md`
- 依赖模块: auth, chat, model_registry, mcp, knowledge_base, retrieval, export
- 用户说明书路径（涉及前端功能时）: `docs/USER_GUIDE.md`
- 开发/部署文档路径（涉及后端或环境时）: `doc/DEPLOYMENT.md`

## 运行上下文与测试规则
- 运行环境: 本机 Windows
- SSH 方式（若远程）: N/A
- 远程项目路径（若远程）: N/A
- 验证/Checkfix 执行方式: 在本地终端执行（工作目录 `frontend/`）

## 上下文关系网络
- 文件结构:
  - `frontend/src/App.tsx` -> 主布局与导航
  - `frontend/src/pages/AuthPage.tsx` -> 登录/初始化
  - `frontend/src/pages/SettingsCenter.tsx` -> Provider/模型/MCP配置
  - `frontend/src/pages/ChatCenter.tsx` -> 三栏聊天与附件/MCP
  - `frontend/src/pages/KnowledgeBaseCenter.tsx` -> KB构建与检索
  - `frontend/src/pages/ExportCenter.tsx` -> 导出任务
  - `frontend/src/api/client.ts` -> API 封装
- 函数调用链:
  - 页面组件 -> `api/client.ts` -> 后端 `/api/v1/*`
- 变量依赖图:
  - `session.token` 贯穿所有 API 调用
  - `session.role` 控制设置中心访问与按钮权限
- 数据流向:
  - 登录得到 token -> 页面请求业务数据 -> 表单提交调用后端 -> 刷新局部状态

## Debug 历史
### [2026-02-16 16:40] 阶段 5 前端四中心首版实现与联调
- 问题描述: 仓库无前端工程，需要按 PRD 实现四中心 UI 并联调已实现后端 API。
- 根因定位: 缺失前端项目结构、页面布局、API 客户端、认证与权限路由。
- 解决方案: 新建 Vite+React+TS 前端，落地登录页与四中心页面并接入后端接口。
- 代码变更（文件/函数）:
  - `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`
  - `frontend/src/api/types.ts`, `frontend/src/api/client.ts`
  - `frontend/src/App.tsx`
  - `frontend/src/pages/{AuthPage,SettingsCenter,ChatCenter,KnowledgeBaseCenter,ExportCenter}.tsx`
  - `frontend/src/styles/{tokens.css,global.css}`
  - `frontend/src/main.tsx`, `frontend/index.html`
- 验证结果:
  - `npm install` 成功
  - `npm run lint` 通过
  - `npm run build` 通过
  - 处理中修复: `App.tsx` nav key 类型推断错误；修复 JSON BOM 导致 Vite 构建失败
- 影响评估: 前端为新增模块，不影响现有后端 API 行为。
- 文档更新（新增/修改的 docs 文件与更新点）:
  - 新增 `docs/USER_GUIDE.md`：登录、设置、聊天、KB、导出操作手册

### [2026-02-16 18:15] UX 修复轮（设置/聊天/注册/MCP模板）
- 问题描述: 用户反馈设置中心缺少 Provider 管理闭环、聊天不能空文本+附件发送、缺少角色背景提示词、无注册入口、MCP 缺少 JSON 模板导入体验。
- 根因定位: 首版前端聚焦链路跑通，未补齐运营级管理交互。
- 解决方案: 增强 Auth/Settings/Chat 页面交互，补充 MCP 模板导入与多卡管理。
- 代码变更（文件/函数）:
  - `frontend/src/pages/AuthPage.tsx`: 新增注册模式（register/login/bootstrap 三态）
  - `frontend/src/pages/SettingsCenter.tsx`: 三页签（供应商/模型选择/MCP工具），Provider 删除与多供应商管理、模型下拉选择、MCP 模板导入
  - `frontend/src/pages/ChatCenter.tsx`: 背景提示词输入、附件模式发送（无文本可发）
  - `frontend/src/api/client.ts`: 新增 `register/updateProvider/deleteProvider/deleteMcpServer`，`qa` 增加 `background_prompt`
- 验证结果:
  - `npm run lint` 通过
  - `npm run build` 通过
- 影响评估: 前端交互增强，不破坏原有页面结构。
- 文档更新（新增/修改的 docs 文件与更新点）:
  - 更新 `docs/USER_GUIDE.md`：注册流程、Provider 管理、MCP 模板导入、聊天背景提示词与附件模式

### [2026-02-16 18:35] 内网访问与密码认知修复
- 问题描述: 用户反馈仅 `localhost:5173` 可访问，`<内网IP>:5173` 不可访问；并询问 Owner 初始密码。
- 根因定位: `vite` 默认仅监听本机回环地址；登录页默认值让“存在默认密码”产生误解。
- 解决方案: 新增 `npm run dev:lan` 脚本，登录页去掉默认凭据并明确“系统无默认 Owner 密码”。
- 代码变更（文件/函数）:
  - `frontend/package.json`: 新增 `dev:lan`
  - `frontend/src/pages/AuthPage.tsx`: 清空默认用户名/密码并增加提示文案
- 验证结果:
  - `npm run lint` 通过
  - `npm run build` 通过
- 影响评估: 改善内网可访问性与用户认知，不影响业务接口。
- 文档更新（新增/修改的 docs 文件与更新点）:
  - 更新 `README.md`
  - 更新 `doc/DEPLOYMENT.md`
  - 更新 `docs/USER_GUIDE.md`

## 待追踪问题
- 当前未接入 websocket/流式输出，Agent 回复为请求完成后整条返回。
- Viewer 角色仅做 UI 按钮层限制，后端权限仍是最终兜底。

## 技术债务记录
- ESLint 使用 v8 兼容配置，后续可升级到 flat config（eslint v9+）。

### [2026-02-18 21:45] 知识库中心体验升级（管理/上传/策略）
- 变更摘要
  - 重写 `KnowledgeBaseCenter`：新增知识库图标化管理、配置保存、文档上传构建、文档删除、策略+权重检索调参。
  - API 客户端新增 KB defaults/update/delete/upload-doc/delete-doc。
- 验证
  - `npm run build` 通过
- 文档
  - 更新 `docs/USER_GUIDE.md` 知识库使用章节
