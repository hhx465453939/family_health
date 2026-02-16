# Integration Acceptance Debug 记录

## 元信息
- 模块名称: integration-acceptance-script
- 创建时间: 2026-02-16
- 最后更新: 2026-02-16
- 相关文件: `scripts/acceptance_integration.ps1`, `scripts/README.md`, `doc/DEPLOYMENT.md`
- 依赖模块: auth, model_registry, mcp, chat, agent, knowledge_base, retrieval, export
- 用户说明书路径（涉及前端功能时）: `docs/USER_GUIDE.md`
- 开发/部署文档路径（涉及后端或环境时）: `doc/DEPLOYMENT.md`

## 运行上下文与测试规则
- 运行环境: 本机 Windows
- SSH 方式（若远程）: N/A
- 远程项目路径（若远程）: N/A
- 验证/Checkfix 执行方式: 本地 PowerShell 执行脚本；先 `-DryRun`，再真实请求

## 上下文关系网络
- 文件结构:
  - `scripts/acceptance_integration.ps1` -> 全链路联调验收脚本
  - `scripts/README.md` -> 脚本使用说明
  - `doc/DEPLOYMENT.md` -> 集成验收入口文档
- 函数调用链:
  - `Invoke-Api` / `Invoke-ApiMultipart` -> 各阶段 API -> `Require-EnvelopeOk` 断言
- 变量依赖图:
  - `$token` 贯穿鉴权调用
  - `$runId` 生成本轮资源名避免冲突
- 数据流向:
  - 登录令牌 -> 配置创建 -> 会话/QA -> KB 构建检索 -> 导出下载

## Debug 历史
### [2026-02-16 16:55] 新增前后端联调验收脚本
- 问题描述: 需要一个可重复执行的端到端验收脚本，覆盖 PRD 阶段 6 主链路。
- 根因定位: 当前联调依赖手工点测，缺乏自动化回归入口。
- 解决方案: 新增 PowerShell 脚本，按阶段执行 API 调用并做断言，失败即停。
- 代码变更（文件/函数）:
  - `scripts/acceptance_integration.ps1`
  - `scripts/README.md`
  - `doc/DEPLOYMENT.md` 增加脚本执行说明
- 验证结果:
  - `powershell -ExecutionPolicy Bypass -File .\scripts\acceptance_integration.ps1 -DryRun -SkipFrontendCheck` 通过
  - 期间修复: DryRun 缺少登录 token/QA context 模拟数据，已补齐
- 影响评估: 脚本新增，不影响现有业务逻辑。
- 文档更新（新增/修改的 docs 文件与更新点）:
  - 新增 `scripts/README.md`
  - 更新 `doc/DEPLOYMENT.md` 中阶段 6 验收入口

## 待追踪问题
- 真实联调执行依赖本地后端/前端服务已启动。
- 附件上传使用 PowerShell `-Form`，需 PowerShell 7+ 体验更稳定。

## 技术债务记录
- 可后续补一版 Python 脚本以兼容更多终端环境。
