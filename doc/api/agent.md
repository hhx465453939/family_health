# Agent QA API（阶段 2+3）

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
4. 计算 MCP 生效列表：
   - 优先本轮 `enabled_mcp_ids`
   - 否则会话默认 `default_enabled_mcp_ids`
   - 否则使用 `mcp/bindings/qa` 全局绑定
5. 并发执行 MCP，失败降级为 `tool_warnings`。
6. 生成 assistant 回答并入库。

返回：
- `assistant_answer`
- `assistant_message_id`
- `context.history_messages`
- `context.attachment_chunks`
- `context.enabled_mcp_ids`
- `mcp_results`
- `tool_warnings`

说明：当前是本地最小实现，用于跑通阶段 2/3 的上下文与 MCP 链路；后续可替换为真实 LLM/MCP 编排。
