from fastapi import APIRouter, Depends, File, Request, Response, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import current_user
from app.core.response import error, ok, trace_id_from_request
from app.models.desensitization_rule import DesensitizationRule
from app.models.user import User
from app.schemas.chat import (
    ChatMessageCreateRequest,
    ChatBulkSessionRequest,
    ChatSessionCreateRequest,
    ChatSessionUpdateRequest,
    DesensitizationRuleCreateRequest,
)
from app.services.chat_service import (
    ChatError,
    add_attachment,
    add_message,
    bulk_delete_sessions,
    bulk_export_sessions_zip,
    copy_session,
    create_session,
    delete_session,
    export_session_markdown,
    export_session_payload,
    list_messages,
    list_sessions,
    session_to_dict,
    update_session,
)
from app.services.desensitization_service import DesensitizationError, create_rule

router = APIRouter()


@router.post("/chat/sessions")
def create_session_api(
    payload: ChatSessionCreateRequest,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    row = create_session(
        db,
        user_id=user.id,
        title=payload.title,
        runtime_profile_id=payload.runtime_profile_id,
        role_id=payload.role_id,
        background_prompt=payload.background_prompt,
        reasoning_enabled=payload.reasoning_enabled,
        reasoning_budget=payload.reasoning_budget,
        show_reasoning=payload.show_reasoning,
        context_message_limit=payload.context_message_limit,
        default_enabled_mcp_ids=payload.default_enabled_mcp_ids,
    )
    return ok(session_to_dict(row), trace_id)


@router.get("/chat/sessions")
def list_session_api(
    request: Request,
    page: int = 1,
    page_size: int = 20,
    query: str | None = None,
    archived: bool | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    safe_page = max(page, 1)
    safe_page_size = min(max(page_size, 1), 100)
    total, items = list_sessions(
        db,
        user_id=user.id,
        query_text=query,
        archived=archived,
        page=safe_page,
        page_size=safe_page_size,
    )
    return ok({"total": total, "items": [session_to_dict(row) for row in items]}, trace_id)


@router.patch("/chat/sessions/{session_id}")
def update_session_api(
    session_id: str,
    payload: ChatSessionUpdateRequest,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    try:
        row = update_session(
            db,
            session_id=session_id,
            user_id=user.id,
            title=payload.title,
            runtime_profile_id=payload.runtime_profile_id,
            role_id=payload.role_id,
            background_prompt=payload.background_prompt,
            reasoning_enabled=payload.reasoning_enabled,
            reasoning_budget=payload.reasoning_budget,
            show_reasoning=payload.show_reasoning,
            context_message_limit=payload.context_message_limit,
            archived=payload.archived,
            default_enabled_mcp_ids=payload.default_enabled_mcp_ids,
        )
    except ChatError as exc:
        return error(exc.code, exc.message, trace_id, status_code=404)
    return ok(session_to_dict(row), trace_id)


@router.delete("/chat/sessions/{session_id}")
def delete_session_api(
    session_id: str,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    try:
        delete_session(db, session_id=session_id, user_id=user.id)
    except ChatError as exc:
        return error(exc.code, exc.message, trace_id, status_code=404)
    return ok({"deleted": True}, trace_id)


@router.post("/chat/sessions/{session_id}/copy")
def copy_session_api(
    session_id: str,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    try:
        row = copy_session(db, session_id=session_id, user_id=user.id, title_prefix="Copy")
    except ChatError as exc:
        return error(exc.code, exc.message, trace_id, status_code=404)
    return ok(session_to_dict(row), trace_id)


@router.post("/chat/sessions/{session_id}/branch")
def branch_session_api(
    session_id: str,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    try:
        row = copy_session(db, session_id=session_id, user_id=user.id, title_prefix="Branch")
    except ChatError as exc:
        return error(exc.code, exc.message, trace_id, status_code=404)
    return ok(session_to_dict(row), trace_id)


@router.get("/chat/sessions/{session_id}/export")
def export_session_api(
    session_id: str,
    request: Request,
    fmt: str = "md",
    include_reasoning: bool = True,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    try:
        payload = export_session_payload(
            db,
            session_id=session_id,
            user_id=user.id,
            include_reasoning=include_reasoning,
        )
    except ChatError as exc:
        return error(exc.code, exc.message, trace_id, status_code=404)

    if fmt != "md":
        return error(4007, "Unsupported export format", trace_id, status_code=400)
    return Response(
        content=export_session_markdown(payload),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{session_id}.md"'},
    )


@router.post("/chat/sessions/bulk-export")
def bulk_export_session_api(
    payload: ChatBulkSessionRequest,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if not payload.session_ids:
        return error(4006, "No session ids provided", trace_id_from_request(request), status_code=400)
    zip_bytes = bulk_export_sessions_zip(
        db,
        user_id=user.id,
        session_ids=payload.session_ids,
        include_reasoning=True,
    )
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="chat-sessions-export.zip"'},
    )


@router.post("/chat/sessions/bulk-delete")
def bulk_delete_session_api(
    payload: ChatBulkSessionRequest,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    deleted = bulk_delete_sessions(db, user_id=user.id, session_ids=payload.session_ids)
    return ok({"deleted": deleted}, trace_id)


@router.post("/chat/sessions/{session_id}/messages")
def create_message_api(
    session_id: str,
    payload: ChatMessageCreateRequest,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    try:
        row = add_message(
            db,
            session_id=session_id,
            user_id=user.id,
            role=payload.role,
            content=payload.content,
        )
    except ChatError as exc:
        return error(exc.code, exc.message, trace_id, status_code=404)
    return ok({"id": row.id, "role": row.role, "content": row.content}, trace_id)


@router.get("/chat/sessions/{session_id}/messages")
def list_message_api(
    session_id: str,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    try:
        rows = list_messages(db, session_id=session_id, user_id=user.id)
    except ChatError as exc:
        return error(exc.code, exc.message, trace_id, status_code=404)
    return ok(
        {
            "items": [
                {
                    "id": row.id,
                    "role": row.role,
                    "content": row.content,
                    "reasoning_content": row.reasoning_content,
                    "created_at": row.created_at.isoformat(),
                }
                for row in rows
            ]
        },
        trace_id,
    )


@router.post("/chat/sessions/{session_id}/attachments")
async def create_attachment_api(
    session_id: str,
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    file_bytes = await file.read()
    try:
        row = add_attachment(
            db,
            session_id=session_id,
            user_id=user.id,
            file_name=file.filename or "attachment.txt",
            content_type=file.content_type,
            file_bytes=file_bytes,
        )
    except ChatError as exc:
        status_code = 422 if exc.code == 5002 else 400
        return error(exc.code, exc.message, trace_id, status_code=status_code)
    return ok(
        {
            "id": row.id,
            "file_name": row.file_name,
            "parse_status": row.parse_status,
        },
        trace_id,
    )


@router.post("/desensitization/rules")
def create_rule_api(
    payload: DesensitizationRuleCreateRequest,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    try:
        row = create_rule(
            db,
            user_id=user.id,
            member_scope=payload.member_scope,
            rule_type=payload.rule_type,
            pattern=payload.pattern,
            replacement_token=payload.replacement_token,
            enabled=payload.enabled,
        )
    except DesensitizationError as exc:
        return error(exc.code, exc.message, trace_id, status_code=400)
    return ok(
        {
            "id": row.id,
            "member_scope": row.member_scope,
            "rule_type": row.rule_type,
            "pattern": row.pattern,
            "replacement_token": row.replacement_token,
            "enabled": row.enabled,
        },
        trace_id,
    )


@router.get("/desensitization/rules")
def list_rule_api(
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    query = db.query(DesensitizationRule).filter(
        DesensitizationRule.user_id == user.id,
        DesensitizationRule.enabled.is_(True),
    )
    rows = query.order_by(DesensitizationRule.updated_at.asc()).all()
    return ok(
        {
            "items": [
                {
                    "id": row.id,
                    "member_scope": row.member_scope,
                    "rule_type": row.rule_type,
                    "pattern": row.pattern,
                    "replacement_token": row.replacement_token,
                    "enabled": row.enabled,
                }
                for row in rows
            ]
        },
        trace_id,
    )
