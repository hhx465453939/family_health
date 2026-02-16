# MCP API（阶段 3）

## 1) Server 配置
- `POST /api/v1/mcp/servers`
- `GET /api/v1/mcp/servers`
- `PATCH /api/v1/mcp/servers/{id}`
- `DELETE /api/v1/mcp/servers/{id}`
- `POST /api/v1/mcp/servers/{id}/ping`

字段：`name/endpoint/auth_type/auth_payload/enabled/timeout_ms`

## 2) Agent 绑定
- `PUT /api/v1/mcp/bindings/{agent_name}`
- `GET /api/v1/mcp/bindings/{agent_name}`

## 3) 前端模板导入建议
可支持用户粘贴如下 JSON 批量创建工具：

```json
{
  "mcpServers": {
    "mcp-pubmed-llm-server": {
      "command": "npx",
      "args": ["mcp-pubmed-llm-server"]
    }
  }
}
```
