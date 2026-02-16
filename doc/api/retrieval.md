# 检索 API（阶段 4）

- `POST /api/v1/retrieval/query`

请求：
```json
{
  "kb_id": "...",
  "query": "高血压 用药",
  "top_k": 5
}
```

返回：
- `items[].chunk_id`
- `items[].document_id`
- `items[].chunk_order`
- `items[].text`
- `items[].source.masked_path`

说明：只返回脱敏域内容，不暴露 raw 路径与 raw 文本。
