from tests.helpers import (
    make_shift_group, make_shift,
    make_staff_group, make_staff,
    make_profile, make_roster,
)
from app.models import RosterStatus


# ── Profile CRUD ──────────────────────────────────────────────────────

def test_create_profile(client, auth):
    r = client.post("/api/profiles", json={"name": "ICU", "config": {}}, headers=auth["headers"])
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "ICU"
    assert "id" in data


def test_create_profile_with_config(client, auth):
    config = {"weight_overstaff": 50, "time_limit": 300}
    r = client.post("/api/profiles", json={"name": "ICU", "config": config}, headers=auth["headers"])
    assert r.status_code == 201
    assert r.json()["config"] == config


def test_create_profile_duplicate(client, auth, db):
    make_profile(db, "ICU")
    r = client.post("/api/profiles", json={"name": "ICU"}, headers=auth["headers"])
    assert r.status_code == 409


def test_list_profiles(client, auth, db):
    make_profile(db, "ICU")
    make_profile(db, "Ward")
    r = client.get("/api/profiles", headers=auth["headers"])
    assert r.status_code == 200
    names = [p["name"] for p in r.json()]
    assert "ICU" in names
    assert "Ward" in names


def test_get_profile(client, auth, db):
    p = make_profile(db, "ICU")
    r = client.get(f"/api/profiles/{p.id}", headers=auth["headers"])
    assert r.status_code == 200
    assert r.json()["name"] == "ICU"


def test_get_profile_not_found(client, auth):
    r = client.get("/api/profiles/99999", headers=auth["headers"])
    assert r.status_code == 404


def test_update_profile(client, auth, db):
    p = make_profile(db, "ICU")
    r = client.patch(
        f"/api/profiles/{p.id}",
        json={"name": "ICU-Updated", "config": {"time_limit": 120}},
        headers=auth["headers"],
    )
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "ICU-Updated"
    assert data["config"]["time_limit"] == 120


def test_update_profile_not_found(client, auth):
    r = client.patch("/api/profiles/99999", json={"name": "X"}, headers=auth["headers"])
    assert r.status_code == 404


def test_delete_profile(client, auth, db):
    p = make_profile(db, "Empty")
    r = client.delete(f"/api/profiles/{p.id}", headers=auth["headers"])
    assert r.status_code == 204


def test_delete_profile_not_found(client, auth):
    r = client.delete("/api/profiles/99999", headers=auth["headers"])
    assert r.status_code == 404


def test_delete_profile_with_rosters(client, auth, db):
    p = make_profile(db, "HasRosters")
    make_roster(db, p.id, status=RosterStatus.draft)
    r = client.delete(f"/api/profiles/{p.id}", headers=auth["headers"])
    assert r.status_code == 409


# ── Profile Staff ─────────────────────────────────────────────────────

def test_list_profile_staff_empty(client, auth, db):
    p = make_profile(db, "ICU")
    r = client.get(f"/api/profiles/{p.id}/staff", headers=auth["headers"])
    assert r.status_code == 200
    assert r.json() == []


def test_list_profile_staff_not_found(client, auth):
    r = client.get("/api/profiles/99999/staff", headers=auth["headers"])
    assert r.status_code == 404


def test_add_profile_staff(client, auth, db):
    p = make_profile(db, "ICU")
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    r = client.post(
        f"/api/profiles/{p.id}/staff",
        json={"staff_id": s.id, "excluded": False},
        headers=auth["headers"],
    )
    assert r.status_code == 201
    data = r.json()
    assert data["staff_id"] == s.id
    assert data["excluded"] is False


def test_add_profile_staff_profile_not_found(client, auth, db):
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    r = client.post("/api/profiles/99999/staff", json={"staff_id": s.id}, headers=auth["headers"])
    assert r.status_code == 404


def test_add_profile_staff_staff_not_found(client, auth, db):
    p = make_profile(db, "ICU")
    r = client.post(f"/api/profiles/{p.id}/staff", json={"staff_id": 99999}, headers=auth["headers"])
    assert r.status_code == 404


def test_add_profile_staff_duplicate(client, auth, db):
    p = make_profile(db, "ICU")
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    client.post(f"/api/profiles/{p.id}/staff", json={"staff_id": s.id}, headers=auth["headers"])
    r = client.post(f"/api/profiles/{p.id}/staff", json={"staff_id": s.id}, headers=auth["headers"])
    assert r.status_code == 409


def test_bulk_add_staff_group_to_profile(client, auth, db):
    p = make_profile(db, "ICU")
    sg = make_staff_group(db, "Nurses")
    make_staff(db, sg.id, "EMP001", "Alice")
    make_staff(db, sg.id, "EMP002", "Bob")
    r = client.post(
        f"/api/profiles/{p.id}/staff/add-group/{sg.id}",
        headers=auth["headers"],
    )
    assert r.status_code == 201
    assert r.json()["added"] == 2


