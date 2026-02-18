from __future__ import annotations

import json
from collections.abc import Generator

import httpx

from app.core.config import settings
from app.core.crypto import decrypt_text
from app.models.chat_message import ChatMessage
from app.models.llm_runtime_profile import LlmRuntimeProfile
from app.models.model_catalog import ModelCatalog
from app.models.model_provider import ModelProvider
from app.services.chat_service import (
    ChatError,
    add_message,
    get_attachment_meta,
    get_attachment_texts,
    get_session_default_mcp_ids,
    get_session_for_user,
)
from app.services.mcp_service import get_effective_server_ids, route_tools
from app.services.role_service import get_role_prompt


def _trim_history(messages: list[dict], limit: int | None) -> list[dict]:
    safe_limit = limit or settings.chat_context_message_limit
    return messages[-safe_limit:]


def _load_params(profile: LlmRuntimeProfile) -> dict:
    try:
        data = json.loads(profile.params_json or "{}")
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def _resolve_runtime_profile(db, user_id: str, runtime_profile_id: str | None, session) -> LlmRuntimeProfile:
    chosen_id = runtime_profile_id or session.runtime_profile_id
    query = db.query(LlmRuntimeProfile).filter(LlmRuntimeProfile.user_id == user_id)
    if chosen_id:
        profile = query.filter(LlmRuntimeProfile.id == chosen_id).first()
        if not profile:
            raise ChatError(7001, "Runtime profile not found")
        return profile

    profile = query.filter(LlmRuntimeProfile.is_default.is_(True)).first()
    if not profile:
        raise ChatError(7002, "Please configure a default runtime profile first")
    return profile


def _resolve_model_provider(db, user_id: str, profile: LlmRuntimeProfile) -> tuple[ModelCatalog, ModelProvider]:
    if not profile.llm_model_id:
        raise ChatError(7003, "Runtime profile has no llm model")

    model = db.query(ModelCatalog).filter(ModelCatalog.id == profile.llm_model_id).first()
    if not model:
        raise ChatError(7004, "LLM model not found in model catalog")

    provider = (
        db.query(ModelProvider)
        .filter(
            ModelProvider.id == model.provider_id,
            ModelProvider.user_id == user_id,
            ModelProvider.enabled.is_(True),
        )
        .first()
    )
    if not provider:
        raise ChatError(7005, "Model provider not found or disabled")
    return model, provider


def _build_context_suffix(attachment_texts: list[str], mcp_results: list[dict]) -> str:
    blocks: list[str] = []
    if attachment_texts:
        clipped: list[str] = []
        for idx, text in enumerate(attachment_texts, start=1):
            normalized = text.strip()
            if len(normalized) > 1600:
                normalized = normalized[:1600] + "\n...[truncated]"
            clipped.append(f"[Attachment {idx}]\n{normalized}")
        blocks.append("Sanitized attachment context:\n" + "\n\n".join(clipped))
    if mcp_results:
        blocks.append("MCP tool outputs:\n" + "\n".join(str(item.get("output", "")) for item in mcp_results))
    suffix = "\n\n" + "\n\n".join(blocks) if blocks else ""
    if suffix:
        suffix += (
            "\n\nInstruction: Use attachment/tool context to analyze and conclude. "
            "Do not copy long raw passages verbatim; summarize and give actionable feedback."
        )
    return suffix


def _role_name(role: str) -> str:
    return "assistant" if role == "assistant" else "user"


def _effective_system_prompt(session, request_background_prompt: str | None) -> str:
    if request_background_prompt and request_background_prompt.strip():
        return request_background_prompt.strip()
    if session.background_prompt and session.background_prompt.strip():
        return session.background_prompt.strip()
    if session.role_id:
        try:
            return get_role_prompt(session.role_id)
        except FileNotFoundError:
            return ""
    return ""


def _reasoning_settings(session) -> tuple[bool | None, int | None, bool]:
    return session.reasoning_enabled, session.reasoning_budget, bool(session.show_reasoning)


def _model_capabilities(model: ModelCatalog) -> dict:
    try:
        raw = json.loads(model.capabilities_json or "{}")
    except json.JSONDecodeError:
        return {}
    return raw if isinstance(raw, dict) else {}


def _model_supports_vision(model: ModelCatalog) -> bool:
    caps = _model_capabilities(model)
    if bool(caps.get("multimodal")):
        return True
    inputs = caps.get("input_types")
    if isinstance(inputs, list) and "image" in inputs:
        return True
    return False


