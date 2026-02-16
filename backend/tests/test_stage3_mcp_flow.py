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


def test_mcp_server_and_agent_override_flow(client: TestClient):
    token = _bootstrap_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    create_a = client.post(
        "/api/v1/mcp/servers",
        headers=headers,
        json={
            "name": "tool-a",
            "endpoint": "mock://tool-a",
            "auth_type": "none",
            "enabled": True,
            "timeout_ms": 8000,
        },
    )
    assert create_a.status_code == 200
    mcp_a_id = create_a.json()["data"]["id"]

    create_b = client.post(
        "/api/v1/mcp/servers",
        headers=headers,
        json={
            "name": "tool-b",
            "endpoint": "mock://fail/b",
            "auth_type": "none",
            "enabled": True,
            "timeout_ms": 8000,
        },
    )
    assert create_b.status_code == 200
    mcp_b_id = create_b.json()["data"]["id"]

    ping_resp = client.post(f"/api/v1/mcp/servers/{mcp_a_id}/ping", headers=headers)
    assert ping_resp.status_code == 200
    assert ping_resp.json()["data"]["reachable"] is True

    session_resp = client.post(
        "/api/v1/chat/sessions",
        headers=headers,
        json={"title": "mcp-session", "default_enabled_mcp_ids": [mcp_a_id]},
    )
    assert session_resp.status_code == 200
    session_id = session_resp.json()["data"]["id"]

    # No override -> use session default list
    qa_default = client.post(
        "/api/v1/agent/qa",
        headers=headers,
        json={"session_id": session_id, "query": "hello"},
    )
    assert qa_default.status_code == 200
    assert qa_default.json()["data"]["context"]["enabled_mcp_ids"] == [mcp_a_id]
    assert len(qa_default.json()["data"]["mcp_results"]) == 1

    # Per-request override + degraded warning on failing tool
    qa_override = client.post(
        "/api/v1/agent/qa",
        headers=headers,
        json={
            "session_id": session_id,
            "query": "hello-2",
            "enabled_mcp_ids": [mcp_b_id, "not-exist"],
        },
    )
    assert qa_override.status_code == 200
    assert qa_override.json()["data"]["context"]["enabled_mcp_ids"] == [mcp_b_id, "not-exist"]
    assert len(qa_override.json()["data"]["tool_warnings"]) >= 1


def test_mcp_bindings_used_when_session_default_empty(client: TestClient):
    token = _bootstrap_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    create = client.post(
        "/api/v1/mcp/servers",
        headers=headers,
        json={
            "name": "tool-c",
            "endpoint": "mock://tool-c",
            "auth_type": "none",
            "enabled": True,
            "timeout_ms": 8000,
        },
    )
    assert create.status_code == 200
    mcp_id = create.json()["data"]["id"]

    bind = client.put(
        "/api/v1/mcp/bindings/qa",
        headers=headers,
        json={"mcp_server_ids": [mcp_id]},
    )
    assert bind.status_code == 200

    session_resp = client.post(
        "/api/v1/chat/sessions",
        headers=headers,
        json={"title": "binding-session"},
    )
    assert session_resp.status_code == 200
    session_id = session_resp.json()["data"]["id"]

    qa_resp = client.post(
        "/api/v1/agent/qa",
        headers=headers,
        json={"session_id": session_id, "query": "from-binding"},
    )
    assert qa_resp.status_code == 200
    assert qa_resp.json()["data"]["context"]["enabled_mcp_ids"] == [mcp_id]
    assert len(qa_resp.json()["data"]["mcp_results"]) == 1
