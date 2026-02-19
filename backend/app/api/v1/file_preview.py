from pathlib import Path

from fastapi import APIRouter, Depends, File, Request, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import current_user
from app.core.response import error, ok, trace_id_from_request
from app.models.chat_message import ChatMessage
from app.models.chat_session import ChatSession
from app.models.kb_document import KbDocument
from app.models.knowledge_base import KnowledgeBase
from app.models.user import User
from app.services.file_text_extract import extract_text_from_file

router = APIRouter()


@router.post("/file-preview/extract")
async def extract_preview_api(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    _ = user, db
    trace_id = trace_id_from_request(request)
    file_bytes = await file.read()
    file_name = file.filename or "file"
    text = extract_text_from_file(file_name, file_bytes)
    return ok({"file_name": file_name, "text": text}, trace_id)


@router.get("/file-preview/kb-documents/{doc_id}")
def preview_kb_document_api(
    doc_id: str,
    request: Request,
    source: str | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    row = (
        db.query(KbDocument, KnowledgeBase)
        .join(KnowledgeBase, KnowledgeBase.id == KbDocument.kb_id)
        .filter(KbDocument.id == doc_id, KnowledgeBase.user_id == user.id)
        .first()
    )
    if not row:
        return error(7002, "Knowledge base document not found", trace_id, status_code=404)
    doc, _kb = row
    path = doc.source_path if source == "raw" and doc.source_path else doc.masked_path
    if not path:
        return error(7006, "Document preview not available", trace_id, status_code=404)
    file_path = Path(path)
    if not file_path.exists():
        return error(7006, "Document preview not available", trace_id, status_code=404)
    text = extract_text_from_file(file_path.name, file_path.read_bytes())
    return ok({"file_name": file_path.name, "text": text}, trace_id)


@router.get("/file-preview/chat-messages/{message_id}")
def preview_chat_message_api(
    message_id: str,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    row = (
        db.query(ChatMessage)
        .join(ChatSession, ChatSession.id == ChatMessage.session_id)
        .filter(ChatMessage.id == message_id, ChatSession.user_id == user.id)
        .first()
    )
    if not row:
        return error(4003, "Chat message not found", trace_id, status_code=404)
    return ok({"file_name": f"{row.id}.txt", "text": row.content}, trace_id)
