from __future__ import annotations

from app.core.config import settings
from app.models.chat_message import ChatMessage
from app.services.chat_service import (
    ChatError,
    add_message,
    get_attachment_texts,
    get_session_default_mcp_ids,
    get_session_for_user,
)
from app.services.mcp_service import get_effective_server_ids, route_tools


def _trim_history(messages: list[dict]) -> list[dict]:
    return messages[-settings.chat_context_message_limit :]


def _compose_answer(
    query: str,
    background_prompt: str | None,
    history_count: int,
    attachment_count: int,
    mcp_count: int,
) -> str:
    normalized_query = query.strip() or "（未提供文本问题，仅基于附件）"
    bg_hint = (
        f"\n角色上下文: {background_prompt.strip()}"
        if background_prompt and background_prompt.strip()
        else ""
    )
    return (
        f"已收到你的问题：{normalized_query}{bg_hint}\n"
        f"上下文消息数：{history_count}，附件片段数：{attachment_count}，MCP启用数：{mcp_count}。\n"
        "当前为本地最小 Agent 回答链路，后续可替换为真实 LLM 调用。"
    )


def run_agent_qa(
    db,
    user,
    session_id: str,
    query: str,
    background_prompt: str | None,
    attachments_ids: list[str] | None,
    enabled_mcp_ids: list[str] | None,
    runtime_profile_id: str | None,
) -> dict:
    session = get_session_for_user(db, session_id=session_id, user_id=user.id)
    normalized_query = query.strip()
    if not normalized_query and not attachments_ids:
        raise ChatError(4005, "Please provide text query or upload attachments")

    message_content = normalized_query or "（仅附件模式）"
    if background_prompt and background_prompt.strip():
        message_content = f"[SYSTEM]{background_prompt.strip()}\n{message_content}"
    add_message(db, session_id=session_id, user_id=user.id, role="user", content=message_content)

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

    session_default_ids = get_session_default_mcp_ids(db, session_id=session_id, user_id=user.id)
    effective_mcp_ids = get_effective_server_ids(
        db,
        agent_name="qa",
        session_default_ids=session_default_ids,
        request_override_ids=enabled_mcp_ids,
    )
    mcp_out = route_tools(db, enabled_server_ids=effective_mcp_ids, query=query)

    answer = _compose_answer(
        query=normalized_query,
        background_prompt=background_prompt,
        history_count=len(trimmed),
        attachment_count=len(attachment_texts),
        mcp_count=len(mcp_out["results"]),
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
            "enabled_mcp_ids": effective_mcp_ids,
        },
        "mcp_results": mcp_out["results"],
        "tool_warnings": mcp_out["warnings"],
    }
