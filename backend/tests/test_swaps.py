"""Replacement suggestions for an absence — the sick-call path (DESIGN.md §2).

The point of this module is that it answers without a solve, so the tests
build small rosters by hand and assert on who comes back, in what order, and
why everyone else was ruled out.
"""
from datetime import date

import pytest

from solver.models import Demand, Shift, ShiftGroup, Skill, Staff
from solver.solver import ConditionalConstraint, RosterContext
from solver.swaps import suggest_replacements

DAY   = ShiftGroup("DSG", is_night_shift=False, is_work_shift=True)
NIGHT = ShiftGroup("NSG", is_night_shift=True,  is_work_shift=True)
LEAVE = ShiftGroup("Leaves", is_work_shift=False)

D  = Shift("D07", "0700-1500", DAY,   start_time=420,  end_time=900,  work_time=480)
E  = Shift("E15", "1500-2300", DAY,   start_time=900,  end_time=1380, work_time=480)
N  = Shift("N23", "2300-0700", NIGHT, start_time=1380, end_time=420,  work_time=480)
AL = Shift("AL",  "Annual Leave", LEAVE, start_time=0, end_time=0,    work_time=480)
SHIFTS = [D, E, N, AL]

# Mon 10 Aug 2026; day 5 is Saturday.
START = date(2026, 8, 10)

NIGHT_THEN_REST = ConditionalConstraint(trigger="NSG", trigger_val=1, offset=1,
                                        enforce="*", enforce_val=0)


def make_result(assignments, staff, num_days=3, demands=None):
    return {
        "assignments":  {(emp, d, code): 1 for (emp, d), code in assignments.items()},
        "staff":        staff,
        "shifts":       SHIFTS,
        "demands":      demands if demands is not None else [],
        "num_days":     num_days,
        "roster_start": START,
        "consec_days":  {},
    }


def ids(replacements):
    return [c.employee_id for c in replacements.candidates]


@pytest.fixture
def ward():
    """Four interchangeable nurses, no skills or shift restrictions."""
    return [Staff(f"E{i}", f"Nurse {i}") for i in range(1, 5)]


# ── nothing to do ───────────────────────────────────────────────────────────

def test_absence_on_a_day_they_were_not_working(ward):
    result = make_result({("E1", 0): "D07"}, ward)
    out = suggest_replacements(result, "E2", day=0, target_work_min=480)
    assert out.candidates == []
    assert "not rostered to work" in out.message


def test_unknown_employee(ward):
    result = make_result({("E1", 0): "D07"}, ward)
    out = suggest_replacements(result, "NOBODY", day=0, target_work_min=480)
    assert "not in this roster" in out.message


# ── who is eligible ─────────────────────────────────────────────────────────

def test_offers_the_staff_who_are_free(ward):
    # E1 is off sick on day 0; E2 also works that day, E3 and E4 are free.
    result = make_result({("E1", 0): "D07", ("E2", 0): "E15"}, ward)
    out = suggest_replacements(result, "E1", day=0, target_work_min=480)
    assert set(ids(out)) == {"E3", "E4"}
    assert out.shift.code == "D07"
    assert out.excluded["already working that day"] == 1


def test_staff_on_leave_are_not_offered(ward):
    result = make_result({("E1", 0): "D07", ("E2", 0): "AL"}, ward)
    out = suggest_replacements(result, "E1", day=0, target_work_min=480)
    assert "E2" not in ids(out)
    assert out.excluded["on leave that day"] == 1


def test_staff_not_permitted_the_shift_are_not_offered():
    staff = [
        Staff("E1", "Nurse 1"),
        Staff("E2", "Nurse 2", permitted_shifts=[E]),   # evenings only
        Staff("E3", "Nurse 3"),
    ]
    result = make_result({("E1", 0): "D07"}, staff)
    out = suggest_replacements(result, "E1", day=0, target_work_min=480)
    assert ids(out) == ["E3"]
    assert out.excluded["not permitted to work D07"] == 1


def test_rest_rule_blocks_the_day_after_a_night_shift(ward):
    # E2 worked a night on day 0, so a rest rule bars them from day 1.
    result = make_result({("E1", 1): "D07", ("E2", 0): "N23"}, ward)
    out = suggest_replacements(result, "E1", day=1, target_work_min=480,
                               conditional_constraints=[NIGHT_THEN_REST])
    assert "E2" not in ids(out)
    assert out.excluded["would breach a rest rule"] == 1
    assert set(ids(out)) == {"E3", "E4"}


def test_rest_rule_carried_over_from_the_previous_roster(ward):
    # E2 worked a night on the previous roster's last day — still barred on day 0.
    context = RosterContext(carry_shifts={"E2": ("NSG", -1)})
    result = make_result({("E1", 0): "D07"}, ward)
    out = suggest_replacements(result, "E1", day=0, target_work_min=480,
                               conditional_constraints=[NIGHT_THEN_REST],
                               context=context)
    assert "E2" not in ids(out)
    assert set(ids(out)) == {"E3", "E4"}