def test_bulk_add_staff_group_skips_deleted(client, auth, db):
    p = make_profile(db, "ICU")
    sg = make_staff_group(db, "Nurses")
    make_staff(db, sg.id, "EMP001", "Alice")
    deleted = make_staff(db, sg.id, "EMP002", "Bob")
    deleted.deleted = True
    db.flush()
    r = client.post(f"/api/profiles/{p.id}/staff/add-group/{sg.id}", headers=auth["headers"])
    assert r.json()["added"] == 1


def test_bulk_add_staff_group_skips_existing(client, auth, db):
    p = make_profile(db, "ICU")
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    client.post(f"/api/profiles/{p.id}/staff", json={"staff_id": s.id}, headers=auth["headers"])
    make_staff(db, sg.id, "EMP002", "Bob")
    r = client.post(f"/api/profiles/{p.id}/staff/add-group/{sg.id}", headers=auth["headers"])
    assert r.json()["added"] == 1


def test_update_profile_staff_excluded(client, auth, db):
    p = make_profile(db, "ICU")
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    client.post(f"/api/profiles/{p.id}/staff", json={"staff_id": s.id, "excluded": False}, headers=auth["headers"])
    r = client.patch(
        f"/api/profiles/{p.id}/staff/{s.id}",
        json={"excluded": True},
        headers=auth["headers"],
    )
    assert r.status_code == 200
    assert r.json()["excluded"] is True


def test_update_profile_staff_not_in_profile(client, auth, db):
    p = make_profile(db, "ICU")
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    r = client.patch(f"/api/profiles/{p.id}/staff/{s.id}", json={"excluded": True}, headers=auth["headers"])
    assert r.status_code == 404


def test_remove_profile_staff(client, auth, db):
    p = make_profile(db, "ICU")
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    client.post(f"/api/profiles/{p.id}/staff", json={"staff_id": s.id}, headers=auth["headers"])
    r = client.delete(f"/api/profiles/{p.id}/staff/{s.id}", headers=auth["headers"])
    assert r.status_code == 204


def test_remove_profile_staff_not_in_profile(client, auth, db):
    p = make_profile(db, "ICU")
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    r = client.delete(f"/api/profiles/{p.id}/staff/{s.id}", headers=auth["headers"])
    assert r.status_code == 404


# ── Profile Shifts ────────────────────────────────────────────────────

def test_list_profile_shifts_empty(client, auth, db):
    p = make_profile(db, "ICU")
    r = client.get(f"/api/profiles/{p.id}/shifts", headers=auth["headers"])
    assert r.status_code == 200
    assert r.json() == []


def test_add_profile_shift(client, auth, db):
    p = make_profile(db, "ICU")
    sg = make_shift_group(db, "DSG")
    sh = make_shift(db, sg.id, "D0800")
    r = client.post(f"/api/profiles/{p.id}/shifts", json={"shift_id": sh.id}, headers=auth["headers"])
    assert r.status_code == 201
    assert r.json()["shift_id"] == sh.id


def test_add_profile_shift_duplicate(client, auth, db):
    p = make_profile(db, "ICU")
    sg = make_shift_group(db, "DSG")
    sh = make_shift(db, sg.id, "D0800")
    client.post(f"/api/profiles/{p.id}/shifts", json={"shift_id": sh.id}, headers=auth["headers"])
    r = client.post(f"/api/profiles/{p.id}/shifts", json={"shift_id": sh.id}, headers=auth["headers"])
    assert r.status_code == 409


def test_bulk_add_shift_group_to_profile(client, auth, db):
    p = make_profile(db, "ICU")
    sg = make_shift_group(db, "DSG")
    make_shift(db, sg.id, "D0800")
    make_shift(db, sg.id, "D1400", "Day 1400", 840, 1320, 480)
    r = client.post(f"/api/profiles/{p.id}/shifts/add-group/{sg.id}", headers=auth["headers"])
    assert r.status_code == 201
    assert r.json()["added"] == 2


def test_bulk_add_shift_group_skips_existing(client, auth, db):
    p = make_profile(db, "ICU")
    sg = make_shift_group(db, "DSG")
    sh = make_shift(db, sg.id, "D0800")
    client.post(f"/api/profiles/{p.id}/shifts", json={"shift_id": sh.id}, headers=auth["headers"])
    make_shift(db, sg.id, "D1400", "Day 1400", 840, 1320, 480)
    r = client.post(f"/api/profiles/{p.id}/shifts/add-group/{sg.id}", headers=auth["headers"])
    assert r.json()["added"] == 1


def test_remove_profile_shift(client, auth, db):
    p = make_profile(db, "ICU")
    sg = make_shift_group(db, "DSG")
    sh = make_shift(db, sg.id, "D0800")
    client.post(f"/api/profiles/{p.id}/shifts", json={"shift_id": sh.id}, headers=auth["headers"])
    r = client.delete(f"/api/profiles/{p.id}/shifts/{sh.id}", headers=auth["headers"])
    assert r.status_code == 204


def test_remove_profile_shift_not_in_profile(client, auth, db):
    p = make_profile(db, "ICU")
    sg = make_shift_group(db, "DSG")
    sh = make_shift(db, sg.id, "D0800")
    r = client.delete(f"/api/profiles/{p.id}/shifts/{sh.id}", headers=auth["headers"])
    assert r.status_code == 404
