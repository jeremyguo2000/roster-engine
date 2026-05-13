from app.models import User
from app.dependencies.auth import hash_password


def _seed_user(db, username="alice", password="password123"):
    user = User(username=username, password_hash=hash_password(password))
    db.add(user)
    db.flush()
    return user


# ── POST /api/auth/login ──────────────────────────────────────────────

def test_login_success(client, db):
    _seed_user(db, "alice", "secret123")
    r = client.post("/api/auth/login", json={"username": "alice", "password": "secret123"})
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_login_wrong_password(client, db):
    _seed_user(db, "alice", "secret123")
    r = client.post("/api/auth/login", json={"username": "alice", "password": "wrong"})
    assert r.status_code == 401


def test_login_unknown_user(client):
    r = client.post("/api/auth/login", json={"username": "nobody", "password": "pass"})
    assert r.status_code == 401


# ── GET /api/auth/me ─────────────────────────────────────────────────

def test_get_me(client, auth):
    r = client.get("/api/auth/me", headers=auth["headers"])
    assert r.status_code == 200
    assert r.json()["username"] == auth["username"]


def test_get_me_no_token(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_get_me_invalid_token(client):
    r = client.get("/api/auth/me", headers={"Authorization": "Bearer notavalidtoken"})
    assert r.status_code == 401


# ── POST /api/auth/change-password ───────────────────────────────────

def test_change_password_success(client, auth):
    r = client.post(
        "/api/auth/change-password",
        json={"current_password": auth["password"], "new_password": "newpass999"},
        headers=auth["headers"],
    )
    assert r.status_code == 204


def test_change_password_wrong_current(client, auth):
    r = client.post(
        "/api/auth/change-password",
        json={"current_password": "wrongpass", "new_password": "newpass999"},
        headers=auth["headers"],
    )
    assert r.status_code == 401


def test_change_password_requires_auth(client):
    r = client.post(
        "/api/auth/change-password",
        json={"current_password": "old", "new_password": "new123"},
    )
    assert r.status_code == 401


# ── GET /api/auth/users ───────────────────────────────────────────────

def test_list_users(client, auth, db):
    _seed_user(db, "bob", "pass123")
    r = client.get("/api/auth/users", headers=auth["headers"])
    assert r.status_code == 200
    usernames = [u["username"] for u in r.json()]
    assert auth["username"] in usernames
    assert "bob" in usernames


# ── POST /api/auth/users ──────────────────────────────────────────────

def test_create_user(client, auth):
    r = client.post(
        "/api/auth/users",
        json={"username": "newuser", "password": "newpass123"},
        headers=auth["headers"],
    )
    assert r.status_code == 201
    assert r.json()["username"] == "newuser"


def test_create_user_duplicate(client, auth, db):
    _seed_user(db, "dupuser", "pass123")
    r = client.post(
        "/api/auth/users",
        json={"username": "dupuser", "password": "pass123"},
        headers=auth["headers"],
    )
    assert r.status_code == 409


def test_create_user_requires_auth(client):
    r = client.post("/api/auth/users", json={"username": "x", "password": "y"})
    assert r.status_code == 401


# ── DELETE /api/auth/users/{id} ───────────────────────────────────────

def test_delete_user(client, auth, db):
    other = _seed_user(db, "todelete", "pass123")
    r = client.delete(f"/api/auth/users/{other.id}", headers=auth["headers"])
    assert r.status_code == 204


def test_delete_self(client, auth):
    r = client.delete(f"/api/auth/users/{auth['user_id']}", headers=auth["headers"])
    assert r.status_code == 409


def test_delete_user_not_found(client, auth):
    r = client.delete("/api/auth/users/99999", headers=auth["headers"])
    assert r.status_code == 404
