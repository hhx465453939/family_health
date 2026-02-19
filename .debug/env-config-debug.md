# 环境变量与端口联动 Debug 记录

## 元信息
- 模块名称: env-config
- 创建时间: 2026-02-19
- 最后更新: 2026-02-19
- 相关文件: backend/app/core/config.py, backend/app/__main__.py, frontend/vite.config.ts, doc/DEPLOYMENT.md, backend/README.md, README.md, .env.example
- 依赖模块: 前端开发代理、后端启动配置
- 用户说明书路径（涉及前端功能时）:
- 开发/部署文档路径（涉及后端或环境时）: doc/DEPLOYMENT.md

## 运行上下文与测试规则（首次确认后填写，后续优先读取此处，不再反复询问）
- 运行环境:
- SSH 方式（若远程）:
- 远程项目路径（若远程）:
- 验证/Checkfix 执行方式:

## 上下文关系网络
- 文件结构: 后端 `app` 入口与配置 + 前端 Vite 代理配置 + 统一 `.env`
- 函数调用链: `python -m app` -> `uvicorn.run` -> `app.main:app`
- 变量依赖图: `FH_SERVER_HOST/FH_SERVER_PORT` -> 后端启动参数 + 前端代理 target
- 数据流向: 浏览器 -> Vite 代理 -> 后端 API

## Debug 历史
### [2026-02-19 00:00] 统一后端端口环境变量
- 问题描述: 后端端口固定为 8000，端口冲突时前后端联动不便。
- 根因定位: 前端代理目标写死在 `frontend/vite.config.ts`，后端启动依赖命令参数。
- 解决方案: 使用仓库根 `.env` 作为中间层，后端启动脚本读取 `FH_SERVER_HOST/FH_SERVER_PORT`，前端代理从同一环境变量计算 target。
- 代码变更（文件/函数）: `backend/app/core/config.py`、`backend/app/__main__.py`、`frontend/vite.config.ts`、`doc/DEPLOYMENT.md`、`backend/README.md`、`README.md`、`.env.example`
- 验证结果: 未执行（待确认运行上下文）
- 影响评估: 仅影响开发启动方式与代理目标；API 路由与业务逻辑不变。
- 文档更新（新增/修改的 docs 文件与更新点）: `doc/DEPLOYMENT.md`、`README.md` 增加统一端口配置说明。

## 待追踪问题
- 确认项目运行上下文与可用的验证命令

## 技术债务记录
## 架构决策记录（可选）
