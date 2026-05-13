from datetime import date
from tests.helpers import (
    make_skill_type, make_skill_value,
    make_shift_group, make_shift,
    make_staff_group, make_staff,
)
from app.models import StaffSkill, StaffPermittedShift


# ── Staff Groups ──────────────────────────────────────────────────────

def test_create_staff_group(client, auth):
    r = client.post("/api/staff/groups", json={"name": "Nurses"}, headers=auth["headers"])
    assert r.status_code == 201
    assert r.json()["name"] == "Nurses"


def test_create_staff_group_duplicate(client, auth, db):
    make_staff_group(db, "Nurses")
    r = client.post("/api/staff/groups", json={"name": "Nurses"}, headers=auth["headers"])
    assert r.status_code == 409


def test_list_staff_groups(client, auth, db):
    make_staff_group(db, "Doctors")
    make_staff_group(db, "Nurses")
    r = client.get("/api/staff/groups", headers=auth["headers"])
    assert r.status_code == 200
    names = [g["name"] for g in r.json()]
    assert "Nurses" in names
    assert "Doctors" in names


def test_update_staff_group(client, auth, db):
    sg = make_staff_group(db, "OldName")
    r = client.patch(f"/api/staff/groups/{sg.id}", json={"name": "NewName"}, headers=auth["headers"])
    assert r.status_code == 200
    assert r.json()["name"] == "NewName"


def test_update_staff_group_not_found(client, auth):
    r = client.patch("/api/staff/groups/99999", json={"name": "X"}, headers=auth["headers"])
    assert r.status_code == 404


def test_delete_staff_group(client, auth, db):
    sg = make_staff_group(db, "Empty")
    r = client.delete(f"/api/staff/groups/{sg.id}", headers=auth["headers"])
    assert r.status_code == 204


def test_delete_staff_group_with_members(client, auth, db):
    sg = make_staff_group(db, "Nurses")
    make_staff(db, sg.id, "EMP001", "Alice")
    r = client.delete(f"/api/staff/groups/{sg.id}", headers=auth["headers"])
    assert r.status_code == 409


def test_delete_staff_group_not_found(client, auth):
    r = client.delete("/api/staff/groups/99999", headers=auth["headers"])
    assert r.status_code == 404


# ── Staff CRUD ────────────────────────────────────────────────────────

def test_create_staff(client, auth, db):
    sg = make_staff_group(db, "Nurses")
    r = client.post(
        "/api/staff",
        json={"staff_group_id": sg.id, "employee_id": "EMP001", "full_name": "Alice Smith"},
        headers=auth["headers"],
    )
    assert r.status_code == 201
    data = r.json()
    assert data["employee_id"] == "EMP001"
    assert data["deleted"] is False


def test_create_staff_group_not_found(client, auth):
    r = client.post(
        "/api/staff",
        json={"staff_group_id": 99999, "employee_id": "EMP999", "full_name": "Nobody"},
        headers=auth["headers"],
    )
    assert r.status_code == 404


def test_create_staff_duplicate_employee_id(client, auth, db):
    sg = make_staff_group(db, "Nurses")
    make_staff(db, sg.id, "EMP001", "Alice")
    r = client.post(
        "/api/staff",
        json={"staff_group_id": sg.id, "employee_id": "EMP001", "full_name": "Bob"},
        headers=auth["headers"],
    )
    assert r.status_code == 409


def test_get_staff(client, auth, db):
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    r = client.get(f"/api/staff/{s.id}", headers=auth["headers"])
    assert r.status_code == 200
    assert r.json()["employee_id"] == "EMP001"


def test_get_staff_not_found(client, auth):
    r = client.get("/api/staff/99999", headers=auth["headers"])
    assert r.status_code == 404


def test_list_staff(client, auth, db):
    sg = make_staff_group(db, "Nurses")
    make_staff(db, sg.id, "EMP001", "Alice")
    make_staff(db, sg.id, "EMP002", "Bob")
    r = client.get("/api/staff", headers=auth["headers"])
    assert r.status_code == 200
    ids = [s["employee_id"] for s in r.json()]
    assert "EMP001" in ids
    assert "EMP002" in ids


def test_list_staff_excludes_deleted_by_default(client, auth, db):
    sg = make_staff_group(db, "Nurses")
    active = make_staff(db, sg.id, "EMP001", "Alice")
    deleted = make_staff(db, sg.id, "EMP002", "Bob")
    deleted.deleted = True
    db.flush()
    r = client.get("/api/staff", headers=auth["headers"])
    ids = [s["employee_id"] for s in r.json()]
    assert "EMP001" in ids
    assert "EMP002" not in ids


def test_list_staff_include_deleted(client, auth, db):
    sg = make_staff_group(db, "Nurses")
    make_staff(db, sg.id, "EMP001", "Alice")
    deleted = make_staff(db, sg.id, "EMP002", "Bob")
    deleted.deleted = True
    db.flush()
    r = client.get("/api/staff?include_deleted=true", headers=auth["headers"])
    ids = [s["employee_id"] for s in r.json()]
    assert "EMP001" in ids
    assert "EMP002" in ids


