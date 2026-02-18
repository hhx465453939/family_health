from io import BytesIO
import zipfile

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


def _build_minimal_docx(text: str) -> bytes:
    xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body><w:p><w:r><w:t>"
        f"{text}"
        "</w:t></w:r></w:p></w:body></w:document>"
    )
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("word/document.xml", xml)
    return buf.getvalue()


def test_kb_management_with_upload_and_strategy(client: TestClient):
    token = _bootstrap_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    defaults_resp = client.get("/api/v1/knowledge-bases/defaults", headers=headers)
    assert defaults_resp.status_code == 200

    kb_resp = client.post(
        "/api/v1/knowledge-bases",
        headers=headers,
        json={
            "name": "kb-manage",
            "chunk_size": 300,
            "chunk_overlap": 40,
            "top_k": 6,
            "rerank_top_n": 3,
            "use_global_defaults": False,
            "retrieval_strategy": "hybrid",
            "keyword_weight": 0.5,
            "semantic_weight": 0.3,
            "rerank_weight": 0.2,
        },
    )
    assert kb_resp.status_code == 200
    kb_id = kb_resp.json()["data"]["id"]

    upload_resp = client.post(
        f"/api/v1/knowledge-bases/{kb_id}/documents/upload",
        headers=headers,
        files={
            "file": (
                "kb.docx",
                _build_minimal_docx("hypertension management and blood pressure monitoring"),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert upload_resp.status_code == 200

    query_resp = client.post(
        "/api/v1/retrieval/query",
        headers=headers,
        json={
            "kb_id": kb_id,
            "query": "hypertension blood pressure",
            "top_k": 3,
            "strategy": "hybrid",
            "keyword_weight": 0.6,
            "semantic_weight": 0.4,
            "rerank_weight": 0.0,
        },
    )
    assert query_resp.status_code == 200

    docs_resp = client.get(f"/api/v1/knowledge-bases/{kb_id}/documents", headers=headers)
    assert docs_resp.status_code == 200
    doc_id = docs_resp.json()["data"]["items"][0]["id"]

    delete_doc_resp = client.delete(f"/api/v1/knowledge-bases/{kb_id}/documents/{doc_id}", headers=headers)
    assert delete_doc_resp.status_code == 200

    update_resp = client.patch(
        f"/api/v1/knowledge-bases/{kb_id}",
        headers=headers,
        json={"name": "kb-manage-v2", "retrieval_strategy": "keyword"},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["data"]["name"] == "kb-manage-v2"

    delete_kb_resp = client.delete(f"/api/v1/knowledge-bases/{kb_id}", headers=headers)
    assert delete_kb_resp.status_code == 200
