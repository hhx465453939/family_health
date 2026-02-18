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


def test_upload_docx_attachment_success(client: TestClient):
    token = _bootstrap_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    session_resp = client.post("/api/v1/chat/sessions", json={"title": "docx-test"}, headers=headers)
    assert session_resp.status_code == 200
    session_id = session_resp.json()["data"]["id"]

    file_bytes = _build_minimal_docx("Contact [REDACTED]")
    upload_resp = client.post(
        f"/api/v1/chat/sessions/{session_id}/attachments",
        headers=headers,
        files={"file": ("report.docx", file_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert upload_resp.status_code == 200
    assert upload_resp.json()["data"]["parse_status"] == "done"


def test_create_invalid_regex_rule_rejected(client: TestClient):
    token = _bootstrap_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    rule_resp = client.post(
        "/api/v1/desensitization/rules",
        headers=headers,
        json={
            "member_scope": "global",
            "rule_type": "regex",
            "pattern": "(",
            "replacement_token": "[MASK]",
            "enabled": True,
        },
    )
    assert rule_resp.status_code == 400
    assert rule_resp.json()["code"] == 5003


def test_upload_attachment_with_invalid_windows_filename(client: TestClient):
    token = _bootstrap_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    session_resp = client.post("/api/v1/chat/sessions", json={"title": "name-safe"}, headers=headers)
    assert session_resp.status_code == 200
    session_id = session_resp.json()["data"]["id"]

    upload_resp = client.post(
        f"/api/v1/chat/sessions/{session_id}/attachments",
        headers=headers,
        files={"file": ("bad:name?.txt", "safe content".encode("utf-8"), "text/plain")},
    )
    assert upload_resp.status_code == 200
