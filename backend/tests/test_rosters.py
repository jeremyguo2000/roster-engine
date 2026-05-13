from datetime import date
from unittest.mock import patch, MagicMock

from tests.helpers import (
    make_profile, make_demand, make_roster,
    make_staff_group, make_staff,
    make_shift_group, make_shift,
)
from app.models import RosterStatus, ProfileStaff, Leave


def _mock_task():
    """Return a context manager that mocks run_solver.delay."""
    mock = MagicMock()
    mock.id = "test-celery-task-id"
    return patch("app.routers.rosters.run_solver.delay", return_value=mock)


def _create_roster_payload(profile_id, demand_ids, previous_roster_id=None):
    payload = {
        "profile_id": profile_id,
        "name": "Test Roster",
        "roster_start": "2025-01-06",
        "num_days": 7,
        "target_work_min": 2400,
        "demand_ids": demand_ids,
    }
    if previous_roster_id is not None:
        payload["previous_roster_id"] = previous_roster_id
    return payload


# ── POST /api/rosters ─────────────────────────────────────────────────

def test_create_roster(client, auth, db):
    p = make_profile(db, "ICU")
    d = make_demand(db, d=date(2025, 1, 6))
    with _mock_task():
        r = client.post(
            "/api/rosters",
            json=_create_roster_payload(p.id, [d.id]),
            headers=auth["headers"],
        )
    assert r.status_code == 201
    data = r.json()
    assert data["status"] == "running"
    assert data["profile_id"] == p.id
    assert data["celery_task_id"] is not None


def test_create_roster_profile_not_found(client, auth, db):
    d = make_demand(db)
    with _mock_task():
        r = client.post(
            "/api/rosters",
            json=_create_roster_payload(99999, [d.id]),
            headers=auth["headers"],
        )
    assert r.status_code == 404


def test_create_roster_demand_not_found(client, auth, db):
    p = make_profile(db, "ICU")
    with _mock_task():
        r = client.post(
            "/api/rosters",
            json=_create_roster_payload(p.id, [99999]),
            headers=auth["headers"],
        )
    assert r.status_code == 404


def test_create_roster_previous_not_found(client, auth, db):
    p = make_profile(db, "ICU")
    d = make_demand(db)
    with _mock_task():
        r = client.post(
            "/api/rosters",
            json=_create_roster_payload(p.id, [d.id], previous_roster_id=99999),
            headers=auth["headers"],
        )
    assert r.status_code == 404


def test_create_roster_previous_no_result(client, auth, db):
    p = make_profile(db, "ICU")
    d = make_demand(db)
    prev = make_roster(db, p.id, status=RosterStatus.failed)
    prev.result = None
    db.flush()
    with _mock_task():
        r = client.post(
            "/api/rosters",
            json=_create_roster_payload(p.id, [d.id], previous_roster_id=prev.id),
            headers=auth["headers"],
        )
    assert r.status_code == 409


def test_create_roster_requires_auth(client, db):
    p = make_profile(db, "ICU")
    d = make_demand(db)
    with _mock_task():
        r = client.post("/api/rosters", json=_create_roster_payload(p.id, [d.id]))
    assert r.status_code == 401


# ── GET /api/rosters ──────────────────────────────────────────────────

def test_list_rosters(client, auth, db):
    p = make_profile(db, "ICU")
    make_roster(db, p.id, status=RosterStatus.draft)
    make_roster(db, p.id, status=RosterStatus.approved)
    r = client.get("/api/rosters", headers=auth["headers"])
    assert r.status_code == 200
    assert len(r.json()) >= 2


def test_list_rosters_filter_by_status(client, auth, db):
    p = make_profile(db, "ICU")
    make_roster(db, p.id, status=RosterStatus.draft)
    make_roster(db, p.id, status=RosterStatus.approved)
    r = client.get("/api/rosters?status=draft", headers=auth["headers"])
    assert all(ro["status"] == "draft" for ro in r.json())


def test_list_rosters_filter_by_profile(client, auth, db):
    p1 = make_profile(db, "ICU")
    p2 = make_profile(db, "Ward")
    make_roster(db, p1.id)
    make_roster(db, p2.id)
    r = client.get(f"/api/rosters?profile_id={p1.id}", headers=auth["headers"])
    assert all(ro["profile_id"] == p1.id for ro in r.json())


# ── GET /api/rosters/{id} ─────────────────────────────────────────────

def test_get_roster(client, auth, db):
    p = make_profile(db, "ICU")
    ro = make_roster(db, p.id)
    r = client.get(f"/api/rosters/{ro.id}", headers=auth["headers"])
    assert r.status_code == 200
    assert r.json()["id"] == ro.id


