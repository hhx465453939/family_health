# 部署与 Quickstart Debug 记录

## 元信息
- 模块名称: deployment-quickstart
- 创建时间: 2026-02-19
- 最后更新: 2026-02-19
- 相关文件: quickstart.py, README.md, doc/DEPLOYMENT.md
- 依赖模块: 后端启动、前端启动、环境变量
- 用户说明书路径（涉及前端功能时）: docs/USER_GUIDE.md
- 开发/部署文档路径（涉及后端或环境时）: doc/DEPLOYMENT.md

## 运行上下文与测试规则（首次确认后填写，后续优先读取此处，不再反复询问）
- 运行环境: NAS Ubuntu 24（本机）
- SSH 方式（若远程）: N/A
- 远程项目路径（若远程）: /home/damncheater/Development/family_health
- 验证/Checkfix 执行方式: 直接在本机终端执行

## 上下文关系网络
- 文件结构: quickstart.py -> backend/uv + frontend/npm
- 函数调用链: quickstart -> uv venv/sync -> python -m app; npm install -> npm run dev
- 变量依赖图: .env (FH_SERVER_HOST/FH_SERVER_PORT/FH_DATA_ROOT)
- 数据流向: .env -> 后端配置 -> 数据目录

## Debug 历史
### [2026-02-19 03:30] Quickstart 脚本与 systemd 部署文档
- 问题描述: 需要一键启动脚本与完整服务化部署说明。
- 根因定位: 缺少自动化启动入口与 systemd 模板。
- 解决方案: 新增 `quickstart.py`；README 增加 Quickstart；DEPLOYMENT 增加 systemd 服务部署与管理命令。
- 代码变更（文件/函数）: `quickstart.py`, `README.md`, `doc/DEPLOYMENT.md`
- 验证结果: 未执行（需用户本机运行 quickstart）
- 影响评估: 启动流程更清晰，部署运维更标准化。
