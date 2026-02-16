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

用于设置全局默认 MCP 列表（如 `agent_name=qa`）。

## 3) 路由策略（已实现）
- 并发上限：`FH_MCP_MAX_PARALLEL_TOOLS`（默认 3）
- 单工具超时字段：`mcp_servers.timeout_ms`
- 降级策略：任一工具失败仅写入 `tool_warnings`，不阻断主回答

## 4) ping 约定（当前）
- `mock://*` -> reachable=true
- `mock://fail*` -> reachable=false
- `http*` -> reachable=true（配置层连通性通过）
