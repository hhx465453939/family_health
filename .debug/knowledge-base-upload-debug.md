# 知识库上传 Debug 记录

## 元信息
- 模块名称: knowledge-base-upload
- 创建时间: 2026-02-19
- 最后更新: 2026-02-19
- 相关文件: backend/app/services/knowledge_base_service.py, backend/app/services/desensitization_service.py, docs/USER_GUIDE.md
- 依赖模块: 脱敏规则、知识库服务
- 用户说明书路径（涉及前端功能时）: docs/USER_GUIDE.md
- 开发/部署文档路径（涉及后端或环境时）:

## 运行上下文与测试规则（首次确认后填写，后续优先读取此处，不再反复询问）
- 运行环境:
- SSH 方式（若远程）:
- 远程项目路径（若远程）:
- 验证/Checkfix 执行方式:

## 上下文关系网络
- 文件结构: KB 上传 -> `upload_kb_document` -> `sanitize_text`
- 函数调用链: API `knowledge_base.upload` -> `upload_kb_document` -> `_create_doc_and_chunks` -> `sanitize_text`
- 变量依赖图: `file_bytes` -> `extract_text_from_file` -> `sanitize_text` -> `KbError`
- 数据流向: 上传文件 -> 文本提取 -> 脱敏 -> 分块入库

## Debug 历史
### [2026-02-19 00:00] KB 上传 DesensitizationError 文案优化
- 问题描述: 内网访问 KB 文档上传失败，前端只显示 `Upload parse failed: DesensitizationError`，缺乏可操作提示。
- 根因定位: `upload_kb_document` 捕获异常时未透传 `DesensitizationError` 的具体原因。
- 解决方案: 对 `DesensitizationError` 透传原始错误信息，提示先配置脱敏规则。
- 代码变更（文件/函数）: `backend/app/services/knowledge_base_service.py`、`docs/USER_GUIDE.md`
- 验证结果: 未执行（待确认运行上下文）
- 影响评估: 仅改变错误提示文案，不影响业务逻辑。
- 文档更新（新增/修改的 docs 文件与更新点）: `docs/USER_GUIDE.md` FAQ 增加 KB 上传失败原因说明。

### [2026-02-19 12:40] 批量上传确认交互修复
- 问题描述: 批量上传时跳到下一份文档后，用户再次点击“确认上传”无明显响应。
- 根因定位: 责任确认勾选在切换文档后被重置，且确认按钮未禁用，导致用户误以为无反应。
- 解决方案: 责任确认保持在批次内有效；确认按钮在未勾选时禁用并提示原因；确认文案在批量场景显示“上传并继续”。
- 代码变更（文件/函数）: `frontend/src/pages/KnowledgeBaseCenter.tsx`
- 验证结果: 未执行（待确认运行上下文）
- 影响评估: 仅改进交互反馈，不影响上传逻辑。

## 待追踪问题
- 确认现场 401 与 KB 上传失败是否同时存在

## 技术债务记录
## 架构决策记录（可选）
