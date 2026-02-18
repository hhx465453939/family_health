from fastapi import APIRouter, Depends, File, Request, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import current_user
from app.core.response import error, ok, trace_id_from_request
from app.models.user import User
from app.schemas.knowledge_base import (
    KnowledgeBaseBuildRequest,
    KnowledgeBaseCreateRequest,
    KnowledgeBaseUpdateRequest,
)
from app.services.knowledge_base_service import (
    KbError,
    build_kb,
    create_kb,
    delete_kb,
    delete_kb_document,
    get_kb_global_defaults,
    kb_stats,
    kb_to_dict,
    list_kb,
    list_kb_documents,
    retry_failed_documents,
    update_kb,
    upload_kb_document,
)

router = APIRouter()


@router.post("/knowledge-bases")
def create_kb_api(
    payload: KnowledgeBaseCreateRequest,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    try:
        row = create_kb(
            db,
            user_id=user.id,
            name=payload.name,
            member_scope=payload.member_scope,
            chunk_size=payload.chunk_size,
            chunk_overlap=payload.chunk_overlap,
            top_k=payload.top_k,
            rerank_top_n=payload.rerank_top_n,
            embedding_model_id=payload.embedding_model_id,
            reranker_model_id=payload.reranker_model_id,
            semantic_model_id=payload.semantic_model_id,
            use_global_defaults=payload.use_global_defaults,
            retrieval_strategy=payload.retrieval_strategy,
            keyword_weight=payload.keyword_weight,
            semantic_weight=payload.semantic_weight,
            rerank_weight=payload.rerank_weight,
            strategy_params=payload.strategy_params,
        )
    except KbError as exc:
        return error(exc.code, exc.message, trace_id, status_code=400)
    return ok(kb_to_dict(row), trace_id)


@router.get("/knowledge-bases")
def list_kb_api(
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    return ok({"items": [kb_to_dict(row) for row in list_kb(db, user_id=user.id)]}, trace_id)


@router.get("/knowledge-bases/defaults")
def kb_defaults_api(
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    return ok(get_kb_global_defaults(db, user_id=user.id), trace_id)


@router.patch("/knowledge-bases/{kb_id}")
def update_kb_api(
    kb_id: str,
    payload: KnowledgeBaseUpdateRequest,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    try:
        row = update_kb(db, kb_id=kb_id, user_id=user.id, **payload.model_dump(exclude_unset=True))
    except KbError as exc:
        return error(exc.code, exc.message, trace_id, status_code=400)
    return ok(kb_to_dict(row), trace_id)


@router.delete("/knowledge-bases/{kb_id}")
def delete_kb_api(
    kb_id: str,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    try:
        delete_kb(db, kb_id=kb_id, user_id=user.id)
    except KbError as exc:
        return error(exc.code, exc.message, trace_id, status_code=404)
    return ok({"deleted": True}, trace_id)


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
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    try:
        retried = retry_failed_documents(db, kb_id=kb_id, user_id=user.id)
    except KbError as exc:
        return error(exc.code, exc.message, trace_id, status_code=404)
    return ok({"retried": retried}, trace_id)


@router.get("/knowledge-bases/{kb_id}/documents")
def list_kb_documents_api(
    kb_id: str,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    try:
        docs = list_kb_documents(db, kb_id=kb_id, user_id=user.id)
        stats = kb_stats(db, kb_id=kb_id, user_id=user.id)
    except KbError as exc:
        return error(exc.code, exc.message, trace_id, status_code=404)
    return ok({"items": docs, "stats": stats}, trace_id)


@router.post("/knowledge-bases/{kb_id}/documents/upload")
async def upload_kb_document_api(
    kb_id: str,
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    file_bytes = await file.read()
    try:
        result = upload_kb_document(
            db,
            kb_id=kb_id,
            user_id=user.id,
            file_name=file.filename or "document.txt",
            file_bytes=file_bytes,
        )
    except KbError as exc:
        return error(exc.code, exc.message, trace_id, status_code=400)
    return ok(result, trace_id)


@router.delete("/knowledge-bases/{kb_id}/documents/{doc_id}")
def delete_kb_document_api(
    kb_id: str,
    doc_id: str,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    try:
        delete_kb_document(db, kb_id=kb_id, doc_id=doc_id, user_id=user.id)
    except KbError as exc:
        return error(exc.code, exc.message, trace_id, status_code=404)
    return ok({"deleted": True}, trace_id)
