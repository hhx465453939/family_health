from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import current_user, require_roles
from app.core.response import error, ok, trace_id_from_request
from app.models.user import User
from app.schemas.knowledge_base import KnowledgeBaseBuildRequest, KnowledgeBaseCreateRequest
from app.services.knowledge_base_service import (
    KbError,
    build_kb,
    create_kb,
    kb_stats,
    kb_to_dict,
    list_kb,
    list_kb_documents,
    retry_failed_documents,
)

router = APIRouter()


@router.post("/knowledge-bases")
def create_kb_api(
    payload: KnowledgeBaseCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("owner", "admin")),
):
    trace_id = trace_id_from_request(request)
    try:
        row = create_kb(
            db,
            name=payload.name,
            member_scope=payload.member_scope,
            chunk_size=payload.chunk_size,
            chunk_overlap=payload.chunk_overlap,
            top_k=payload.top_k,
            rerank_top_n=payload.rerank_top_n,
            embedding_model_id=payload.embedding_model_id,
            reranker_model_id=payload.reranker_model_id,
        )
    except KbError as exc:
        return error(exc.code, exc.message, trace_id, status_code=400)
    return ok(kb_to_dict(row), trace_id)


@router.get("/knowledge-bases")
def list_kb_api(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("owner", "admin", "member", "viewer")),
):
    trace_id = trace_id_from_request(request)
    return ok({"items": [kb_to_dict(row) for row in list_kb(db)]}, trace_id)


@router.post("/knowledge-bases/{kb_id}/build")
def build_kb_api(
    kb_id: str,
    payload: KnowledgeBaseBuildRequest,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    try:
        result = build_kb(
            db,
            kb_id=kb_id,
            user_id=user.id,
            documents=[item.model_dump() for item in payload.documents],
            clear_existing=False,
        )
    except KbError as exc:
        return error(exc.code, exc.message, trace_id, status_code=400)
    return ok(result, trace_id)


@router.post("/knowledge-bases/{kb_id}/rebuild")
def rebuild_kb_api(
    kb_id: str,
    payload: KnowledgeBaseBuildRequest,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    try:
        result = build_kb(
            db,
            kb_id=kb_id,
            user_id=user.id,
            documents=[item.model_dump() for item in payload.documents],
            clear_existing=True,
        )
    except KbError as exc:
        return error(exc.code, exc.message, trace_id, status_code=400)
    return ok(result, trace_id)


@router.post("/knowledge-bases/{kb_id}/retry-failed")
def retry_failed_api(
    kb_id: str,
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("owner", "admin")),
):
    trace_id = trace_id_from_request(request)
    try:
        retried = retry_failed_documents(db, kb_id=kb_id)
    except KbError as exc:
        return error(exc.code, exc.message, trace_id, status_code=404)
    return ok({"retried": retried}, trace_id)


@router.get("/knowledge-bases/{kb_id}/documents")
def list_kb_documents_api(
    kb_id: str,
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("owner", "admin", "member", "viewer")),
):
    trace_id = trace_id_from_request(request)
    try:
        docs = list_kb_documents(db, kb_id=kb_id)
        stats = kb_stats(db, kb_id=kb_id)
    except KbError as exc:
        return error(exc.code, exc.message, trace_id, status_code=404)
    return ok({"items": docs, "stats": stats}, trace_id)
