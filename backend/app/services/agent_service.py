from __future__ import annotations

from app.core.config import settings
from app.models.chat_message import ChatMessage
from app.models.chat_session import ChatSession
from app.services.chat_service import ChatError, add_message, get_attachment_texts


def _trim_history(messages: list[dict]) -> list[dict]:
    return messages[-settings.chat_context_message_limit :]


def _compose_answer(query: str, history_count: int, attachment_count: int, mcp_count: int) -> str:
    return (
        f"已收到你的问题：{query}\n"
        f"上下文消息数：{history_count}，附件片段数：{attachment_count}，MCP启用数：{mcp_count}。\n"
        "当前为本地最小 Agent 回答链路，后续可替换为真实 LLM 调用。"
    )


def run_agent_qa(
    db,
    user,
    session_id: str,
    query: str,
    attachments_ids: list[str] | None,
    enabled_mcp_ids: list[str] | None,
    runtime_profile_id: str | None,
) -> dict:
    session = (
        db.query(ChatSession)
        .filter(
            ChatSession.id == session_id,
            ChatSession.user_id == user.id,
            ChatSession.deleted_at.is_(None),
        )
        .first()
    )
    if not session:
        raise ChatError(4001, "Session not found")

    add_message(db, session_id=session_id, user_id=user.id, role="user", content=query)

    history = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    history_payload = [{"role": m.role, "content": m.content} for m in history]
    trimmed = _trim_history(history_payload)

    attachment_texts: list[str] = []
    if attachments_ids:
        attachment_texts = get_attachment_texts(db, session_id, user.id, attachments_ids)

    if runtime_profile_id:
        session.runtime_profile_id = runtime_profile_id
        db.commit()

    answer = _compose_answer(
        query=query,
        history_count=len(trimmed),
        attachment_count=len(attachment_texts),
        mcp_count=len(enabled_mcp_ids or []),
    )
    assistant_msg = add_message(
        db,
        session_id=session_id,
        user_id=user.id,
        role="assistant",
        content=answer,
    )

    return {
        "session_id": session_id,
        "assistant_message_id": assistant_msg.id,
        "assistant_answer": answer,
        "context": {
            "history_messages": len(trimmed),
            "attachment_chunks": len(attachment_texts),
            "enabled_mcp_ids": enabled_mcp_ids or [],
        },
    }
