# Agent QA API（阶段 2+3）

- `POST /api/v1/agent/qa`

请求：
```json
{
  "session_id": "...",
  "query": "",
  "background_prompt": "你是一名家庭医生",
  "enabled_mcp_ids": ["mcp-a"],
  "runtime_profile_id": null,
  "attachments_ids": ["att-1"]
}
```

行为：
1. 写入用户消息（可含背景提示词）。
2. 读取会话历史并按窗口裁剪。
3. 仅加载 `parse_status=done` 的脱敏附件文本。
4. 支持“仅附件模式”：`query` 可为空，但 `attachments_ids` 至少一个。
5. 计算 MCP 生效列表：本轮 > 会话默认 > 全局绑定。
6. 并发执行 MCP，失败降级为 `tool_warnings`。
7. 生成 assistant 回答并入库。
