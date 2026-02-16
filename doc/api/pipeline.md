# Pipeline API（阶段 4 最小约定）

当前版本以知识库构建接口承载 pipeline 最小流程：
- 输入文档文本（可视为 PDF/Markdown 转换结果）
- 执行线性脱敏与映射存储
- 入 `sanitized_workspace` 并切块索引

后续将补充：
- PDF/Office 自动解析任务 API
- 手动上传已脱敏 Markdown API
- 人工脱敏校对工作流 API
