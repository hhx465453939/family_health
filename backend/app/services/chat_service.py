from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.paths import raw_vault_root, sanitized_workspace_root
from app.models.chat_attachment import ChatAttachment
from app.models.chat_message import ChatMessage
from app.models.chat_session import ChatSession
from app.services.desensitization_service import DesensitizationError, sanitize_text


class ChatError(Exception):
    def __init__(self, code: int, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_session(
    db: Session,
    user_id: str,
    title: str,
    runtime_profile_id: str | None,
) -> ChatSession:
    row = ChatSession(
        id=str(uuid4()),
        user_id=user_id,
        title=title,
        runtime_profile_id=runtime_profile_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_sessions(
    db: Session,
    user_id: str,
    query_text: str | None,
    archived: bool | None,
    page: int,
    page_size: int,
) -> tuple[int, list[ChatSession]]:
    query = db.query(ChatSession).filter(
        ChatSession.user_id == user_id, ChatSession.deleted_at.is_(None)
    )
    if query_text:
        like = f"%{query_text}%"
        query = query.filter(or_(ChatSession.title.like(like), ChatSession.summary.like(like)))
    if archived is not None:
        query = query.filter(ChatSession.archived.is_(archived))
    total = query.count()
    items = (
        query.order_by(ChatSession.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return total, items


def _session_for_user(db: Session, session_id: str, user_id: str) -> ChatSession:
    row = (
        db.query(ChatSession)
        .filter(
            ChatSession.id == session_id,
            ChatSession.user_id == user_id,
            ChatSession.deleted_at.is_(None),
        )
        .first()
    )
    if not row:
        raise ChatError(4001, "Session not found")
    return row


def update_session(
    db: Session,
    session_id: str,
    user_id: str,
    title: str | None,
    runtime_profile_id: str | None,
    archived: bool | None,
) -> ChatSession:
    row = _session_for_user(db, session_id, user_id)
    if title is not None:
        row.title = title
    if runtime_profile_id is not None:
        row.runtime_profile_id = runtime_profile_id
    if archived is not None:
        row.archived = archived
    row.updated_at = _now()
    db.commit()
    db.refresh(row)
    return row


def delete_session(db: Session, session_id: str, user_id: str) -> None:
    row = _session_for_user(db, session_id, user_id)
    row.deleted_at = _now()
    row.updated_at = _now()
    db.commit()


def add_message(db: Session, session_id: str, user_id: str, role: str, content: str) -> ChatMessage:
    _session_for_user(db, session_id, user_id)
    msg = ChatMessage(id=str(uuid4()), session_id=session_id, role=role, content=content)
    db.add(msg)
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if session:
        session.updated_at = _now()
    db.commit()
    db.refresh(msg)
    return msg


def list_messages(db: Session, session_id: str, user_id: str) -> list[ChatMessage]:
    _session_for_user(db, session_id, user_id)
    return (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )


def _write_file(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def add_attachment(
    db: Session,
    session_id: str,
    user_id: str,
    file_name: str,
    file_bytes: bytes,
) -> ChatAttachment:
    _session_for_user(db, session_id, user_id)

    attachment_id = str(uuid4())
    raw_path = raw_vault_root() / "chat_attachments" / session_id / f"{attachment_id}_{file_name}"
    sanitized_path = (
        sanitized_workspace_root()
        / "chat_attachments"
        / session_id
        / f"{attachment_id}_{file_name}.md"
    )

    row = ChatAttachment(
        id=attachment_id,
        session_id=session_id,
        file_name=file_name,
        raw_path=str(raw_path),
        sanitized_path=str(sanitized_path),
        parse_status="processing",
    )
    db.add(row)
    _write_file(raw_path, file_bytes)

    try:
        raw_text = file_bytes.decode("utf-8", errors="ignore")
        sanitized_text, _ = sanitize_text(db, user_scope=user_id, text=raw_text)
        sanitized_path.parent.mkdir(parents=True, exist_ok=True)
        sanitized_path.write_text(sanitized_text, encoding="utf-8")
        row.parse_status = "done"
    except DesensitizationError as exc:
        row.parse_status = "error"
        row.error_message = exc.message
        db.commit()
        raise ChatError(exc.code, exc.message) from exc
    except Exception as exc:  # noqa: BLE001
        row.parse_status = "error"
        row.error_message = "Attachment parse failed"
        db.commit()
        raise ChatError(4002, "Attachment parse failed") from exc

    db.commit()
    db.refresh(row)
    return row


def get_attachment_texts(
    db: Session,
    session_id: str,
    user_id: str,
    attachment_ids: list[str],
) -> list[str]:
    _session_for_user(db, session_id, user_id)
    rows = (
        db.query(ChatAttachment)
        .filter(
            ChatAttachment.session_id == session_id,
            ChatAttachment.id.in_(attachment_ids),
        )
        .all()
    )
    if len(rows) != len(set(attachment_ids)):
        raise ChatError(4003, "Attachment not found")

    texts: list[str] = []
    for row in rows:
        if row.parse_status != "done" or not row.sanitized_path:
            raise ChatError(4004, "Attachment is not sanitized and cannot be used")
        path = Path(row.sanitized_path)
        if not path.exists():
            raise ChatError(4004, "Attachment sanitized text missing")
        texts.append(path.read_text(encoding="utf-8"))
    return texts
