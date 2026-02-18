from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import current_user
from app.core.response import error, ok, trace_id_from_request
from app.models.user import User
from app.schemas.agent import AgentQaRequest
from app.services.agent_service import run_agent_qa, stream_agent_qa
from app.services.role_service import get_role_prompt, list_roles
from app.services.chat_service import ChatError

router = APIRouter()


@router.get("/agent/roles")
def list_agent_roles_api(
    request: Request,
    _: User = Depends(current_user),
):
    trace_id = trace_id_from_request(request)
    return ok({"items": list_roles()}, trace_id)


@router.get("/agent/roles/{role_id}")
def get_agent_role_api(
    role_id: str,
    request: Request,
    _: User = Depends(current_user),
):
    trace_id = trace_id_from_request(request)
    try:
        prompt = get_role_prompt(role_id)
    except FileNotFoundError:
        return error(7101, "Role not found", trace_id, status_code=404)
    return ok({"id": role_id, "prompt": prompt}, trace_id)


@router.post("/agent/qa")
def agent_qa_api(
    payload: AgentQaRequest,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    try:
        result = run_agent_qa(
            db,
            user=user,
            session_id=payload.session_id,
            query=payload.query,
            kb_id=payload.kb_id,
            background_prompt=payload.background_prompt,
            attachments_ids=payload.attachments_ids,
            enabled_mcp_ids=payload.enabled_mcp_ids,
            runtime_profile_id=payload.runtime_profile_id,
        )
    except ChatError as exc:
        return error(exc.code, exc.message, trace_id, status_code=400)
    return ok(result, trace_id)


@router.post("/agent/qa/stream")
def agent_qa_stream_api(
    payload: AgentQaRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    generator = stream_agent_qa(
        db,
        user=user,
        session_id=payload.session_id,
        query=payload.query,
        kb_id=payload.kb_id,
        background_prompt=payload.background_prompt,
        attachments_ids=payload.attachments_ids,
        enabled_mcp_ids=payload.enabled_mcp_ids,
        runtime_profile_id=payload.runtime_profile_id,
    )
    return StreamingResponse(generator, media_type="text/event-stream")
