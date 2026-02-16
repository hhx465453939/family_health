def test_bootstrap_login_refresh_and_admin_create_user(client):
    bootstrap_res = client.post(
        "/api/v1/auth/bootstrap-owner",
        json={"username": "owner", "password": "owner-pass-123", "display_name": "Owner"},
    )
    assert bootstrap_res.status_code == 200
    assert bootstrap_res.json()["data"]["role"] == "owner"

    login_res = client.post(
        "/api/v1/auth/login",
        json={"username": "owner", "password": "owner-pass-123", "device_label": "local"},
    )
    assert login_res.status_code == 200
    token_data = login_res.json()["data"]
    access = token_data["access_token"]
    refresh = token_data["refresh_token"]

    create_user_res = client.post(
        "/api/v1/auth/users",
        headers={"Authorization": f"Bearer {access}"},
        json={
            "username": "member01",
            "password": "member-pass-123",
            "display_name": "Member",
            "role": "member",
        },
    )
    assert create_user_res.status_code == 200
    assert create_user_res.json()["data"]["role"] == "member"

    refresh_res = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert refresh_res.status_code == 200
    assert refresh_res.json()["data"]["access_token"]


def test_bootstrap_owner_only_once(client):
    first = client.post(
        "/api/v1/auth/bootstrap-owner",
        json={"username": "owner", "password": "owner-pass-123", "display_name": "Owner"},
    )
    assert first.status_code == 200

    second = client.post(
        "/api/v1/auth/bootstrap-owner",
        json={"username": "owner2", "password": "owner-pass-123", "display_name": "Owner2"},
    )
    assert second.status_code == 400
    assert second.json()["code"] == 2001


def test_register_then_login(client):
    register_res = client.post(
        "/api/v1/auth/register",
        json={"username": "member02", "password": "member-pass-123", "display_name": "Member 02"},
    )
    assert register_res.status_code == 200
    assert register_res.json()["data"]["role"] == "member"

    login_res = client.post(
        "/api/v1/auth/login",
        json={"username": "member02", "password": "member-pass-123"},
    )
    assert login_res.status_code == 200
    assert login_res.json()["data"]["access_token"]


def test_login_handles_naive_lock_until_without_500(client):
    bootstrap_res = client.post(
        "/api/v1/auth/bootstrap-owner",
        json={"username": "owner", "password": "owner-pass-123", "display_name": "Owner"},
    )
    assert bootstrap_res.status_code == 200

    # Trigger temporary lock (internally persists lock_until to DB).
    for _ in range(5):
        client.post(
            "/api/v1/auth/login",
            json={"username": "owner", "password": "wrong-password"},
        )

    # Next login should return auth error (locked), and must not crash with 500.
    login_res = client.post(
        "/api/v1/auth/login",
        json={"username": "owner", "password": "owner-pass-123"},
    )
    assert login_res.status_code == 401
