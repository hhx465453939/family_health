# 模型配置 API（阶段 1）

## 1) Provider
- `POST /api/v1/model-providers` 创建 provider（登录用户）
- `GET /api/v1/model-providers` 列表
- `GET /api/v1/model-provider-presets` 获取预置供应商模板（登录用户）
- `PATCH /api/v1/model-providers/{id}` 更新 base_url/api_key/enabled
- `DELETE /api/v1/model-providers/{id}` 删除 provider（同时清理该 provider 的模型目录）
- `POST /api/v1/model-providers/{id}/refresh-models` 刷新模型目录

预置模板包含：
- Gemini: `https://generativelanguage.googleapis.com/v1beta/models`
- OpenAI: `https://api.openai.com/v1/chat/completions`
- Zhipu Chat: `https://open.bigmodel.cn/api/paas/v4/chat/completions`
- Zhipu Coding: `https://open.bigmodel.cn/api/coding/paas/v4/chat/completions`
- SiliconFlow: `https://api.siliconflow.cn/v1/chat/completions`
- OpenRouter: `https://openrouter.ai/api/v1/chat/completions`
- Custom（空 base_url，供用户自定义）

去重规则：
- 同一用户下，按 `(provider_name, base_url)` 组合去重。
- 因此同一供应商名可配置多个不同端点。

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