def _openai_payload(
    model_name: str,
    system_prompt: str,
    messages: list[dict],
    params: dict,
    reasoning_enabled: bool | None,
    reasoning_budget: int | None,
    provider_name: str,
) -> dict:
    payload_messages = []
    if system_prompt.strip():
        payload_messages.append({"role": "system", "content": system_prompt})
    payload_messages.extend(messages)

    payload: dict = {"model": model_name, "messages": payload_messages}
    for key in ["temperature", "top_p", "max_tokens"]:
        if key in params:
            payload[key] = params[key]

    # DeepSeek and compatible deployments (e.g. model name contains deepseek)
    lower_model = model_name.lower()
    lower_provider = provider_name.lower()
    if "deepseek" in lower_model or "deepseek" in lower_provider:
        if reasoning_enabled is not None:
            payload["thinking"] = {
                "type": "enabled" if reasoning_enabled else "disabled"
            }
        if reasoning_budget is not None and reasoning_budget > 0 and "max_tokens" not in payload:
            payload["max_tokens"] = reasoning_budget

    return payload


def _openai_nonstream(
    url: str,
    api_key: str,
    payload: dict,
    include_reasoning: bool,
) -> tuple[str, str]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    with httpx.Client(timeout=60) as client:
        resp = client.post(url, json=payload, headers=headers)
    if resp.status_code >= 400:
        raise ChatError(7006, f"LLM request failed: HTTP {resp.status_code} {resp.text[:200]}")
    data = resp.json()
    choices = data.get("choices") or []
    if not choices:
        raise ChatError(7007, "LLM response has no choices")
    message = choices[0].get("message") or {}
    answer = (message.get("content") or "").strip()
    reasoning = (message.get("reasoning_content") or "").strip() if include_reasoning else ""
    if not answer:
        raise ChatError(7008, "LLM response content missing")
    return answer, reasoning


def _gemini_payload(
    system_prompt: str,
    messages: list[dict],
    params: dict,
    reasoning_enabled: bool | None,
    reasoning_budget: int | None,
    include_reasoning: bool,
) -> dict:
    contents = []
    for item in messages:
        role = "model" if item["role"] == "assistant" else "user"
        contents.append({"role": role, "parts": [{"text": item["content"]}]})

    payload: dict = {"contents": contents}
    if system_prompt.strip():
        payload["systemInstruction"] = {"parts": [{"text": system_prompt}]}

    generation_config = {}
    if "temperature" in params:
        generation_config["temperature"] = params["temperature"]
    if "top_p" in params:
        generation_config["topP"] = params["top_p"]
    if "max_tokens" in params:
        generation_config["maxOutputTokens"] = params["max_tokens"]

    thinking_config = {}
    if reasoning_enabled is False:
        thinking_config["thinkingBudget"] = 0
    elif reasoning_budget is not None and reasoning_budget > 0:
        thinking_config["thinkingBudget"] = reasoning_budget
    if include_reasoning:
        thinking_config["includeThoughts"] = True

    if thinking_config:
        generation_config["thinkingConfig"] = thinking_config
    if generation_config:
        payload["generationConfig"] = generation_config
    return payload


def _gemini_nonstream(
    base_url: str,
    api_key: str,
    model_name: str,
    payload: dict,
    include_reasoning: bool,
) -> tuple[str, str]:
    root = base_url.rstrip("/")
    url = f"{root}/{model_name}:generateContent?key={api_key}"
    with httpx.Client(timeout=60) as client:
        resp = client.post(url, json=payload)
    if resp.status_code >= 400:
        raise ChatError(7006, f"Gemini request failed: HTTP {resp.status_code} {resp.text[:200]}")

    data = resp.json()
    candidates = data.get("candidates") or []
    if not candidates:
        raise ChatError(7007, "Gemini response has no candidates")
    parts = candidates[0].get("content", {}).get("parts") or []
    answer_parts: list[str] = []
    reasoning_parts: list[str] = []
    for part in parts:
        if not isinstance(part, dict):
            continue
        text = str(part.get("text") or "")
        if not text:
            continue
        if part.get("thought") and include_reasoning:
            reasoning_parts.append(text)
        elif not part.get("thought"):
            answer_parts.append(text)
    answer = "\n".join(answer_parts).strip()
    reasoning = "\n".join(reasoning_parts).strip()
    if not answer:
        raise ChatError(7008, "Gemini response content missing")
    return answer, reasoning


def _fallback_answer(query: str, attachment_count: int, mcp_count: int) -> str:
    normalized = query.strip() or "(attachment-only mode)"
    return (
        f"Received your question: {normalized}\n"
        f"Attachment chunks: {attachment_count}, MCP tools: {mcp_count}.\n"
        "No active runtime/provider configured. Returned fallback local answer."
    )


