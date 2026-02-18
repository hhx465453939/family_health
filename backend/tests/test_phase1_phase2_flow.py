from fastapi.testclient import TestClient


def _bootstrap_and_login(client: TestClient) -> str:
    bootstrap_resp = client.post(
        "/api/v1/auth/bootstrap-owner",
        json={"username": "owner", "password": "OwnerPass123", "display_name": "Owner"},
    )
    assert bootstrap_resp.status_code == 200

    login_resp = client.post(
        "/api/v1/auth/login",
        json={"username": "owner", "password": "OwnerPass123"},
    )
    assert login_resp.status_code == 200
    return login_resp.json()["data"]["access_token"]


def test_model_registry_and_runtime_profile(client: TestClient):
    access_token = _bootstrap_and_login(client)
    headers = {"Authorization": f"Bearer {access_token}"}

    preset_resp = client.get("/api/v1/model-provider-presets", headers=headers)
    assert preset_resp.status_code == 200
    preset_items = preset_resp.json()["data"]["items"]
    assert any(
        item["base_url"] == "https://generativelanguage.googleapis.com/v1beta/models"
        for item in preset_items
    )

    provider_resp = client.post(
        "/api/v1/model-providers",
        json={
            "provider_name": "gemini",
            "base_url": "https://example.local/gemini",
            "api_key": "secret",
            "enabled": True,
        },
        headers=headers,
    )
    assert provider_resp.status_code == 200
    provider_id = provider_resp.json()["data"]["id"]

    zhipu_chat_resp = client.post(
        "/api/v1/model-providers",
        json={
            "provider_name": "zhipu",
            "base_url": "https://open.bigmodel.cn/api/paas/v4/chat/completions",
            "api_key": "secret",
            "enabled": True,
        },
        headers=headers,
    )
    assert zhipu_chat_resp.status_code == 200

    zhipu_coding_resp = client.post(
        "/api/v1/model-providers",
        json={
            "provider_name": "zhipu",
            "base_url": "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions",
            "api_key": "secret",
            "enabled": True,
        },
        headers=headers,
    )
    assert zhipu_coding_resp.status_code == 200

    refresh_resp = client.post(
        f"/api/v1/model-providers/{provider_id}/refresh-models",
        json={"manual_models": ["gemini-custom"]},
        headers=headers,
    )
    assert refresh_resp.status_code == 200
    assert len(refresh_resp.json()["data"]["items"]) >= 1

    catalog_resp = client.get("/api/v1/model-catalog", headers=headers)
    assert catalog_resp.status_code == 200
    llm_model_id = next(
        item["id"] for item in catalog_resp.json()["data"]["items"] if item["model_type"] == "llm"
    )

    profile_resp = client.post(
        "/api/v1/runtime-profiles",
        json={
            "name": "default",
            "llm_model_id": llm_model_id,
            "params": {
                "temperature": 0.2,
                "reasoning_budget": 128,
                "reasoning_effort": "high",
            },
            "is_default": True,
        },
        headers=headers,
    )
    assert profile_resp.status_code == 200
    profile_id = profile_resp.json()["data"]["id"]
    params = profile_resp.json()["data"]["params"]
    assert "reasoning_budget" in params
    assert "reasoning_effort" not in params

    update_profile_resp = client.patch(
        f"/api/v1/runtime-profiles/{profile_id}",
        json={"name": "default-updated"},
        headers=headers,
    )
    assert update_profile_resp.status_code == 200
    assert update_profile_resp.json()["data"]["name"] == "default-updated"

    delete_profile_resp = client.delete(
        f"/api/v1/runtime-profiles/{profile_id}",
        headers=headers,
    )
    assert delete_profile_resp.status_code == 200

    delete_resp = client.delete(f"/api/v1/model-providers/{provider_id}", headers=headers)
    assert delete_resp.status_code == 200


