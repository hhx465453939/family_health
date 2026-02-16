from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import current_user
from app.core.response import error, ok, trace_id_from_request
from app.models.user import User
from app.schemas.agent import AgentQaRequest
from app.services.agent_service import run_agent_qa
from app.services.chat_service import ChatError

router = APIRouter()


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
            background_prompt=payload.background_prompt,
            attachments_ids=payload.attachments_ids,
            enabled_mcp_ids=payload.enabled_mcp_ids,
            runtime_profile_id=payload.runtime_profile_id,
        )
    except ChatError as exc:
        return error(exc.code, exc.message, trace_id, status_code=400)
    return ok(result, trace_id)