def _prepare_context(
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

    add_message(
        db,
        session_id=session_id,
        user_id=user.id,
        role="user",
        content=normalized_query or "(attachment-only mode)",
    )

    history = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    trimmed = _trim_history(
        [{"role": _role_name(m.role), "content": m.content} for m in history],
        limit=getattr(session, "context_message_limit", None),
    )

    attachment_texts: list[str] = []
    attachment_meta: list[dict] = []
    if attachments_ids:
        attachment_meta = get_attachment_meta(db, session_id, user.id, attachments_ids)
        attachment_texts = get_attachment_texts(db, session_id, user.id, attachments_ids)

    if runtime_profile_id:
        session.runtime_profile_id = runtime_profile_id
        db.commit()

    session_default_ids = get_session_default_mcp_ids(db, session_id=session_id, user_id=user.id)
    effective_mcp_ids = get_effective_server_ids(
        db,
        user_id=user.id,
        agent_name="qa",
        session_default_ids=session_default_ids,
        request_override_ids=enabled_mcp_ids,
    )
    mcp_out = route_tools(db, user_id=user.id, enabled_server_ids=effective_mcp_ids, query=query)

    suffix = _build_context_suffix(attachment_texts, mcp_out["results"])
    if trimmed and trimmed[-1]["role"] == "user":
        trimmed[-1] = {"role": "user", "content": trimmed[-1]["content"] + suffix}

    return {
        "session": session,
        "normalized_query": normalized_query,
        "trimmed": trimmed,
        "attachment_texts": attachment_texts,
        "mcp_out": mcp_out,
        "effective_mcp_ids": effective_mcp_ids,
        "system_prompt": _effective_system_prompt(session, background_prompt),
        "runtime_profile_id": runtime_profile_id,
        "attachment_meta": attachment_meta,
    }


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
    ctx = _prepare_context(
        db,
        user,
        session_id,
        query,
        background_prompt,
        attachments_ids,
        enabled_mcp_ids,
        runtime_profile_id,
    )
    session = ctx["session"]
    reasoning_enabled, reasoning_budget, include_reasoning = _reasoning_settings(session)

    reasoning_text = ""
    try:
        profile = _resolve_runtime_profile(db, user.id, runtime_profile_id, session)
        model, provider = _resolve_model_provider(db, user.id, profile)
        if any(item.get("is_image") for item in ctx["attachment_meta"]) and not _model_supports_vision(model):
            raise ChatError(7010, "Current model is not multimodal; image upload is disabled for this chat")
        params = _load_params(profile)
        provider_name = provider.provider_name.lower()
        if "gemini" in provider_name:
            payload = _gemini_payload(
                system_prompt=ctx["system_prompt"],
                messages=ctx["trimmed"],
                params=params,
                reasoning_enabled=reasoning_enabled,
                reasoning_budget=reasoning_budget,
                include_reasoning=include_reasoning,
            )
            answer, reasoning_text = _gemini_nonstream(
                base_url=provider.base_url,
                api_key=decrypt_text(provider.api_key_encrypted),
                model_name=model.model_name,
                payload=payload,
                include_reasoning=include_reasoning,
            )
        else:
            payload = _openai_payload(
                model_name=model.model_name,
                system_prompt=ctx["system_prompt"],
                messages=ctx["trimmed"],
                params=params,
                reasoning_enabled=reasoning_enabled,
                reasoning_budget=reasoning_budget,
                provider_name=provider.provider_name,
            )
            answer, reasoning_text = _openai_nonstream(
                url=provider.base_url,
                api_key=decrypt_text(provider.api_key_encrypted),
                payload=payload,
                include_reasoning=include_reasoning,
            )
    except ChatError as exc:
        if exc.code in {7001, 7002, 7003, 7004, 7005}:
            answer = _fallback_answer(
                ctx["normalized_query"],
                len(ctx["attachment_texts"]),
                len(ctx["mcp_out"]["results"]),
            )
        else:
            raise

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
        "reasoning_content": reasoning_text if include_reasoning else "",
        "context": {
            "history_messages": len(ctx["trimmed"]),
            "attachment_chunks": len(ctx["attachment_texts"]),
            "enabled_mcp_ids": ctx["effective_mcp_ids"],
        },
        "mcp_results": ctx["mcp_out"]["results"],
        "tool_warnings": ctx["mcp_out"]["warnings"],
    }