def test_no_one_available(ward):
    result = make_result(
        {("E1", 0): "D07", ("E2", 0): "E15", ("E3", 0): "AL", ("E4", 0): "D07"}, ward)
    out = suggest_replacements(result, "E1", day=0, target_work_min=480)
    assert out.candidates == []
    assert "No one is free" in out.message


# ── what actually breaks ────────────────────────────────────────────────────

def test_reports_the_demand_left_short(ward):
    demand = Demand(START, start_time=420, end_time=900, headcount=2)
    result = make_result({("E1", 0): "D07", ("E2", 0): "D07"}, ward, demands=[demand])
    out = suggest_replacements(result, "E1", day=0, target_work_min=480)
    assert len(out.gaps) == 1
    assert out.gaps[0].short_by == 1
    assert "needs 2 staff" in out.gaps[0].describe()


def test_no_gap_when_the_shift_was_surplus(ward):
    # Demand needs 1, two are on — losing one still meets it.
    demand = Demand(START, start_time=420, end_time=900, headcount=1)
    result = make_result({("E1", 0): "D07", ("E2", 0): "D07"}, ward, demands=[demand])
    out = suggest_replacements(result, "E1", day=0, target_work_min=480)
    assert out.gaps == []
    assert "Coverage still holds" in out.message


def test_overnight_absence_breaks_the_following_morning(ward):
    # E1's night shift was covering 00:00-01:00 on day 1.
    demand = Demand(date(2026, 8, 11), start_time=0, end_time=60, headcount=1)
    result = make_result({("E1", 0): "N23"}, ward, demands=[demand])
    out = suggest_replacements(result, "E1", day=0, target_work_min=480)
    assert len(out.gaps) == 1
    assert out.gaps[0].date == date(2026, 8, 11)


# ── skills ──────────────────────────────────────────────────────────────────

def test_candidate_meeting_the_gap_skill_outranks_one_who_does_not():
    senior = Skill("seniority", "senior")
    staff = [
        Staff("E1", "Nurse 1", skillset=[senior]),
        Staff("E2", "Nurse 2"),                      # junior
        Staff("E3", "Nurse 3", skillset=[senior]),
    ]
    demand = Demand(START, 420, 900, headcount=1, skillset_required=[senior])
    result = make_result({("E1", 0): "D07"}, staff, demands=[demand])
    out = suggest_replacements(result, "E1", day=0, target_work_min=480)

    assert ids(out) == ["E3", "E2"]          # qualified first
    assert out.candidates[0].covers_gaps is True
    assert out.candidates[1].covers_gaps is False
    assert "does not meet seniority=senior" in out.candidates[1].notes


# ── ranking and the cost of saying yes ──────────────────────────────────────

def test_ranks_the_least_disrupted_staff_first(ward):
    # E2 already at target and on a 2-day run; E3 has worked nothing.
    result = make_result(
        {("E1", 2): "D07", ("E2", 0): "D07", ("E2", 1): "D07"}, ward)
    out = suggest_replacements(result, "E1", day=2, target_work_min=960)
    assert ids(out)[0] in {"E3", "E4"}
    e2 = next(c for c in out.candidates if c.employee_id == "E2")
    assert e2.consec_run == 3
    assert e2.target_delta == 480          # 960 worked + 480 = 480 over target


def test_reports_overtime_rather_than_hiding_the_candidate(ward):
    result = make_result({("E1", 0): "D07", ("E2", 1): "D07"}, ward)
    out = suggest_replacements(result, "E1", day=0, target_work_min=480)
    e2 = next(c for c in out.candidates if c.employee_id == "E2")
    assert e2.work_min_before == 480
    assert e2.work_min_after == 960
    assert e2.target_delta == 480
    assert "480 min over contracted hours" in e2.notes


def test_consecutive_run_includes_days_carried_over(ward):
    context = RosterContext(carry_consec={"E2": 4})
    result = make_result({("E1", 0): "D07"}, ward)
    out = suggest_replacements(result, "E1", day=0, target_work_min=480,
                               context=context)
    e2 = next(c for c in out.candidates if c.employee_id == "E2")
    assert e2.consec_run == 5
    assert "5 consecutive days" in e2.notes


def test_flags_a_weekend_day(ward):
    # day 5 from Mon 10 Aug is Sat 15 Aug.
    result = make_result({("E1", 5): "D07"}, ward, num_days=7)
    out = suggest_replacements(result, "E1", day=5, target_work_min=480)
    assert "weekend day" in out.candidates[0].notes


def test_limit_caps_the_list(ward):
    result = make_result({("E1", 0): "D07"}, ward)
    out = suggest_replacements(result, "E1", day=0, target_work_min=480, limit=2)
    assert len(out.candidates) == 2
