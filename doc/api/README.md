# API 文档目录

按后端 API 包维护，每个模块对应一份文档，符合项目 API-First 规范。与 [PRD.md](../PRD.md) §3.4 API 契约及分阶段执行指令一致。

| 模块 | 文档 | 说明 |
|------|------|------|
| 认证与用户 | auth.md | 初始化 Owner、登录、刷新、退出、用户与角色管理（已实现首版） |
| 聊天 | chat.md | 会话 CRUD、消息、附件、归档与软删除、附件脱敏门禁（已实现首版） |
| Agent | agent.md | 问答、上下文组装、会话内附件注入、MCP调用结果回传（已实现最小链路） |
| 模型配置 | model_registry.md | Provider、模型目录刷新、Runtime Profile（已实现首版） |
| MCP | mcp.md | MCP Server 配置、连通性、全局绑定、降级路由（已实现首版） |
| 知识库 | knowledge_base.md | KB CRUD、构建、重建、文档状态（已实现首版） |
| 检索 | retrieval.md | 检索接口、引用来源（仅脱敏域）（已实现首版） |
| 脱敏 | desensitization.md | 线性脱敏规则、双域隔离（阶段 2 已实现最小规则与门禁） |
| 数据导出 | export.md | 导出任务、打包、下载（已实现首版） |
| Pipeline | pipeline.md | 文档入库、转换、脱敏、建库流程（最小流程已实现） |

文档模板见项目根规则：`.cursor/rules/api-first-development.mdc` 中的「API 文档标准模板」。
