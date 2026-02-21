# 鉴权 401 Debug 记录

## 元信息
- 模块名称: auth-401
- 创建时间: 2026-02-19
- 最后更新: 2026-02-19
- 相关文件: frontend/src/api/client.ts, frontend/src/App.tsx
- 依赖模块: 登录/会话管理
- 用户说明书路径（涉及前端功能时）: docs/USER_GUIDE.md
- 开发/部署文档路径（涉及后端或环境时）: doc/DEPLOYMENT.md

## 运行上下文与测试规则（首次确认后填写，后续优先读取此处，不再反复询问）
- 运行环境: NAS Ubuntu 24（本机）
- SSH 方式（若远程）: N/A
- 远程项目路径（若远程）: /home/damncheater/Development/family_health
- 验证/Checkfix 执行方式: 直接在本机终端执行

## Debug 历史
### [2026-02-19 04:40] 401 自动登出
- 问题描述: 后端返回 401 时前端未触发自动登出，导致持续请求报错。
- 根因定位: 401 错误消息匹配过窄，未覆盖 FastAPI 常见文案。
- 解决方案: 扩展 401 错误匹配（Not authenticated/Invalid authentication credentials/Unauthorized），并在 SSE 流中触发登出。
- 代码变更（文件/函数）: `frontend/src/api/client.ts`
- 验证结果: 前端 `npm run build` ✅
- 影响评估: 401 时能及时退出并提示重新登录。

### [2026-02-21 11:40] 自动登出时间核对
- 问题描述: 用户反馈使用中被自动登出，服务日志出现 401。
- 根因定位: access token 默认 15 分钟过期；前端无自动 refresh 机制，过期后任意请求返回 401 并触发登出。
- 解决方案: 提醒通过环境变量调整 `FH_ACCESS_TOKEN_EXPIRE_MINUTES`；如需长会话，考虑实现 refresh token 自动续期。
- 代码变更（文件/函数）: 无
- 验证结果: N/A（仅配置与逻辑确认）
- 影响评估: 登录体验受 access token 过期影响，长时操作会被强制退出。

### [2026-02-21 12:10] 2 小时 access token + 自动续期
- 问题描述: 用户希望会话至少 1-2 小时且自动续期。
- 根因定位: access token 过期后前端直接登出，没有 refresh 自动续期。
- 解决方案:
  - access token 默认值调整为 120 分钟；
  - 前端在 401 时自动调用 `/auth/refresh` 并重试请求；
  - stream 与附件上传等非标准请求也支持 refresh 重试。
- 代码变更（文件/函数）:
  - `backend/app/core/config.py`
  - `frontend/src/api/client.ts`
  - `frontend/src/App.tsx`
  - `frontend/src/pages/AuthPage.tsx`
  - `frontend/src/api/types.ts`
  - `docs/USER_GUIDE.md`, `doc/DEPLOYMENT.md`, `.env.example`
- 验证结果: N/A（待手动验证）
- 影响评估: 401 将优先尝试续期；refresh 失败才会登出。
