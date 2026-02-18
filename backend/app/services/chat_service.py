from __future__ import annotations

import json
import zipfile
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.paths import raw_vault_root, sanitized_workspace_root
from app.models.chat_attachment import ChatAttachment
from app.models.chat_message import ChatMessage
from app.models.chat_session import ChatSession
from app.services.desensitization_service import DesensitizationError, sanitize_text
from app.services.file_text_extract import extract_text_from_file, safe_storage_name


class ChatError(Exception):
    def __init__(self, code: int, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _dump_mcp_ids(ids: list[str]) -> str:
    return json.dumps(ids, ensure_ascii=False)


def _load_mcp_ids(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    return [item for item in data if isinstance(item, str)]


def session_to_dict(row: ChatSession) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "archived": row.archived,
        "runtime_profile_id": row.runtime_profile_id,
        "role_id": row.role_id,
        "background_prompt": row.background_prompt,
        "reasoning_enabled": row.reasoning_enabled,
        "reasoning_budget": row.reasoning_budget,
        "show_reasoning": row.show_reasoning,
        "context_message_limit": row.context_message_limit,
        "default_enabled_mcp_ids": _load_mcp_ids(row.default_enabled_mcp_ids_json),
        "updated_at": row.updated_at.isoformat(),
    }


def create_session(
    db: Session,
    user_id: str,
    title: str,
    runtime_profile_id: str | None,
    role_id: str | None,
    background_prompt: str | None,
    reasoning_enabled: bool | None,
    reasoning_budget: int | None,
    show_reasoning: bool,
    context_message_limit: int,
    default_enabled_mcp_ids: list[str],
) -> ChatSession:
    row = ChatSession(
        id=str(uuid4()),
        user_id=user_id,
        title=title,
        runtime_profile_id=runtime_profile_id,
        role_id=role_id,
        background_prompt=background_prompt,
        reasoning_enabled=reasoning_enabled,
        reasoning_budget=reasoning_budget,
        show_reasoning=show_reasoning,
        context_message_limit=context_message_limit,
        default_enabled_mcp_ids_json=_dump_mcp_ids(default_enabled_mcp_ids),
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


def get_session_for_user(db: Session, session_id: str, user_id: str) -> ChatSession:
    return _session_for_user(db, session_id, user_id)


def update_session(
    db: Session,
    session_id: str,
    user_id: str,
    title: str | None,
    runtime_profile_id: str | None,
    role_id: str | None,
    background_prompt: str | None,
    reasoning_enabled: bool | None,
    reasoning_budget: int | None,
    show_reasoning: bool | None,
    context_message_limit: int | None,
    archived: bool | None,
    default_enabled_mcp_ids: list[str] | None,
) -> ChatSession:
    row = _session_for_user(db, session_id, user_id)
    if title is not None:
        row.title = title
    if runtime_profile_id is not None:
        row.runtime_profile_id = runtime_profile_id
    if role_id is not None:
        row.role_id = role_id
    if background_prompt is not None:
        row.background_prompt = background_prompt
    if reasoning_enabled is not None:
        row.reasoning_enabled = reasoning_enabled
    if reasoning_budget is not None:
        row.reasoning_budget = reasoning_budget
    if show_reasoning is not None:
        row.show_reasoning = show_reasoning
    if context_message_limit is not None:
        row.context_message_limit = context_message_limit
    if archived is not None:
        row.archived = archived
    if default_enabled_mcp_ids is not None:
        row.default_enabled_mcp_ids_json = _dump_mcp_ids(default_enabled_mcp_ids)
    row.updated_at = _now()
    db.commit()
    db.refresh(row)
    return row


def delete_session(db: Session, session_id: str, user_id: str) -> None:
    row = _session_for_user(db, session_id, user_id)
    row.deleted_at = _now()
    row.updated_at = _now()
    db.commit()


def add_message(
    db: Session,
    session_id: str,
    user_id: str,
    role: str,
    content: str,
    reasoning_content: str | None = None,
) -> ChatMessage:
    _session_for_user(db, session_id, user_id)
    msg = ChatMessage(
        id=str(uuid4()),
        session_id=session_id,
        role=role,
        content=content,
        reasoning_content=reasoning_content,
    )
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
    content_type: str | None,
    file_bytes: bytes,
) -> ChatAttachment:
    _session_for_user(db, session_id, user_id)

    attachment_id = str(uuid4())
    safe_name = safe_storage_name(file_name, fallback="attachment.txt")
    raw_path = raw_vault_root() / "chat_attachments" / session_id / f"{attachment_id}_{safe_name}"
    sanitized_path = (
        sanitized_workspace_root()
        / "chat_attachments"
        / session_id
        / f"{attachment_id}_{safe_name}.md"
    )

    row = ChatAttachment(
        id=attachment_id,
        session_id=session_id,
        file_name=file_name,
        raw_path=str(raw_path),
        sanitized_path=str(sanitized_path),
        content_type=content_type,
        is_image=bool(content_type and content_type.startswith("image/")),
        parse_status="processing",
    )
    db.add(row)
    _write_file(raw_path, file_bytes)

    try:
        raw_text = extract_text_from_file(file_name, file_bytes)
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
        row.error_message = f"Attachment parse failed: {type(exc).__name__}"
        db.commit()
        raise ChatError(4002, f"Attachment parse failed: {type(exc).__name__}") from exc

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


def get_attachment_meta(
    db: Session,
    session_id: str,
    user_id: str,
    attachment_ids: list[str],
) -> list[dict]:
    _session_for_user(db, session_id, user_id)
    rows = (
        db.query(ChatAttachment)
        .filter(ChatAttachment.session_id == session_id, ChatAttachment.id.in_(attachment_ids))
        .all()
    )
    out: list[dict] = []
    for row in rows:
        out.append(
            {
                "id": row.id,
                "file_name": row.file_name,
                "content_type": row.content_type or "",
                "is_image": bool(row.is_image),
            }
        )
    return out


def get_session_default_mcp_ids(db: Session, session_id: str, user_id: str) -> list[str]:
    session = _session_for_user(db, session_id, user_id)
    return _load_mcp_ids(session.default_enabled_mcp_ids_json)


def copy_session(db: Session, session_id: str, user_id: str, title_prefix: str = "Copy") -> ChatSession:
    source = _session_for_user(db, session_id, user_id)
    copied = create_session(
        db=db,
        user_id=user_id,
        title=f"{title_prefix} - {source.title}",
        runtime_profile_id=source.runtime_profile_id,
        role_id=source.role_id,
        background_prompt=source.background_prompt,
        reasoning_enabled=source.reasoning_enabled,
        reasoning_budget=source.reasoning_budget,
        show_reasoning=source.show_reasoning,
        context_message_limit=source.context_message_limit,
        default_enabled_mcp_ids=_load_mcp_ids(source.default_enabled_mcp_ids_json),
    )
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == source.id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    for msg in messages:
        db.add(
            ChatMessage(
                id=str(uuid4()),
                session_id=copied.id,
                role=msg.role,
                content=msg.content,
                reasoning_content=msg.reasoning_content,
            )
        )
    db.commit()
    db.refresh(copied)
    return copied


def export_session_payload(
    db: Session,
    session_id: str,
    user_id: str,
    include_reasoning: bool = True,
) -> dict:
    session = _session_for_user(db, session_id, user_id)
    messages = list_messages(db, session_id=session_id, user_id=user_id)
    return {
        "session": session_to_dict(session),
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "reasoning_content": m.reasoning_content if include_reasoning else None,
                "created_at": m.created_at.isoformat(),
            }
            for m in messages
        ],
    }