def test_get_roster_not_found(client, auth):
    r = client.get("/api/rosters/99999", headers=auth["headers"])
    assert r.status_code == 404


# ── GET /api/rosters/{id}/demands ─────────────────────────────────────

def test_get_roster_demands(client, auth, db):
    p = make_profile(db, "ICU")
    d1 = make_demand(db, d=date(2025, 1, 6))
    d2 = make_demand(db, d=date(2025, 1, 7))
    ro = make_roster(db, p.id)
    from app.models import RosterDemand
    db.add(RosterDemand(roster_id=ro.id, demand_id=d1.id))
    db.add(RosterDemand(roster_id=ro.id, demand_id=d2.id))
    db.flush()
    r = client.get(f"/api/rosters/{ro.id}/demands", headers=auth["headers"])
    assert r.status_code == 200
    demand_ids = [d["id"] for d in r.json()]
    assert d1.id in demand_ids
    assert d2.id in demand_ids


def test_get_roster_demands_not_found(client, auth):
    r = client.get("/api/rosters/99999/demands", headers=auth["headers"])
    assert r.status_code == 404


# ── GET /api/rosters/{id}/leaves ──────────────────────────────────────

def test_get_roster_leaves(client, auth, db):
    p = make_profile(db, "ICU")
    ro = make_roster(db, p.id, roster_start=date(2025, 1, 6))
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    db.add(ProfileStaff(profile_id=p.id, staff_id=s.id, excluded=False))
    db.add(Leave(staff_id=s.id, date=date(2025, 1, 8), shift_code="AL"))
    db.flush()
    r = client.get(f"/api/rosters/{ro.id}/leaves", headers=auth["headers"])
    assert r.status_code == 200
    assert any(lv["employee_id"] == "EMP001" for lv in r.json())


def test_get_roster_leaves_excludes_outside_window(client, auth, db):
    p = make_profile(db, "ICU")
    ro = make_roster(db, p.id, roster_start=date(2025, 1, 6))
    sg = make_staff_group(db, "Nurses")
    s = make_staff(db, sg.id, "EMP001", "Alice")
    db.add(ProfileStaff(profile_id=p.id, staff_id=s.id, excluded=False))
    db.add(Leave(staff_id=s.id, date=date(2025, 2, 1), shift_code="AL"))  # outside window
    db.flush()
    r = client.get(f"/api/rosters/{ro.id}/leaves", headers=auth["headers"])
    assert r.json() == []


def test_get_roster_leaves_not_found(client, auth):
    r = client.get("/api/rosters/99999/leaves", headers=auth["headers"])
    assert r.status_code == 404


# ── POST /api/rosters/{id}/approve ───────────────────────────────────

def test_approve_roster(client, auth, db):
    p = make_profile(db, "ICU")
    ro = make_roster(db, p.id, status=RosterStatus.draft)
    r = client.post(f"/api/rosters/{ro.id}/approve", headers=auth["headers"])
    assert r.status_code == 200
    assert r.json()["status"] == "approved"


def test_approve_roster_not_draft(client, auth, db):
    p = make_profile(db, "ICU")
    ro = make_roster(db, p.id, status=RosterStatus.running)
    r = client.post(f"/api/rosters/{ro.id}/approve", headers=auth["headers"])
    assert r.status_code == 409


def test_approve_roster_not_found(client, auth):
    r = client.post("/api/rosters/99999/approve", headers=auth["headers"])
    assert r.status_code == 404


# ── POST /api/rosters/{id}/discard ───────────────────────────────────

def test_discard_roster(client, auth, db):
    p = make_profile(db, "ICU")
    ro = make_roster(db, p.id, status=RosterStatus.draft)
    r = client.post(f"/api/rosters/{ro.id}/discard", headers=auth["headers"])
    assert r.status_code == 204


def test_discard_roster_approved(client, auth, db):
    p = make_profile(db, "ICU")
    ro = make_roster(db, p.id, status=RosterStatus.approved)
    r = client.post(f"/api/rosters/{ro.id}/discard", headers=auth["headers"])
    assert r.status_code == 409


def test_discard_roster_not_found(client, auth):
    r = client.post("/api/rosters/99999/discard", headers=auth["headers"])
    assert r.status_code == 404


# ── DELETE /api/rosters/{id} ─────────────────────────────────────────

def test_delete_roster(client, auth, db):
    p = make_profile(db, "ICU")
    ro = make_roster(db, p.id)
    r = client.delete(f"/api/rosters/{ro.id}", headers=auth["headers"])
    assert r.status_code == 204


def test_delete_roster_not_found(client, auth):
    r = client.delete("/api/rosters/99999", headers=auth["headers"])
    assert r.status_code == 404
