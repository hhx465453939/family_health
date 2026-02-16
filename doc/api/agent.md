# Agent QA API（阶段 2 最小链路）

- `POST /api/v1/agent/qa`

请求：
```json
{
  "session_id": "...",
  "query": "请总结附件重点",
  "enabled_mcp_ids": ["mcp-a"],
  "runtime_profile_id": null,
  "attachments_ids": ["att-1"]
}
```

行为：
1. 写入用户消息。
2. 读取会话历史并按窗口裁剪。
3. 仅加载 `parse_status=done` 的脱敏附件文本。
4. 生成 assistant 回答并入库。

返回：
- `assistant_answer`
- `assistant_message_id`
- `context.history_messages`
- `context.attachment_chunks`
- `context.enabled_mcp_ids`

说明：当前是本地最小实现，用于跑通阶段 2 的上下文/门禁链路；后续可替换为真实 LLM/MCP 编排。