def export_session_markdown(payload: dict) -> str:
    session = payload["session"]
    lines = [
        f"# Session Export: {session['title']}",
        "",
        f"- session_id: {session['id']}",
        f"- runtime_profile_id: {session['runtime_profile_id']}",
        f"- role_id: {session['role_id']}",
        f"- reasoning_enabled: {session['reasoning_enabled']}",
        f"- reasoning_budget: {session['reasoning_budget']}",
        "",
        "## Messages",
        "",
    ]
    for msg in payload["messages"]:
        lines.append(f"### {msg['role']} ({msg['created_at']})")
        lines.append(msg["content"])
        reasoning = msg.get("reasoning_content")
        if reasoning:
            lines.append("")
            lines.append("#### Reasoning")
            lines.append(reasoning)
        lines.append("")
    return "\n".join(lines)


def bulk_export_sessions_zip(
    db: Session,
    user_id: str,
    session_ids: list[str],
    include_reasoning: bool = True,
) -> bytes:
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for session_id in session_ids:
            payload = export_session_payload(
                db,
                session_id=session_id,
                user_id=user_id,
                include_reasoning=include_reasoning,
            )
            zf.writestr(f"{session_id}.md", export_session_markdown(payload))
    return buf.getvalue()


def bulk_delete_sessions(db: Session, user_id: str, session_ids: list[str]) -> int:
    deleted = 0
    for session_id in session_ids:
        try:
            delete_session(db, session_id=session_id, user_id=user_id)
            deleted += 1
        except ChatError:
            continue
    return deleted
