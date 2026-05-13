from tests.helpers import make_shift_group, make_shift, make_staff_group, make_staff
from app.models import StaffPermittedShift


# ── POST /api/shifts/groups ───────────────────────────────────────────

def test_create_shift_group(client, auth):
    r = client.post(
        "/api/shifts/groups",
        json={"code": "DSG", "is_work_shift": True, "is_night_shift": False},
        headers=auth["headers"],
    )
    assert r.status_code == 201
    data = r.json()
    assert data["code"] == "DSG"
    assert data["is_work_shift"] is True
    assert data["is_night_shift"] is False


def test_create_shift_group_defaults(client, auth):
    r = client.post("/api/shifts/groups", json={"code": "AL"}, headers=auth["headers"])
    assert r.status_code == 201
    data = r.json()
    assert data["is_work_shift"] is True
    assert data["is_night_shift"] is False


def test_create_shift_group_duplicate(client, auth, db):
    make_shift_group(db, "DSG")
    r = client.post("/api/shifts/groups", json={"code": "DSG"}, headers=auth["headers"])
    assert r.status_code == 409


def test_create_shift_group_requires_auth(client):
    r = client.post("/api/shifts/groups", json={"code": "X"})
    assert r.status_code == 401


# ── GET /api/shifts/groups ────────────────────────────────────────────

def test_list_shift_groups(client, auth, db):
    make_shift_group(db, "DSG")
    make_shift_group(db, "NSG", is_night_shift=True)
    r = client.get("/api/shifts/groups", headers=auth["headers"])
    assert r.status_code == 200
    codes = [g["code"] for g in r.json()]
    assert "DSG" in codes
    assert "NSG" in codes


# ── PATCH /api/shifts/groups/{id} ────────────────────────────────────

def test_update_shift_group(client, auth, db):
    sg = make_shift_group(db, "DSG")
    r = client.patch(
        f"/api/shifts/groups/{sg.id}",
        json={"is_night_shift": True},
        headers=auth["headers"],
    )
    assert r.status_code == 200
    assert r.json()["is_night_shift"] is True


def test_update_shift_group_not_found(client, auth):
    r = client.patch("/api/shifts/groups/99999", json={"code": "X"}, headers=auth["headers"])
    assert r.status_code == 404


# ── DELETE /api/shifts/groups/{id} ───────────────────────────────────

def test_delete_shift_group(client, auth, db):
    sg = make_shift_group(db, "EMPTY")
    r = client.delete(f"/api/shifts/groups/{sg.id}", headers=auth["headers"])
    assert r.status_code == 204


def test_delete_shift_group_not_found(client, auth):
    r = client.delete("/api/shifts/groups/99999", headers=auth["headers"])
    assert r.status_code == 404


def test_delete_shift_group_with_shifts(client, auth, db):
    sg = make_shift_group(db, "DSG")
    make_shift(db, sg.id, "D0800")
    r = client.delete(f"/api/shifts/groups/{sg.id}", headers=auth["headers"])
    assert r.status_code == 409


# ── POST /api/shifts ──────────────────────────────────────────────────

def test_create_shift(client, auth, db):
    sg = make_shift_group(db, "DSG")
    r = client.post(
        "/api/shifts",
        json={
            "group_id": sg.id,
            "code": "D0800",
            "name": "Day 0800",
            "start_min": 480,
            "end_min": 960,
            "work_min": 480,
            "break_min": 0,
        },
        headers=auth["headers"],
    )
    assert r.status_code == 201
    data = r.json()
    assert data["code"] == "D0800"
    assert data["group"]["code"] == "DSG"


def test_create_shift_group_not_found(client, auth):
    r = client.post(
        "/api/shifts",
        json={"group_id": 99999, "code": "X", "name": "X", "start_min": 0, "end_min": 480, "work_min": 480},
        headers=auth["headers"],
    )
    assert r.status_code == 404


def test_create_shift_duplicate_code(client, auth, db):
    sg = make_shift_group(db, "DSG")
    make_shift(db, sg.id, "D0800")
    r = client.post(
        "/api/shifts",
        json={"group_id": sg.id, "code": "D0800", "name": "Dup", "start_min": 0, "end_min": 480, "work_min": 480},
        headers=auth["headers"],
    )
    assert r.status_code == 409


# ── GET /api/shifts ───────────────────────────────────────────────────

def test_list_shifts(client, auth, db):
    sg = make_shift_group(db, "DSG")
    make_shift(db, sg.id, "D0800")
    make_shift(db, sg.id, "D1400", "Day 1400", 840, 1320, 480)
    r = client.get("/api/shifts", headers=auth["headers"])
    assert r.status_code == 200
    codes = [s["code"] for s in r.json()]
    assert "D0800" in codes
    assert "D1400" in codes


def test_list_shifts_filter_by_group(client, auth, db):
    sg1 = make_shift_group(db, "DSG")
    sg2 = make_shift_group(db, "NSG", is_night_shift=True)
    make_shift(db, sg1.id, "D0800")
    make_shift(db, sg2.id, "N2200", "Night", 1320, 480, 480)
    r = client.get(f"/api/shifts?group_id={sg1.id}", headers=auth["headers"])
    assert r.status_code == 200
    codes = [s["code"] for s in r.json()]
    assert "D0800" in codes
    assert "N2200" not in codes


# ── GET /api/shifts/{id} ──────────────────────────────────────────────

def test_get_shift(client, auth, db):
    sg = make_shift_group(db, "DSG")
    s = make_shift(db, sg.id, "D0800")
    r = client.get(f"/api/shifts/{s.id}", headers=auth["headers"])
    assert r.status_code == 200
    assert r.json()["code"] == "D0800"


def test_get_shift_not_found(client, auth):
    r = client.get("/api/shifts/99999", headers=auth["headers"])
    assert r.status_code == 404


# ── PATCH /api/shifts/{id} ────────────────────────────────────────────

def test_update_shift(client, auth, db):
    sg = make_shift_group(db, "DSG")
    s = make_shift(db, sg.id, "D0800")
    r = client.patch(
        f"/api/shifts/{s.id}",
        json={"name": "Updated Day Shift"},
        headers=auth["headers"],
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Updated Day Shift"


def test_update_shift_not_found(client, auth):
    r = client.patch("/api/shifts/99999", json={"name": "X"}, headers=auth["headers"])
    assert r.status_code == 404


# ── DELETE /api/shifts/{id} ───────────────────────────────────────────

def test_delete_shift(client, auth, db):
    sg = make_shift_group(db, "DSG")
    s = make_shift(db, sg.id, "D0800")
    r = client.delete(f"/api/shifts/{s.id}", headers=auth["headers"])
    assert r.status_code == 204


def test_delete_shift_not_found(client, auth):
    r = client.delete("/api/shifts/99999", headers=auth["headers"])
    assert r.status_code == 404


def test_delete_shift_assigned_to_staff(client, auth, db):
    sg = make_shift_group(db, "DSG")
    s = make_shift(db, sg.id, "D0800")
    stg = make_staff_group(db, "Nurses")
    staff = make_staff(db, stg.id, "EMP001", "Alice")
    db.add(StaffPermittedShift(staff_id=staff.id, shift_id=s.id))
    db.flush()
    r = client.delete(f"/api/shifts/{s.id}", headers=auth["headers"])
    assert r.status_code == 409
