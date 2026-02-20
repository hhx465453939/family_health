# Chat Session Default Role Debug 记录

## 元信息
- 模块名称: chat-session-default-role
- 创建时间: 2026-02-20
- 最后更新: 2026-02-20
- 相关文件:
  - backend/app/services/chat_service.py
  - backend/app/core/config.py
  - doc/DEPLOYMENT.md
  - doc/api/chat.md
  - .env.example
  - backend/README.md
- 依赖模块:
  - app.core.config
  - app.services.role_service
- 用户说明书路径（涉及前端功能时）:
  - 无
- 开发/部署文档路径（涉及后端或环境时）:
  - doc/DEPLOYMENT.md
  - backend/README.md

## 运行上下文与测试规则（首次确认后填写，后续优先读取此处，不再反复询问）
- 运行环境: 待确认
- SSH 方式（若远程）: 待确认
- 远程项目路径（若远程）: 待确认
- 验证/Checkfix 执行方式: 待确认

## 上下文关系网络
- 文件结构
  - 角色库: backend/app/roles/*.md
  - 会话创建: backend/app/services/chat_service.py -> ChatSession(role_id)
  - 配置入口: backend/app/core/config.py (Settings)
- 函数调用链
  - api/v1/chat.create_session_api -> services.chat_service.create_session
  - agent_service._effective_system_prompt -> role_service.get_role_prompt
- 变量依赖图
  - Settings.default_chat_role_id -> chat_service.create_session.resolved_role_id -> ChatSession.role_id
- 数据流向
  - 新建会话请求未传 role_id 时，后端注入默认 role_id

## Debug 历史
### [2026-02-20 00:00] 新建会话默认角色绑定
- 问题描述
  - 需要将 `backend/app/roles/私人医疗架构师.md` 设为新建 chat session 的默认角色。
- 根因定位
  - 当前后端在 `create_session` 里直接写入 `role_id`，未做默认值回退。
- 解决方案
  - 新增配置 `default_chat_role_id`，并在会话创建时当 `role_id` 为空时回退到该配置。
- 代码变更（文件/函数）
  - backend/app/core/config.py: Settings.default_chat_role_id
  - backend/app/services/chat_service.py: create_session
  - doc/DEPLOYMENT.md, doc/api/chat.md, .env.example, backend/README.md: 文档同步
- 验证结果
  - 未执行自动检查（待确认运行环境后补充）。
- 影响评估
  - 新建会话若未显式传 `role_id`，将默认绑定指定角色；显式传 `role_id` 行为不变。
- 文档更新（新增/修改的 docs 文件与更新点）
  - doc/DEPLOYMENT.md: 新增 `FH_DEFAULT_CHAT_ROLE_ID` 说明
  - doc/api/chat.md: 补充 `role_id` 默认行为

## 待追踪问题
- 运行/测试环境未确认，需补充 Checkfix 记录。

## 技术债务记录
- 无
