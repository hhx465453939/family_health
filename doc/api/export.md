# 导出 API（阶段 4）

- `POST /api/v1/exports/jobs`
- `GET /api/v1/exports/jobs`
- `GET /api/v1/exports/jobs/{id}`
- `GET /api/v1/exports/jobs/{id}/download`
- `DELETE /api/v1/exports/jobs/{id}`

## 创建任务示例
```json
{
  "member_scope": "global",
  "export_types": ["chat", "kb"],
  "include_raw_file": false,
  "include_sanitized_text": true,
  "filters": {"chat_limit": 200}
}
```

## 打包输出
- ZIP 包含 `manifest.json`
- `chat/*.json`
- `kb/*.md`（仅脱敏文本）