def _sse_event(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def stream_agent_qa(
    db,
    user,
    session_id: str,
    query: str,
    background_prompt: str | None,
    attachments_ids: list[str] | None,
    enabled_mcp_ids: list[str] | None,
    runtime_profile_id: str | None,
) -> Generator[str, None, None]:
    ctx = _prepare_context(
        db,
        user,
        session_id,
        query,
        background_prompt,
        attachments_ids,
        enabled_mcp_ids,
        runtime_profile_id,
    )
    session = ctx["session"]
    reasoning_enabled, reasoning_budget, include_reasoning = _reasoning_settings(session)

    answer_buf: list[str] = []
    reasoning_buf: list[str] = []

    try:
        profile = _resolve_runtime_profile(db, user.id, runtime_profile_id, session)
        model, provider = _resolve_model_provider(db, user.id, profile)
        if any(item.get("is_image") for item in ctx["attachment_meta"]) and not _model_supports_vision(model):
            raise ChatError(7010, "Current model is not multimodal; image upload is disabled for this chat")
        params = _load_params(profile)
        provider_name = provider.provider_name.lower()

        if "gemini" in provider_name:
            payload = _gemini_payload(
                system_prompt=ctx["system_prompt"],
                messages=ctx["trimmed"],
                params=params,
                reasoning_enabled=reasoning_enabled,
                reasoning_budget=reasoning_budget,
                include_reasoning=include_reasoning,
            )
            root = provider.base_url.rstrip("/")
            url = f"{root}/{model.model_name}:streamGenerateContent?alt=sse&key={decrypt_text(provider.api_key_encrypted)}"
            with httpx.Client(timeout=120) as client:
                with client.stream("POST", url, json=payload) as resp:
                    if resp.status_code >= 400:
                        raise ChatError(7006, f"Gemini stream failed: HTTP {resp.status_code}")
                    for line in resp.iter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        raw = line[5:].strip()
                        if not raw or raw == "[DONE]":
                            continue
                        obj = json.loads(raw)
                        candidates = obj.get("candidates") or []
                        if not candidates:
                            continue
                        parts = candidates[0].get("content", {}).get("parts") or []
                        for part in parts:
                            text = str(part.get("text") or "")
                            if not text:
                                continue
                            if part.get("thought") and include_reasoning:
                                reasoning_buf.append(text)
                                yield _sse_event({"type": "reasoning", "delta": text})
                            elif not part.get("thought"):
                                answer_buf.append(text)
                                yield _sse_event({"type": "message", "delta": text})
        else:
            payload = _openai_payload(
                model_name=model.model_name,
                system_prompt=ctx["system_prompt"],
                messages=ctx["trimmed"],
                params=params,
                reasoning_enabled=reasoning_enabled,
                reasoning_budget=reasoning_budget,
                provider_name=provider.provider_name,
            )
            payload["stream"] = True
            headers = {
                "Authorization": f"Bearer {decrypt_text(provider.api_key_encrypted)}",
                "Content-Type": "application/json",
            }
            with httpx.Client(timeout=120) as client:
                with client.stream("POST", provider.base_url, json=payload, headers=headers) as resp:
                    if resp.status_code >= 400:
                        raise ChatError(7006, f"LLM stream failed: HTTP {resp.status_code}")
                    for line in resp.iter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        raw = line[5:].strip()
                        if not raw or raw == "[DONE]":
                            continue
                        obj = json.loads(raw)
                        choices = obj.get("choices") or []
                        if not choices:
                            continue
                        delta = choices[0].get("delta") or {}
                        text = delta.get("content") or ""
                        reasoning = delta.get("reasoning_content") or ""
                        if text:
                            answer_buf.append(text)
                            yield _sse_event({"type": "message", "delta": text})
                        if reasoning and include_reasoning:
                            reasoning_buf.append(reasoning)
                            yield _sse_event({"type": "reasoning", "delta": reasoning})
    except ChatError as exc:
        if exc.code in {7001, 7002, 7003, 7004, 7005}:
            fallback = _fallback_answer(
                ctx["normalized_query"],
                len(ctx["attachment_texts"]),
                len(ctx["mcp_out"]["results"]),
            )
            answer_buf.append(fallback)
            yield _sse_event({"type": "message", "delta": fallback})
        else:
            yield _sse_event({"type": "error", "message": exc.message})
            return

    final_answer = "".join(answer_buf).strip()
    if not final_answer:
        final_answer = "(empty model output)"

    assistant_msg = add_message(
        db,
        session_id=session_id,
        user_id=user.id,
        role="assistant",
        content=final_answer,
    )

    yield _sse_event(
        {
            "type": "done",
            "assistant_message_id": assistant_msg.id,
            "assistant_answer": final_answer,
            "reasoning_content": "".join(reasoning_buf) if include_reasoning else "",
        }
    )
