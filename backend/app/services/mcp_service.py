from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.crypto import encrypt_text
from app.models.agent_mcp_binding import AgentMcpBinding
from app.models.mcp_server import McpServer


class McpError(Exception):
    def __init__(self, code: int, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_server(
    db: Session,
    user_id: str,
    name: str,
    endpoint: str,
    auth_type: str,
    auth_payload: str | None,
    enabled: bool,
    timeout_ms: int,
) -> McpServer:
    if (
        db.query(McpServer)
        .filter(McpServer.user_id == user_id, McpServer.name == name)
        .first()
    ):
        raise McpError(6001, "MCP server name already exists")
    row = McpServer(
        id=str(uuid4()),
        user_id=user_id,
        name=name,
        endpoint=endpoint,
        auth_type=auth_type,
        auth_payload_encrypted=encrypt_text(auth_payload) if auth_payload else None,
        enabled=enabled,
        timeout_ms=timeout_ms,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_server(
    db: Session,
    user_id: str,
    server_id: str,
    endpoint: str | None,
    auth_type: str | None,
    auth_payload: str | None,
    enabled: bool | None,
    timeout_ms: int | None,
) -> McpServer:
    row = (
        db.query(McpServer)
        .filter(McpServer.id == server_id, McpServer.user_id == user_id)
        .first()
    )
    if not row:
        raise McpError(6002, "MCP server not found")
    if endpoint is not None:
        row.endpoint = endpoint
    if auth_type is not None:
        row.auth_type = auth_type
    if auth_payload is not None:
        row.auth_payload_encrypted = encrypt_text(auth_payload)
    if enabled is not None:
        row.enabled = enabled
    if timeout_ms is not None:
        row.timeout_ms = timeout_ms
    row.updated_at = _now()
    db.commit()
    db.refresh(row)
    return row


def list_servers(db: Session, user_id: str) -> list[McpServer]:
    return (
        db.query(McpServer)
        .filter(McpServer.user_id == user_id)
        .order_by(McpServer.updated_at.desc())
        .all()
    )


def delete_server(db: Session, user_id: str, server_id: str) -> None:
    row = (
        db.query(McpServer)
        .filter(McpServer.id == server_id, McpServer.user_id == user_id)
        .first()
    )
    if not row:
        raise McpError(6002, "MCP server not found")
    db.query(AgentMcpBinding).filter(
        AgentMcpBinding.user_id == user_id,
        AgentMcpBinding.mcp_server_id == server_id,
    ).delete()
    db.delete(row)
    db.commit()


def ping_server(db: Session, user_id: str, server_id: str) -> dict:
    row = (
        db.query(McpServer)
        .filter(McpServer.id == server_id, McpServer.user_id == user_id)
        .first()
    )
    if not row:
        raise McpError(6002, "MCP server not found")
    if row.endpoint.startswith("mock://fail"):
        return {"reachable": False, "reason": "simulated failure"}
    if row.endpoint.startswith("mock://") or row.endpoint.startswith("http"):
        return {"reachable": True, "reason": "ok"}
    return {"reachable": False, "reason": "unsupported endpoint"}


def get_effective_server_ids(
    db: Session,
    user_id: str,
    agent_name: str,
    session_default_ids: list[str],
    request_override_ids: list[str] | None,
) -> list[str]:
    if request_override_ids is not None:
        return request_override_ids
    if session_default_ids:
        return session_default_ids
    bindings = (
        db.query(AgentMcpBinding)
        .filter(
            AgentMcpBinding.user_id == user_id,
            AgentMcpBinding.agent_name == agent_name,
            AgentMcpBinding.enabled.is_(True),
        )
        .order_by(AgentMcpBinding.priority.asc())
        .all()
    )
    return [b.mcp_server_id for b in bindings]


def replace_agent_bindings(
    db: Session, user_id: str, agent_name: str, mcp_server_ids: list[str]
) -> list[AgentMcpBinding]:
    valid_ids = {
        row.id
        for row in db.query(McpServer)
        .filter(McpServer.user_id == user_id, McpServer.id.in_(mcp_server_ids))
        .all()
    }
    for item in mcp_server_ids:
        if item not in valid_ids:
            raise McpError(6003, f"MCP server not found: {item}")

    db.query(AgentMcpBinding).filter(
        AgentMcpBinding.user_id == user_id,
        AgentMcpBinding.agent_name == agent_name,
    ).delete()
    rows: list[AgentMcpBinding] = []
    for idx, server_id in enumerate(mcp_server_ids):
        row = AgentMcpBinding(
            id=str(uuid4()),
            user_id=user_id,
            agent_name=agent_name,
            mcp_server_id=server_id,
            enabled=True,
            priority=idx,
        )
        db.add(row)
        rows.append(row)
    db.commit()
    return rows


def list_agent_bindings(db: Session, user_id: str, agent_name: str) -> list[AgentMcpBinding]:
    return (
        db.query(AgentMcpBinding)
        .filter(AgentMcpBinding.user_id == user_id, AgentMcpBinding.agent_name == agent_name)
        .order_by(AgentMcpBinding.priority.asc())
        .all()
    )


def _call_single_tool(server: McpServer, query: str) -> dict[str, Any]:
    if server.endpoint.startswith("mock://fail"):
        raise TimeoutError("simulated timeout")
    return {
        "server_id": server.id,
        "server_name": server.name,
        "output": f"[{server.name}] {query}",
    }


def route_tools(
    db: Session,
    user_id: str,
    enabled_server_ids: list[str],
    query: str,
) -> dict:
    if not enabled_server_ids:
        return {"results": [], "warnings": []}

    servers = (
        db.query(McpServer)
        .filter(
            McpServer.user_id == user_id,
            McpServer.id.in_(enabled_server_ids),
            McpServer.enabled.is_(True),
        )
        .all()
    )
    by_id = {row.id: row for row in servers}
    warnings: list[str] = []
    ordered_servers: list[McpServer] = []
    for sid in enabled_server_ids:
        row = by_id.get(sid)
        if row:
            ordered_servers.append(row)
        else:
            warnings.append(f"MCP server unavailable: {sid}")

    max_workers = min(settings.mcp_max_parallel_tools, max(len(ordered_servers), 1))
    results: list[dict] = []

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {
            pool.submit(_call_single_tool, server, query): server for server in ordered_servers
        }
        for future in as_completed(futures):
            server = futures[future]
            try:
                results.append(future.result(timeout=server.timeout_ms / 1000))
            except Exception as exc:  # noqa: BLE001
                warnings.append(f"MCP {server.name} failed: {exc}")

    return {"results": results, "warnings": warnings}
