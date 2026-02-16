from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.core.response import error, ok, trace_id_from_request
from app.models.agent_mcp_binding import AgentMcpBinding
from app.models.user import User
from app.schemas.mcp import (
    AgentBindingUpdateRequest,
    McpServerCreateRequest,
    McpServerUpdateRequest,
)
from app.services.mcp_service import (
    McpError,
    create_server,
    delete_server,
    list_agent_bindings,
    list_servers,
    ping_server,
    replace_agent_bindings,
    update_server,
)

router = APIRouter()


def _server_to_dict(row) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "endpoint": row.endpoint,
        "auth_type": row.auth_type,
        "enabled": row.enabled,
        "timeout_ms": row.timeout_ms,
        "updated_at": row.updated_at.isoformat(),
    }


def _binding_to_dict(row: AgentMcpBinding) -> dict:
    return {
        "id": row.id,
        "agent_name": row.agent_name,
        "mcp_server_id": row.mcp_server_id,
        "enabled": row.enabled,
        "priority": row.priority,
    }


@router.post("/mcp/servers")
def create_server_api(
    payload: McpServerCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("owner", "admin")),
):
    trace_id = trace_id_from_request(request)
    try:
        row = create_server(
            db,
            name=payload.name,
            endpoint=payload.endpoint,
            auth_type=payload.auth_type,
            auth_payload=payload.auth_payload,
            enabled=payload.enabled,
            timeout_ms=payload.timeout_ms,
        )
    except McpError as exc:
        return error(exc.code, exc.message, trace_id, status_code=400)
    return ok(_server_to_dict(row), trace_id)


@router.get("/mcp/servers")
def list_server_api(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("owner", "admin", "member", "viewer")),
):
    trace_id = trace_id_from_request(request)
    return ok({"items": [_server_to_dict(row) for row in list_servers(db)]}, trace_id)


@router.patch("/mcp/servers/{server_id}")
def update_server_api(
    server_id: str,
    payload: McpServerUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("owner", "admin")),
):
    trace_id = trace_id_from_request(request)
    try:
        row = update_server(
            db,
            server_id=server_id,
            endpoint=payload.endpoint,
            auth_type=payload.auth_type,
            auth_payload=payload.auth_payload,
            enabled=payload.enabled,
            timeout_ms=payload.timeout_ms,
        )
    except McpError as exc:
        status_code = 404 if exc.code == 6002 else 400
        return error(exc.code, exc.message, trace_id, status_code=status_code)
    return ok(_server_to_dict(row), trace_id)


@router.delete("/mcp/servers/{server_id}")
def delete_server_api(
    server_id: str,
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("owner", "admin")),
):
    trace_id = trace_id_from_request(request)
    try:
        delete_server(db, server_id=server_id)
    except McpError as exc:
        return error(exc.code, exc.message, trace_id, status_code=404)
    return ok({"deleted": True}, trace_id)


@router.post("/mcp/servers/{server_id}/ping")
def ping_server_api(
    server_id: str,
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("owner", "admin", "member", "viewer")),
):
    trace_id = trace_id_from_request(request)
    try:
        result = ping_server(db, server_id=server_id)
    except McpError as exc:
        return error(exc.code, exc.message, trace_id, status_code=404)
    return ok(result, trace_id)


@router.put("/mcp/bindings/{agent_name}")
def replace_binding_api(
    agent_name: str,
    payload: AgentBindingUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("owner", "admin")),
):
    trace_id = trace_id_from_request(request)
    try:
        rows = replace_agent_bindings(
            db, agent_name=agent_name, mcp_server_ids=payload.mcp_server_ids
        )
    except McpError as exc:
        return error(exc.code, exc.message, trace_id, status_code=400)
    return ok({"items": [_binding_to_dict(row) for row in rows]}, trace_id)


@router.get("/mcp/bindings/{agent_name}")
def list_binding_api(
    agent_name: str,
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("owner", "admin", "member", "viewer")),
):
    trace_id = trace_id_from_request(request)
    rows = list_agent_bindings(db, agent_name=agent_name)
    return ok({"items": [_binding_to_dict(row) for row in rows]}, trace_id)
