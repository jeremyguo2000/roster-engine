from tests.helpers import make_skill_type, make_skill_value, make_staff_group, make_staff
from app.models import StaffSkill


# ── POST /api/skills/types ────────────────────────────────────────────

def test_create_skill_type(client, auth):
    r = client.post("/api/skills/types", json={"name": "Seniority"}, headers=auth["headers"])
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Seniority"
    assert "id" in data
    assert data["values"] == []


def test_create_skill_type_duplicate(client, auth, db):
    make_skill_type(db, "Seniority")
    r = client.post("/api/skills/types", json={"name": "Seniority"}, headers=auth["headers"])
    assert r.status_code == 409


def test_create_skill_type_with_description(client, auth):
    r = client.post(
        "/api/skills/types",
        json={"name": "Grade", "description": "Staff grade level"},
        headers=auth["headers"],
    )
    assert r.status_code == 201
    assert r.json()["description"] == "Staff grade level"


def test_create_skill_type_requires_auth(client):
    r = client.post("/api/skills/types", json={"name": "X"})
    assert r.status_code == 401


# ── GET /api/skills/types ─────────────────────────────────────────────

def test_list_skill_types(client, auth, db):
    make_skill_type(db, "Alpha")
    make_skill_type(db, "Beta")
    r = client.get("/api/skills/types", headers=auth["headers"])
    assert r.status_code == 200
    names = [t["name"] for t in r.json()]
    assert "Alpha" in names
    assert "Beta" in names


def test_list_skill_types_includes_values(client, auth, db):
    st = make_skill_type(db, "Seniority")
    make_skill_value(db, st.id, "Junior")
    make_skill_value(db, st.id, "Senior")
    r = client.get("/api/skills/types", headers=auth["headers"])
    assert r.status_code == 200
    seniority = next(t for t in r.json() if t["name"] == "Seniority")
    assert len(seniority["values"]) == 2


# ── PATCH /api/skills/types/{id} ─────────────────────────────────────

def test_update_skill_type(client, auth, db):
    st = make_skill_type(db, "OldName")
    r = client.patch(
        f"/api/skills/types/{st.id}",
        json={"name": "NewName"},
        headers=auth["headers"],
    )
    assert r.status_code == 200
    assert r.json()["name"] == "NewName"


def test_update_skill_type_not_found(client, auth):
    r = client.patch("/api/skills/types/99999", json={"name": "X"}, headers=auth["headers"])
    assert r.status_code == 404


# ── DELETE /api/skills/types/{id} ────────────────────────────────────

def test_delete_skill_type(client, auth, db):
    st = make_skill_type(db, "ToDelete")
    r = client.delete(f"/api/skills/types/{st.id}", headers=auth["headers"])
    assert r.status_code == 204


def test_delete_skill_type_not_found(client, auth):
    r = client.delete("/api/skills/types/99999", headers=auth["headers"])
    assert r.status_code == 404


def test_delete_skill_type_with_values(client, auth, db):
    st = make_skill_type(db, "HasValues")
    make_skill_value(db, st.id, "Val1")
    r = client.delete(f"/api/skills/types/{st.id}", headers=auth["headers"])
    assert r.status_code == 409


# ── POST /api/skills/types/{id}/values ───────────────────────────────

def test_create_skill_value(client, auth, db):
    st = make_skill_type(db, "Seniority")
    r = client.post(
        f"/api/skills/types/{st.id}/values",
        json={"value": "Senior"},
        headers=auth["headers"],
    )
    assert r.status_code == 201
    data = r.json()
    assert data["value"] == "Senior"
    assert data["skill_type_id"] == st.id


def test_create_skill_value_type_not_found(client, auth):
    r = client.post("/api/skills/types/99999/values", json={"value": "X"}, headers=auth["headers"])
    assert r.status_code == 404


def test_create_skill_value_duplicate(client, auth, db):
    st = make_skill_type(db, "Seniority")
    make_skill_value(db, st.id, "Senior")
    r = client.post(
        f"/api/skills/types/{st.id}/values",
        json={"value": "Senior"},
        headers=auth["headers"],
    )
    assert r.status_code == 409


# ── DELETE /api/skills/types/{type_id}/values/{value_id} ─────────────

def test_delete_skill_value(client, auth, db):
    st = make_skill_type(db, "Seniority")
    sv = make_skill_value(db, st.id, "Junior")
    r = client.delete(f"/api/skills/types/{st.id}/values/{sv.id}", headers=auth["headers"])
    assert r.status_code == 204


def test_delete_skill_value_not_found(client, auth, db):
    st = make_skill_type(db, "Seniority")
    r = client.delete(f"/api/skills/types/{st.id}/values/99999", headers=auth["headers"])
    assert r.status_code == 404


def test_delete_skill_value_assigned_to_staff(client, auth, db):
    st = make_skill_type(db, "Seniority")
    sv = make_skill_value(db, st.id, "Senior")
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    db.add(StaffSkill(staff_id=s.id, skill_value_id=sv.id))
    db.flush()
    r = client.delete(f"/api/skills/types/{st.id}/values/{sv.id}", headers=auth["headers"])
    assert r.status_code == 409
