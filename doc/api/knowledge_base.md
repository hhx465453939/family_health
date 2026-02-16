# 知识库 API（阶段 4）

- `POST /api/v1/knowledge-bases`
- `GET /api/v1/knowledge-bases`
- `POST /api/v1/knowledge-bases/{id}/build`
- `POST /api/v1/knowledge-bases/{id}/rebuild`
- `POST /api/v1/knowledge-bases/{id}/retry-failed`
- `GET /api/v1/knowledge-bases/{id}/documents`

## 构建行为
- 输入文档 `documents[{title,content}]`
- 后端执行：线性脱敏 -> 写入 `sanitized_workspace/knowledge_bases/` -> 切块入库
- 状态：
  - KB: `draft -> building -> ready|failed`
  - Document: `pending -> processing -> indexed|error`
