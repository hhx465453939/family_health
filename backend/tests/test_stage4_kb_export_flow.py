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


def test_kb_build_retrieve_and_export_flow(client: TestClient):
    token = _bootstrap_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    kb_resp = client.post(
        "/api/v1/knowledge-bases",
        headers=headers,
        json={"name": "family-kb", "chunk_size": 400, "chunk_overlap": 50},
    )
    assert kb_resp.status_code == 200
    kb_id = kb_resp.json()["data"]["id"]

    build_resp = client.post(
        f"/api/v1/knowledge-bases/{kb_id}/build",
        headers=headers,
        json={
            "documents": [
                {"title": "doc1", "content": "高血压用药指南，建议规律监测血压。"},
                {"title": "doc2", "content": "糖尿病管理需要控制饮食与运动。"},
            ]
        },
    )
    assert build_resp.status_code == 200
    assert build_resp.json()["data"]["documents"] == 2

    retrieve_resp = client.post(
        "/api/v1/retrieval/query",
        headers=headers,
        json={"kb_id": kb_id, "query": "高血压 用药", "top_k": 3},
    )
    assert retrieve_resp.status_code == 200
    assert len(retrieve_resp.json()["data"]["items"]) >= 1

    export_resp = client.post(
        "/api/v1/exports/jobs",
        headers=headers,
        json={
            "member_scope": "global",
            "export_types": ["chat", "kb"],
            "include_raw_file": False,
            "include_sanitized_text": True,
            "filters": {"chat_limit": 50},
        },
    )
    assert export_resp.status_code == 200
    job_id = export_resp.json()["data"]["id"]

    get_job_resp = client.get(f"/api/v1/exports/jobs/{job_id}", headers=headers)
    assert get_job_resp.status_code == 200
    assert get_job_resp.json()["data"]["status"] == "done"

    download_resp = client.get(f"/api/v1/exports/jobs/{job_id}/download", headers=headers)
    assert download_resp.status_code == 200
    assert download_resp.headers["content-type"] in {
        "application/zip",
        "application/x-zip-compressed",
    }

    delete_resp = client.delete(f"/api/v1/exports/jobs/{job_id}", headers=headers)
    assert delete_resp.status_code == 200
