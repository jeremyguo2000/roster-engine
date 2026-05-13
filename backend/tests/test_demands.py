from tests.helpers import make_skill_type, make_skill_value, make_demand


# ── POST /api/demands ─────────────────────────────────────────────────

def test_create_demand(client, auth):
    r = client.post(
        "/api/demands",
        json={"date": "2025-01-06", "start_min": 480, "end_min": 960, "headcount": 3},
        headers=auth["headers"],
    )
    assert r.status_code == 201
    data = r.json()
    assert data["date"] == "2025-01-06"
    assert data["headcount"] == 3
    assert data["skill_value_id"] is None


def test_create_demand_with_skill_filter(client, auth, db):
    st = make_skill_type(db, "Seniority")
    sv = make_skill_value(db, st.id, "Senior")
    r = client.post(
        "/api/demands",
        json={
            "date": "2025-01-06",
            "start_min": 480,
            "end_min": 960,
            "headcount": 2,
            "skill_value_id": sv.id,
        },
        headers=auth["headers"],
    )
    assert r.status_code == 201
    assert r.json()["skill_value_id"] == sv.id


def test_create_demand_invalid_skill_value(client, auth):
    r = client.post(
        "/api/demands",
        json={"date": "2025-01-06", "start_min": 480, "end_min": 960, "headcount": 2, "skill_value_id": 99999},
        headers=auth["headers"],
    )
    assert r.status_code == 404


def test_create_demand_requires_auth(client):
    r = client.post(
        "/api/demands",
        json={"date": "2025-01-06", "start_min": 480, "end_min": 960, "headcount": 1},
    )
    assert r.status_code == 401


# ── GET /api/demands ──────────────────────────────────────────────────

def test_list_demands(client, auth, db):
    make_demand(db, d=None)  # uses default date 2025-01-06
    r = client.get("/api/demands", headers=auth["headers"])
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_list_demands_date_range_filter(client, auth, db):
    from datetime import date
    make_demand(db, d=date(2025, 1, 1))
    make_demand(db, d=date(2025, 1, 15))
    make_demand(db, d=date(2025, 1, 31))
    r = client.get("/api/demands?from_date=2025-01-10&to_date=2025-01-20", headers=auth["headers"])
    assert r.status_code == 200
    dates = [d["date"] for d in r.json()]
    assert "2025-01-15" in dates
    assert "2025-01-01" not in dates
    assert "2025-01-31" not in dates


def test_list_demands_filter_by_skill(client, auth, db):
    from datetime import date
    st = make_skill_type(db, "Seniority")
    sv = make_skill_value(db, st.id, "Senior")
    make_demand(db, d=date(2025, 1, 6), skill_value_id=sv.id)
    make_demand(db, d=date(2025, 1, 7))
    r = client.get(f"/api/demands?skill_value_id={sv.id}", headers=auth["headers"])
    data = r.json()
    assert all(d["skill_value_id"] == sv.id for d in data)


# ── GET /api/demands/{id} ─────────────────────────────────────────────

def test_get_demand(client, auth, db):
    d = make_demand(db)
    r = client.get(f"/api/demands/{d.id}", headers=auth["headers"])
    assert r.status_code == 200
    assert r.json()["id"] == d.id


def test_get_demand_not_found(client, auth):
    r = client.get("/api/demands/99999", headers=auth["headers"])
    assert r.status_code == 404
