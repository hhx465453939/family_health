# 模型配置 API（阶段 1）

## 1) Provider
- `POST /api/v1/model-providers` 创建 provider（登录用户）
- `GET /api/v1/model-providers` 列表
- `PATCH /api/v1/model-providers/{id}` 更新 base_url/api_key/enabled
- `DELETE /api/v1/model-providers/{id}` 删除 provider（同时清理该 provider 的模型目录）
- `POST /api/v1/model-providers/{id}/refresh-models` 刷新模型目录

## 2) 模型目录
- `GET /api/v1/model-catalog?provider_id=&model_type=`
- 返回字段：`id/provider_id/model_name/model_type/capabilities`

## 3) Runtime Profile
- `POST /api/v1/runtime-profiles`
- `PATCH /api/v1/runtime-profiles/{id}`
- `GET /api/v1/runtime-profiles`

说明：前端应支持从模型目录下拉选择 LLM/Embedding/Reranker，而非手填 ID。

## 4) 能力裁剪
- Gemini 允许：`temperature/top_p/max_tokens/reasoning_budget`
- DeepSeek 允许：`temperature/top_p/max_tokens/reasoning_effort`
- 不支持字段会被自动剔除。

## 5) 数据隔离
- Provider/Model Catalog/Runtime Profile 全部按用户隔离，只能访问当前登录账号创建的数据。
