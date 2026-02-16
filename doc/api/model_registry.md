# 模型配置 API（阶段 1）

## 1) Provider
- `POST /api/v1/model-providers` 创建 provider（Owner/Admin）
- `GET /api/v1/model-providers` 列表
- `PATCH /api/v1/model-providers/{id}` 更新 base_url/api_key/enabled
- `POST /api/v1/model-providers/{id}/refresh-models` 刷新模型目录

请求示例：
```json
{
  "provider_name": "gemini",
  "base_url": "https://example.local/gemini",
  "api_key": "***",
  "enabled": true
}
```

## 2) 模型目录
- `GET /api/v1/model-catalog?provider_id=&model_type=`
- 返回字段：`id/provider_id/model_name/model_type/capabilities`

## 3) Runtime Profile
- `POST /api/v1/runtime-profiles`
- `PATCH /api/v1/runtime-profiles/{id}`
- `GET /api/v1/runtime-profiles`

请求示例：
```json
{
  "name": "default",
  "llm_model_id": "...",
  "embedding_model_id": null,
  "reranker_model_id": null,
  "params": {
    "temperature": 0.2,
    "reasoning_budget": 128
  },
  "is_default": true
}
```

## 4) 能力裁剪
- Gemini 允许：`temperature/top_p/max_tokens/reasoning_budget`
- DeepSeek 允许：`temperature/top_p/max_tokens/reasoning_effort`
- 不支持字段会被自动剔除。
