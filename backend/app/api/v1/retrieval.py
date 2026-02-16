from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.core.response import error, ok, trace_id_from_request
from app.models.user import User
from app.schemas.knowledge_base import RetrievalQueryRequest
from app.services.knowledge_base_service import KbError, retrieve_from_kb

router = APIRouter()


@router.post("/retrieval/query")
def retrieval_query_api(
    payload: RetrievalQueryRequest,
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("owner", "admin", "member", "viewer")),
):
    trace_id = trace_id_from_request(request)
    try:
        items = retrieve_from_kb(
            db,
            kb_id=payload.kb_id,
            query=payload.query,
            top_k=payload.top_k,
        )
    except KbError as exc:
        return error(exc.code, exc.message, trace_id, status_code=400)
    return ok({"items": items}, trace_id)