def test_list_staff_filter_by_group(client, auth, db):
    sg1 = make_staff_group(db, "Nurses")
    sg2 = make_staff_group(db, "Doctors")
    make_staff(db, sg1.id, "EMP001", "Alice")
    make_staff(db, sg2.id, "EMP002", "Bob")
    r = client.get(f"/api/staff?group_id={sg1.id}", headers=auth["headers"])
    ids = [s["employee_id"] for s in r.json()]
    assert "EMP001" in ids
    assert "EMP002" not in ids


def test_update_staff(client, auth, db):
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    r = client.patch(f"/api/staff/{s.id}", json={"full_name": "Alice Jones"}, headers=auth["headers"])
    assert r.status_code == 200
    assert r.json()["full_name"] == "Alice Jones"


def test_update_staff_not_found(client, auth):
    r = client.patch("/api/staff/99999", json={"full_name": "X"}, headers=auth["headers"])
    assert r.status_code == 404


# ── Soft delete / restore ─────────────────────────────────────────────

def test_soft_delete_staff(client, auth, db):
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    r = client.post(f"/api/staff/{s.id}/delete", headers=auth["headers"])
    assert r.status_code == 200
    assert r.json()["deleted"] is True


def test_soft_delete_not_found(client, auth):
    r = client.post("/api/staff/99999/delete", headers=auth["headers"])
    assert r.status_code == 404


def test_restore_staff(client, auth, db):
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    s.deleted = True
    db.flush()
    r = client.post(f"/api/staff/{s.id}/restore", headers=auth["headers"])
    assert r.status_code == 200
    assert r.json()["deleted"] is False


def test_restore_not_found(client, auth):
    r = client.post("/api/staff/99999/restore", headers=auth["headers"])
    assert r.status_code == 404


# ── Staff Skills ──────────────────────────────────────────────────────

def test_get_staff_skills_empty(client, auth, db):
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    r = client.get(f"/api/staff/{s.id}/skills", headers=auth["headers"])
    assert r.status_code == 200
    assert r.json() == []


def test_add_staff_skill(client, auth, db):
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    st = make_skill_type(db, "Seniority")
    sv = make_skill_value(db, st.id, "Senior")
    r = client.post(f"/api/staff/{s.id}/skills", json={"skill_value_id": sv.id}, headers=auth["headers"])
    assert r.status_code == 201
    assert r.json()["skill_value_id"] == sv.id


def test_add_staff_skill_staff_not_found(client, auth, db):
    st = make_skill_type(db, "Seniority")
    sv = make_skill_value(db, st.id, "Senior")
    r = client.post("/api/staff/99999/skills", json={"skill_value_id": sv.id}, headers=auth["headers"])
    assert r.status_code == 404


def test_add_staff_skill_value_not_found(client, auth, db):
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    r = client.post(f"/api/staff/{s.id}/skills", json={"skill_value_id": 99999}, headers=auth["headers"])
    assert r.status_code == 404


def test_add_staff_skill_duplicate(client, auth, db):
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    st = make_skill_type(db, "Seniority")
    sv = make_skill_value(db, st.id, "Senior")
    db.add(StaffSkill(staff_id=s.id, skill_value_id=sv.id))
    db.flush()
    r = client.post(f"/api/staff/{s.id}/skills", json={"skill_value_id": sv.id}, headers=auth["headers"])
    assert r.status_code == 409


def test_remove_staff_skill(client, auth, db):
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    st = make_skill_type(db, "Seniority")
    sv = make_skill_value(db, st.id, "Senior")
    db.add(StaffSkill(staff_id=s.id, skill_value_id=sv.id))
    db.flush()
    r = client.delete(f"/api/staff/{s.id}/skills/{sv.id}", headers=auth["headers"])
    assert r.status_code == 204


def test_remove_staff_skill_not_found(client, auth, db):
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    r = client.delete(f"/api/staff/{s.id}/skills/99999", headers=auth["headers"])
    assert r.status_code == 404


# ── Permitted Shifts ──────────────────────────────────────────────────

def test_get_permitted_shifts_unrestricted(client, auth, db):
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    r = client.get(f"/api/staff/{s.id}/permitted-shifts", headers=auth["headers"])
    assert r.status_code == 200
    assert r.json()["note"] == "No restrictions — all shifts permitted"
    assert r.json()["permitted_shifts"] == []


def test_add_permitted_shift(client, auth, db):
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    shg = make_shift_group(db, "DSG")
    sh = make_shift(db, shg.id, "D0800")
    r = client.post(f"/api/staff/{s.id}/permitted-shifts", json={"shift_id": sh.id}, headers=auth["headers"])
    assert r.status_code == 201
    assert r.json()["shift_id"] == sh.id


def test_add_permitted_shift_staff_not_found(client, auth, db):
    shg = make_shift_group(db, "DSG")
    sh = make_shift(db, shg.id, "D0800")
    r = client.post("/api/staff/99999/permitted-shifts", json={"shift_id": sh.id}, headers=auth["headers"])
    assert r.status_code == 404


def test_add_permitted_shift_not_found(client, auth, db):
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    r = client.post(f"/api/staff/{s.id}/permitted-shifts", json={"shift_id": 99999}, headers=auth["headers"])
    assert r.status_code == 404


