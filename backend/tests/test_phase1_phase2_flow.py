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
    params = profile_resp.json()["data"]["params"]
    assert "reasoning_budget" in params
    assert "reasoning_effort" not in params


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
