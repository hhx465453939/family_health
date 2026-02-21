# Frontend Auth Session Debug 记录

## 元信息
- 模块名称: frontend-auth-session
- 创建时间: 2026-02-18
- 最后更新: 2026-02-19
- 相关文件: `frontend/src/api/client.ts`, `frontend/src/App.tsx`, `frontend/src/pages/AuthPage.tsx`, `docs/USER_GUIDE.md`
- 依赖模块: auth, settings-center, chat-center
- 用户说明书路径（涉及前端功能时）: `docs/USER_GUIDE.md`
- 开发/部署文档路径（涉及后端或环境时）: N/A

## 运行上下文与测试规则（首次确认后填写，后续优先读取此处，不再反复询问）
- 运行环境: 本机 Windows
- SSH 方式（若远程）: N/A
- 远程项目路径（若远程）: N/A
- 验证/Checkfix 执行方式: 前端目录执行 `npm run build`

## 上下文关系网络
- 文件结构
  - `frontend/src/api/client.ts`: 统一请求封装与 401 判断
  - `frontend/src/App.tsx`: 会话持久化与页面级登录态控制
  - `frontend/src/pages/AuthPage.tsx`: 登录页提示展示
- 函数调用链
  - 页面请求 -> `request()` -> 401 -> `AUTH_EXPIRED_EVENT` -> `App` 清理 session -> 回到 `AuthPage`
- 变量依赖图
  - `authExpiredNotified` 防止同一轮 401 重复触发事件
  - `authMessage` 用于把“登录失效”提示带到登录页
- 数据流向
  - localStorage token -> API Authorization -> 401 -> 清理 localStorage -> 用户重新登录

## Debug 历史
### [2026-02-19 00:00] 本地会话结构校验
- 问题描述
  - 内网访问时出现多次 401，可能源于本地缓存的损坏会话或缺失 token。
- 根因定位
  - `loadSession()` 未校验 `token/role/userId`，损坏数据也会进入工作区并触发鉴权失败。
- 解决方案
  - 读取 localStorage 时校验必要字段，缺失则视为未登录。
- 代码变更（文件/函数）
  - `frontend/src/App.tsx`: `loadSession()` 增加字段校验
- 验证结果
  - 待执行前端构建检查。
- 影响评估
  - 仅影响本地会话恢复逻辑，不影响登录流程。

### [2026-02-18 16:45] 配置页/聊天页连续 401 修复
- 问题描述
  - F12 显示大量 `401 Unauthorized`，配置页和聊天页均报错。
- 根因定位
  - 前端使用了过期/失效 token，多个页面并发请求导致 401 集中出现。
  - 之前仅提示错误，没有全局退出登录机制，导致用户停留在失效会话里。
- 解决方案
  - 在 API 层识别鉴权类 401 并派发全局 `AUTH_EXPIRED_EVENT`。
  - `App` 监听事件后清理会话并回到登录页。
  - 登录页支持接收初始提示信息，明确告知“登录状态已失效，请重新登录”。
- 代码变更（文件/函数）
  - `frontend/src/api/client.ts`: `AUTH_EXPIRED_EVENT`、`notifyAuthExpired`
  - `frontend/src/App.tsx`: 监听事件并清理 session
  - `frontend/src/pages/AuthPage.tsx`: 新增 `initialMessage` 支持
  - `docs/USER_GUIDE.md`: 补充连续 401 排查
- 验证结果
  - 待执行前端构建检查。
- 影响评估
  - 不改变后端鉴权规则，仅改前端失效会话处理逻辑。
- 文档更新（新增/修改的 docs 文件与更新点）
  - 修改 `docs/USER_GUIDE.md`

### [2026-02-19 13:20] 记住我（14 天免登录）
- 问题描述
  - 登录状态易过期，用户聊天中途被登出。
- 根因定位
  - 前端仅使用 localStorage 存储 token，没有过期策略与“记住我”区分。
- 解决方案
  - 登录页新增“记住我（14天内免登录）”选项。
  - 勾选时将会话写入 localStorage 并设置 14 天有效期；未勾选时写入 sessionStorage。
  - 读取会话时校验过期并自动清理。
- 代码变更（文件/函数）
  - `frontend/src/pages/AuthPage.tsx`
  - `frontend/src/App.tsx`
  - `frontend/src/api/types.ts`
  - `docs/USER_GUIDE.md`
- 验证结果
  - `npm run build` 通过
- 影响评估
  - 仅改进登录持久化逻辑，不影响后端鉴权策略。

### [2026-02-21 12:10] 自动续期与 2 小时会话
- 问题描述
  - 用户使用过程中 401 被强制登出，希望会话至少 1-2 小时并自动续期。
- 根因定位
  - access token 默认 15 分钟且前端不做 refresh 自动续期。
- 解决方案
  - 前端统一请求在 401 时尝试 `/auth/refresh` 并重试。
  - 登录后保存 refresh token；应用定时（2 小时）触发 refresh。
- 代码变更（文件/函数）
  - `frontend/src/api/client.ts`
  - `frontend/src/App.tsx`
  - `frontend/src/pages/AuthPage.tsx`
  - `frontend/src/api/types.ts`
- 验证结果
  - 待执行前端构建检查。
- 影响评估
  - 401 更少触发强制登出，长会话更稳定。

## 待追踪问题
- 已实现 refresh token 自动续期；如需静默续期失败的监控与提示可再补充。

## 技术债务记录
- 当前策略为“401 直接回登录”，未做静默续期。