def test_chat_attachment_sanitization_and_agent_qa(client: TestClient):
    access_token = _bootstrap_and_login(client)
    headers = {"Authorization": f"Bearer {access_token}"}

    rule_resp = client.post(
        "/api/v1/desensitization/rules",
        json={
            "member_scope": "global",
            "rule_type": "literal",
            "pattern": "13800138000",
            "replacement_token": "[PHONE]",
            "enabled": True,
        },
        headers=headers,
    )
    assert rule_resp.status_code == 200

    session_resp = client.post(
        "/api/v1/chat/sessions",
        json={"title": "健康咨询"},
        headers=headers,
    )
    assert session_resp.status_code == 200
    session_id = session_resp.json()["data"]["id"]

    upload_resp = client.post(
        f"/api/v1/chat/sessions/{session_id}/attachments",
        headers=headers,
        files={"file": ("report.txt", "联系方式 13800138000".encode("utf-8"), "text/plain")},
    )
    assert upload_resp.status_code == 200
    attachment_id = upload_resp.json()["data"]["id"]

    qa_resp = client.post(
        "/api/v1/agent/qa",
        headers=headers,
        json={
            "session_id": session_id,
            "query": "请总结附件重点",
            "attachments_ids": [attachment_id],
            "enabled_mcp_ids": [],
        },
    )
    assert qa_resp.status_code == 200
    assert qa_resp.json()["data"]["context"]["attachment_chunks"] == 1

    msg_resp = client.get(f"/api/v1/chat/sessions/{session_id}/messages", headers=headers)
    assert msg_resp.status_code == 200
    assert len(msg_resp.json()["data"]["items"]) == 2

    blocked_resp = client.post(
        f"/api/v1/chat/sessions/{session_id}/attachments",
        headers=headers,
        files={"file": ("raw.txt", "email: test@example.com".encode("utf-8"), "text/plain")},
    )
    assert blocked_resp.status_code == 422
    assert blocked_resp.json()["code"] == 5002


def test_chat_attachment_only_mode_with_background_prompt(client: TestClient):
    access_token = _bootstrap_and_login(client)
    headers = {"Authorization": f"Bearer {access_token}"}

    rule_resp = client.post(
        "/api/v1/desensitization/rules",
        json={
            "member_scope": "global",
            "rule_type": "literal",
            "pattern": "13800138000",
            "replacement_token": "[PHONE]",
            "enabled": True,
        },
        headers=headers,
    )
    assert rule_resp.status_code == 200

    session_resp = client.post(
        "/api/v1/chat/sessions",
        json={"title": "附件模式"},
        headers=headers,
    )
    assert session_resp.status_code == 200
    session_id = session_resp.json()["data"]["id"]

    upload_resp = client.post(
        f"/api/v1/chat/sessions/{session_id}/attachments",
        headers=headers,
        files={"file": ("report.txt", "联系方式 13800138000".encode("utf-8"), "text/plain")},
    )
    assert upload_resp.status_code == 200
    attachment_id = upload_resp.json()["data"]["id"]

    qa_resp = client.post(
        "/api/v1/agent/qa",
        headers=headers,
        json={
            "session_id": session_id,
            "query": "",
            "background_prompt": "你是一名家庭医生",
            "attachments_ids": [attachment_id],
        },
    )
    assert qa_resp.status_code == 200
    assert qa_resp.json()["data"]["context"]["attachment_chunks"] == 1


def test_chat_session_copy_export_and_bulk_delete(client: TestClient):
    access_token = _bootstrap_and_login(client)
    headers = {"Authorization": f"Bearer {access_token}"}

    create_resp = client.post(
        "/api/v1/chat/sessions",
        json={"title": "session-a"},
        headers=headers,
    )
    assert create_resp.status_code == 200
    session_id = create_resp.json()["data"]["id"]

    msg_resp = client.post(
        f"/api/v1/chat/sessions/{session_id}/messages",
        json={"role": "user", "content": "hello"},
        headers=headers,
    )
    assert msg_resp.status_code == 200

    copy_resp = client.post(f"/api/v1/chat/sessions/{session_id}/copy", headers=headers)
    assert copy_resp.status_code == 200
    copied_id = copy_resp.json()["data"]["id"]
    assert copied_id != session_id

    export_resp = client.get(
        f"/api/v1/chat/sessions/{session_id}/export?fmt=md&include_reasoning=false",
        headers=headers,
    )
    assert export_resp.status_code == 200
    assert export_resp.headers["content-type"].startswith("text/markdown")

    bulk_delete_resp = client.post(
        "/api/v1/chat/sessions/bulk-delete",
        json={"session_ids": [session_id, copied_id]},
        headers=headers,
    )
    assert bulk_delete_resp.status_code == 200
    assert bulk_delete_resp.json()["data"]["deleted"] == 2
