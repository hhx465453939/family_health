# 文件预览 API

## 上传文件预览
- `POST /api/v1/file-preview/extract`
- `multipart/form-data`：`file`

返回：
- `file_name`
- `text`（全文预览）

## 知识库文档预览
- `GET /api/v1/file-preview/kb-documents/{doc_id}?source=raw|sanitized`
- `source=raw` 优先 `source_path`，否则回退到 `masked_path`

## 聊天消息预览
- `GET /api/v1/file-preview/chat-messages/{message_id}`

## 导出候选列表（预览用）
- `POST /api/v1/exports/candidates`
- 与导出创建参数一致，用于在导出前做脱敏预览与规则调整。