def test_add_permitted_shift_duplicate(client, auth, db):
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    shg = make_shift_group(db, "DSG")
    sh = make_shift(db, shg.id, "D0800")
    db.add(StaffPermittedShift(staff_id=s.id, shift_id=sh.id))
    db.flush()
    r = client.post(f"/api/staff/{s.id}/permitted-shifts", json={"shift_id": sh.id}, headers=auth["headers"])
    assert r.status_code == 409


def test_remove_permitted_shift(client, auth, db):
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    shg = make_shift_group(db, "DSG")
    sh = make_shift(db, shg.id, "D0800")
    db.add(StaffPermittedShift(staff_id=s.id, shift_id=sh.id))
    db.flush()
    r = client.delete(f"/api/staff/{s.id}/permitted-shifts/{sh.id}", headers=auth["headers"])
    assert r.status_code == 204


def test_remove_permitted_shift_not_found(client, auth, db):
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    r = client.delete(f"/api/staff/{s.id}/permitted-shifts/99999", headers=auth["headers"])
    assert r.status_code == 404


# ── Leaves ────────────────────────────────────────────────────────────

def test_create_leave(client, auth, db):
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    r = client.post(
        "/api/staff/leaves",
        json={"staff_id": s.id, "date": "2025-01-10", "shift_code": "AL"},
        headers=auth["headers"],
    )
    assert r.status_code == 201
    data = r.json()
    assert data["staff_id"] == s.id
    assert data["date"] == "2025-01-10"
    assert data["shift_code"] == "AL"


def test_create_leave_staff_not_found(client, auth):
    r = client.post(
        "/api/staff/leaves",
        json={"staff_id": 99999, "date": "2025-01-10"},
        headers=auth["headers"],
    )
    assert r.status_code == 404


def test_list_leaves(client, auth, db):
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    r1 = client.post(
        "/api/staff/leaves",
        json={"staff_id": s.id, "date": "2025-01-05"},
        headers=auth["headers"],
    )
    r2 = client.post(
        "/api/staff/leaves",
        json={"staff_id": s.id, "date": "2025-01-10"},
        headers=auth["headers"],
    )
    r = client.get("/api/staff/leaves", headers=auth["headers"])
    assert r.status_code == 200
    dates = [lv["date"] for lv in r.json()]
    assert "2025-01-05" in dates
    assert "2025-01-10" in dates


def test_list_leaves_filter_by_staff(client, auth, db):
    sg = make_staff_group(db, "Nurses")
    s1 = make_staff(db, sg.id, "EMP001", "Alice")
    s2 = make_staff(db, sg.id, "EMP002", "Bob")
    client.post("/api/staff/leaves", json={"staff_id": s1.id, "date": "2025-01-05"}, headers=auth["headers"])
    client.post("/api/staff/leaves", json={"staff_id": s2.id, "date": "2025-01-06"}, headers=auth["headers"])
    r = client.get(f"/api/staff/leaves?staff_id={s1.id}", headers=auth["headers"])
    assert r.status_code == 200
    assert all(lv["staff_id"] == s1.id for lv in r.json())


def test_list_leaves_date_range_filter(client, auth, db):
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    client.post("/api/staff/leaves", json={"staff_id": s.id, "date": "2025-01-01"}, headers=auth["headers"])
    client.post("/api/staff/leaves", json={"staff_id": s.id, "date": "2025-01-15"}, headers=auth["headers"])
    client.post("/api/staff/leaves", json={"staff_id": s.id, "date": "2025-01-31"}, headers=auth["headers"])
    r = client.get(
        "/api/staff/leaves?from_date=2025-01-10&to_date=2025-01-20",
        headers=auth["headers"],
    )
    dates = [lv["date"] for lv in r.json()]
    assert "2025-01-15" in dates
    assert "2025-01-01" not in dates
    assert "2025-01-31" not in dates


def test_update_leave(client, auth, db):
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    resp = client.post(
        "/api/staff/leaves",
        json={"staff_id": s.id, "date": "2025-01-10"},
        headers=auth["headers"],
    )
    leave_id = resp.json()["id"]
    r = client.patch(
        f"/api/staff/leaves/{leave_id}",
        json={"note": "Medical appointment"},
        headers=auth["headers"],
    )
    assert r.status_code == 200
    assert r.json()["note"] == "Medical appointment"


def test_update_leave_not_found(client, auth):
    r = client.patch("/api/staff/leaves/99999", json={"note": "X"}, headers=auth["headers"])
    assert r.status_code == 404


def test_delete_leave(client, auth, db):
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    resp = client.post(
        "/api/staff/leaves",
        json={"staff_id": s.id, "date": "2025-01-10"},
        headers=auth["headers"],
    )
    leave_id = resp.json()["id"]
    r = client.delete(f"/api/staff/leaves/{leave_id}", headers=auth["headers"])
    assert r.status_code == 204


def test_delete_leave_not_found(client, auth):
    r = client.delete("/api/staff/leaves/99999", headers=auth["headers"])
    assert r.status_code == 404
