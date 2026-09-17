"""Seed roster-engine with the CGH ward demo catalogue (30 nurses, 10 WFO shifts).

Run against a fresh database, from the host: python3 scripts/seed_demo_ward.py
Requires: pip install requests. Assumes admin/admin123 exists (see README).

Point it elsewhere with environment variables, e.g. the AWS deployment:
  ROSTER_API_URL=http://<alb-dns-name>/api ROSTER_ADMIN_PASSWORD=... python3 scripts/seed_demo_ward.py
Shift work_min is a uniform 440-min credit — exact-hours targets need uniform
credits to stay feasible (see documentation/operators-manual.html, gotcha 1).
"""
import os
import sys
from datetime import date, timedelta

import requests

API = os.environ.get("ROSTER_API_URL", "http://localhost:8000/api").rstrip("/")
ADMIN_USER = os.environ.get("ROSTER_ADMIN_USER", "admin")
ADMIN_PASSWORD = os.environ.get("ROSTER_ADMIN_PASSWORD", "admin123")

login = requests.post(f"{API}/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASSWORD})
if login.status_code != 200:
    print(f"login as {ADMIN_USER} at {API} failed: {login.status_code} {login.text[:200]}", file=sys.stderr)
    sys.exit(1)
tok = login.json()["access_token"]
s = requests.Session()
s.headers["Authorization"] = f"Bearer {tok}"

def post(path, body):
    r = s.post(f"{API}{path}", json=body)
    if r.status_code not in (200, 201):
        print(f"FAIL {path}: {r.status_code} {r.text[:200]}", file=sys.stderr)
        sys.exit(1)
    return r.json() if r.text else {}

# ── Shift groups ────────────────────────────────────────────────
dsg = post("/shifts/groups", {"code": "DSG", "is_work_shift": True, "is_night_shift": False})["id"]
esg = post("/shifts/groups", {"code": "ESG", "is_work_shift": True, "is_night_shift": False})["id"]
nsg = post("/shifts/groups", {"code": "NSG", "is_work_shift": True, "is_night_shift": True})["id"]
lvs = post("/shifts/groups", {"code": "Leaves", "is_work_shift": False, "is_night_shift": False})["id"]

# ── Shifts: the 10 ward-active WFO codes (code, label, group, start, end, break) ──
def mins(hhmm):
    return (hhmm // 100) * 60 + hhmm % 100

SHIFTS = [
    ("D0F9",  "0630-1530", dsg,  630, 1530, 100),
    ("D079",  "0700-1600", dsg,  700, 1600, 100),
    ("D0710", "0700-1700", dsg,  700, 1700, 100),
    ("D0811", "0800-1900", dsg,  800, 1900, 130),
    ("E118",  "1100-1900", esg, 1100, 1900, 100),
    ("E1110", "1100-2100", esg, 1100, 2100, 100),
    ("E139",  "1300-2200", esg, 1300, 2200, 100),
    ("N0T11", "2030-0730", nsg, 2030,  730, 130),
    ("N19K",  "1900-0730", nsg, 1900,  730, 130),
    ("N2012", "2000-0800", nsg, 2000,  800, 130),
]
shift_ids = {}
for code, label, gid, start, end, brk in SHIFTS:
    sm, em = mins(start), mins(end)
    span = (em - sm) if em > sm else (em + 1440 - sm)
    shift_ids[code] = post("/shifts", {
        "group_id": gid, "code": code, "name": label,
        "start_min": sm, "end_min": em, "work_min": 440, "break_min": span - 440,
    })["id"]

# Leave shifts. Each credits the same 440 min as a worked day, so a paid
# absence keeps the exact-hours target (C2) satisfiable. The distinction
# between them is operational, not mathematical: AL is planned and the solver
# schedules around it, while MC and HL arrive after a roster is published and
# are recorded against it. Unpaid leave would need a 0-min credit, which C2
# cannot currently accommodate — see DESIGN.md §4.
LEAVE_SHIFTS = [
    ("AL", "Annual Leave"),
    ("MC", "Medical Leave"),          # outpatient sick leave, certified
    ("HL", "Hospitalisation Leave"),
]
for code, name in LEAVE_SHIFTS:
    shift_ids[code] = post("/shifts", {
        "group_id": lvs, "code": code, "name": name,
        "start_min": 0, "end_min": 0, "work_min": 440, "break_min": 0,
    })["id"]

# ── Skills ──────────────────────────────────────────────────────
sen = post("/skills/types", {"name": "seniority", "description": "SN = staff nurse, EN = enrolled nurse"})["id"]
trn = post("/skills/types", {"name": "training", "description": "specialist certifications"})["id"]
sv = {}
for t, v in [(sen, "senior"), (sen, "junior"), (trn, "icu"), (trn, "ortho"), (trn, "wound")]:
    sv[v] = post(f"/skills/types/{t}/values", {"value": v})["id"]

# ── Staff: 30 nurses from guo-nurse seed (name, senior, icu, ortho, wound) ──
NURSES = [
    ("Sarah Chen", 1, 1, 0, 0), ("Michael Roberts", 1, 1, 0, 0), ("Emily Watson", 1, 1, 0, 0),
    ("David Kim", 1, 1, 1, 0), ("Priya Sharma", 1, 0, 1, 0), ("James Tan", 1, 0, 1, 1),
    ("Linda Ng", 1, 0, 0, 1), ("Robert Lim", 1, 0, 0, 1), ("Angela Toh", 1, 0, 0, 0),
    ("Kevin Ong", 1, 0, 0, 0), ("Mei Ling Wong", 1, 0, 0, 0), ("Hassan Idris", 1, 0, 0, 0),
    ("Maria Garcia", 0, 1, 0, 0), ("Priya Patel", 0, 1, 0, 0), ("Fatimah Binte Ali", 0, 1, 0, 0),
    ("Marcus Lim", 0, 0, 1, 0), ("Nurul Huda", 0, 0, 1, 0), ("Ting Wei Goh", 0, 0, 1, 0),
    ("Josephine Tan", 0, 0, 0, 1), ("Rashid Omar", 0, 0, 0, 1), ("James Wilson", 0, 0, 0, 0),
    ("Jennifer Lee", 0, 0, 0, 0), ("Arun Kumar", 0, 0, 0, 0), ("Siti Hajar", 0, 0, 0, 0),
    ("Christopher Davis", 0, 0, 0, 0), ("Yuki Tanaka", 0, 0, 0, 0), ("Anand Krishnan", 0, 0, 0, 0),
    ("Benjamin Ho", 0, 0, 0, 0), ("Nur Aisyah", 0, 0, 0, 0), ("Marcus Fernandez", 0, 0, 0, 0),
]
grp = post("/staff/groups", {"name": "CGH General Ward"})["id"]
staff_ids = []
for i, (name, senior, icu, ortho, wound) in enumerate(NURSES, 1):
    prefix = "SN" if senior else "EN"
    sid = post("/staff", {"staff_group_id": grp, "employee_id": f"{prefix}_{i:02d}", "full_name": name})["id"]
    staff_ids.append(sid)
    post(f"/staff/{sid}/skills", {"skill_value_id": sv["senior" if senior else "junior"]})
    for flag, val in [(icu, "icu"), (ortho, "ortho"), (wound, "wound")]:
        if flag:
            post(f"/staff/{sid}/skills", {"skill_value_id": sv[val]})

# ── Profile with the night-rest rule ────────────────────────────
prof = post("/profiles", {"name": "CGH General Ward", "config": {
    "time_limit": 120,
    "conditional_constraints": [
        {"trigger": "NSG", "trigger_val": 1, "offset": 1, "enforce": "*", "enforce_val": 0},
    ],
}})["id"]
post(f"/profiles/{prof}/staff/add-group/{grp}", {})
for sid_ in shift_ids.values():
    post(f"/profiles/{prof}/shifts", {"shift_id": sid_})

# ── A few booked leaves in the demo fortnight ───────────────────
# The window is the fortnight starting next Monday, computed at run time: a
# seed with hard-coded dates silently rots into the past, and leave booked
# before today makes no sense to demo against.
today  = date.today()
monday = today + timedelta(days=(7 - today.weekday()) % 7 or 7)

# (staff index, day offset into the window) — planned annual leave only.
# Unplanned absences are the sick-call flow's job, recorded against a roster
# after it is approved.
for idx, offset in [(0, 2), (5, 7), (5, 8), (20, 4)]:
    post("/staff/leaves", {
        "staff_id": staff_ids[idx],
        "date": (monday + timedelta(days=offset)).isoformat(),
        "shift_code": "AL",
    })

print(f"profile_id={prof}")
print(f"Demo fortnight: {monday} to {monday + timedelta(days=13)}")
print(f"Seeded: 4 shift groups, {len(shift_ids)} shifts, 2 skill types, "
      f"{len(staff_ids)} nurses, 1 profile, 4 leaves")
