# 联调验收脚本

脚本路径: `scripts/acceptance_integration.ps1`

## 作用
执行前后端全链路联调验收：
- 登录/初始化 Owner
- 模型配置与模型刷新
- MCP 配置与 QA 绑定
- 聊天会话 + 附件上传 + Agent QA
- 知识库构建与检索
- 导出任务创建与 ZIP 下载

## 使用前提
1. 后端已启动在 `http://localhost:8000`
2. 前端开发服务可选（默认检查 `http://localhost:5173`）

## 执行示例
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\acceptance_integration.ps1
```

跳过前端地址检查：
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\acceptance_integration.ps1 -SkipFrontendCheck
```

仅验证脚本流程（不发真实请求）：
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\acceptance_integration.ps1 -DryRun
```

## 常用参数
- `-BaseUrl` 后端地址（默认 `http://localhost:8000`）
- `-FrontendUrl` 前端地址（默认 `http://localhost:5173`）
- `-OwnerUsername/-OwnerPassword/-OwnerDisplayName` 登录/初始化账号参数

## 失败排查
- `Owner 初始化失败`: 若已初始化会自动跳过；若登录失败请检查密码。
- `检索结果为空`: 确认 KB 构建接口返回 `status=ready`。
- `导出任务未完成`: 检查后端导出任务状态与磁盘写权限。
