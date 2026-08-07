"""The post-solve audit, checked against hand-built rosters.

validate_roster() is the safety net that catches the solver returning a roster
that breaks its own rules, so it needs its own net: these tests build small
assignment grids by hand — no CP-SAT run — and assert the audit reports exactly
the rule that was broken, and stays quiet when nothing is.

Hand-built grids matter here. A roster that breaks a rule is by definition one
the solver will not produce, so a breach can only be tested by constructing it.
"""
from datetime import date

import pytest

from solver.models import Demand, Shift, ShiftGroup, Skill, Staff
from solver.rules import Rule
from solver.solver import ConditionalConstraint, RosterContext
from solver.validate import validate_roster

DAY   = ShiftGroup("DSG", is_night_shift=False, is_work_shift=True)
NIGHT = ShiftGroup("NSG", is_night_shift=True,  is_work_shift=True)
LEAVE = ShiftGroup("Leaves", is_work_shift=False)

D = Shift("D07", "0700-1500", DAY,   start_time=420,  end_time=900,  work_time=480)
E = Shift("E15", "1500-2300", DAY,   start_time=900,  end_time=1380, work_time=480)
N = Shift("N23", "2300-0700", NIGHT, start_time=1380, end_time=420,  work_time=480)
AL = Shift("AL", "Annual Leave", LEAVE, start_time=0, end_time=0,    work_time=480)

SHIFTS = [D, E, N, AL]
START  = date(2026, 8, 10)


def make_result(assignments, staff, num_days=3, demands=None, consec=None):
    """A result dict in the shape generate_roster() returns.

    `assignments` is {(employee_id, day): shift_code} — one entry per assigned
    cell, which is all the audit reads.
    """
    return {
        "assignments":  {(emp, d, code): 1 for (emp, d), code in assignments.items()},
        "staff":        staff,
        "shifts":       SHIFTS,
        "demands":      demands if demands is not None else [],
        "num_days":     num_days,
        "roster_start": START,
        "consec_days":  consec or {},
    }


def rules_hit(violations):
    return {v.rule for v in violations}


@pytest.fixture
def two_staff():
    return [Staff("E1", "Ann Lee"), Staff("E2", "Ben Ng")]


# ── the quiet case ──────────────────────────────────────────────────────────

def test_clean_roster_reports_nothing(two_staff):
    # One 480-min shift each on day 0, target 480, and a demand they cover.
    demand = Demand(START, start_time=480, end_time=840, headcount=2)
    result = make_result({("E1", 0): "D07", ("E2", 0): "D07"}, two_staff,
                         num_days=1, demands=[demand])
    assert validate_roster(result, target_work_min=480) == []


# ── one rule at a time ──────────────────────────────────────────────────────

def test_two_work_shifts_in_a_day(two_staff):
    result = make_result(
        {("E1", 0): "D07", ("E1", 1): "E15", ("E2", 0): "D07"},
        two_staff, num_days=2,
        demands=[Demand(START, 480, 840, headcount=1),
                 Demand(START.replace(day=11), 480, 840, headcount=1)],
    )
    # E1 works 960, E2 480 — pin the double-booking by also moving E1's second
    # shift onto day 0.
    result["assignments"][("E1", 0, "E15")] = 1
    del result["assignments"][("E1", 1, "E15")]
    assert Rule.one_shift_per_day in rules_hit(validate_roster(result, target_work_min=960))


def test_target_minutes_must_match_exactly(two_staff):
    result = make_result({("E1", 0): "D07", ("E2", 0): "D07"}, two_staff, num_days=1,
                         demands=[Demand(START, 480, 840, headcount=2)])
    hits = [v for v in validate_roster(result, target_work_min=960)
            if v.rule is Rule.contracted_hours]
    assert {v.employee_id for v in hits} == {"E1", "E2"}
    assert "works 480 min, target is 960 min" in hits[0].message


def test_leave_counts_toward_contracted_hours(two_staff):
    # AL credits 480 min like a worked shift, so E1 hits target without working.
    result = make_result({("E1", 0): "AL", ("E2", 0): "D07"}, two_staff, num_days=1,
                         demands=[Demand(START, 480, 840, headcount=1)])
    hits = [v for v in validate_roster(result, target_work_min=480,
                                       pre_assignments=[(0, 0, 3)])
            if v.rule is Rule.contracted_hours]
    assert hits == []


def test_uncovered_demand_is_reported_with_the_worst_minute(two_staff):
    # Demand needs 2 from 07:00, but only E1 is on.
    demand = Demand(START, start_time=420, end_time=900, headcount=2)
    result = make_result({("E1", 0): "D07"}, two_staff, num_days=1, demands=[demand])
    hits = [v for v in validate_roster(result, target_work_min=480)
            if v.rule is Rule.shift_cover]
    assert len(hits) == 1
    assert "needs 2 staff but has 1 at 07:00" in hits[0].message


def test_skill_filtered_demand_ignores_staff_without_the_skill():
    senior = Staff("E1", "Ann Lee", skillset=[Skill("seniority", "senior")])
    junior = Staff("E2", "Ben Ng",  skillset=[Skill("seniority", "junior")])
    demand = Demand(START, 420, 900, headcount=1,
                    skillset_required=[Skill("seniority", "senior")])
    # Only the junior is rostered, so the senior-only demand is unmet.
    result = make_result({("E2", 0): "D07"}, [senior, junior], num_days=1, demands=[demand])
    hits = [v for v in validate_roster(result, target_work_min=480)
            if v.rule is Rule.shift_cover]
    assert len(hits) == 1
    assert "seniority=senior" in hits[0].message


def test_non_permitted_shift(two_staff):
    day_only = Staff("E1", "Ann Lee", permitted_shifts=[D])
    result = make_result({("E1", 0): "E15"}, [day_only], num_days=1,
                         demands=[Demand(START, 900, 1380, headcount=1)])
    hits = [v for v in validate_roster(result, target_work_min=480)
            if v.rule is Rule.permitted_shifts]
    assert len(hits) == 1
    assert "non-permitted shift E15" in hits[0].message


def test_rest_shift_that_was_never_pre_assigned(two_staff):
    # AL appears with no matching pre-assignment — the solver must not invent leave.
    result = make_result({("E1", 0): "AL"}, [two_staff[0]], num_days=1)
    hits = [v for v in validate_roster(result, target_work_min=480)
            if v.rule is Rule.booked_leave]
    assert len(hits) == 1
    assert "never pre-assigned" in hits[0].message


def test_work_on_a_day_with_no_demand(two_staff):
    result = make_result({("E1", 0): "D07"}, [two_staff[0]], num_days=1, demands=[])
    hits = [v for v in validate_roster(result, target_work_min=480)
            if v.rule is Rule.days_without_demand]
    assert len(hits) == 1


# ── rest rules (the shared primitive) ───────────────────────────────────────

NIGHT_THEN_REST = ConditionalConstraint(trigger="NSG", trigger_val=1, offset=1,
                                        enforce="*", enforce_val=0)


def test_working_the_day_after_a_night_shift(two_staff):
    result = make_result({("E1", 0): "N23", ("E1", 1): "D07"}, [two_staff[0]], num_days=2,
                         demands=[Demand(START, 1380, 420, headcount=1),
                                  Demand(START.replace(day=11), 480, 840, headcount=1)])
    hits = [v for v in validate_roster(result, target_work_min=960,
                                       conditional_constraints=[NIGHT_THEN_REST])
            if v.rule is Rule.rest_rules]
    assert len(hits) == 1
    assert hits[0].day == 1
    assert "blocked by rule (NSG on day 0)" in hits[0].message


def test_rest_rule_carried_over_from_the_previous_roster(two_staff):
    # E1 worked a night on the previous roster's last day, so day 0 must be clear.
    context = RosterContext(carry_shifts={"E1": ("NSG", -1)})
    result = make_result({("E1", 0): "D07"}, [two_staff[0]], num_days=1,
                         demands=[Demand(START, 480, 840, headcount=1)])
    hits = [v for v in validate_roster(result, target_work_min=480,
                                       conditional_constraints=[NIGHT_THEN_REST],
                                       context=context)
            if v.rule is Rule.rest_rules]
    assert len(hits) == 1
    assert "carried over from previous roster" in hits[0].message


def test_night_shift_covers_the_next_morning(two_staff):
    # A 23:00-07:00 night on day 0 is on the floor at 00:30 on day 1: no shortfall.
    demand = Demand(START.replace(day=11), start_time=0, end_time=60, headcount=1)
    result = make_result({("E1", 0): "N23"}, [two_staff[0]], num_days=2, demands=[demand])
    hits = [v for v in validate_roster(result, target_work_min=480)
            if v.rule is Rule.shift_cover]
    assert hits == []


# ── consecutive-day bookkeeping ─────────────────────────────────────────────

def test_reported_consecutive_days_must_survive_a_recount(two_staff):
    result = make_result(
        {("E1", 0): "D07", ("E1", 1): "D07"}, [two_staff[0]], num_days=2,
        demands=[Demand(START, 480, 840, headcount=1),
                 Demand(START.replace(day=11), 480, 840, headcount=1)],
        consec={(0, 0): 1, (0, 1): 1},   # should be 2 on day 1
    )
    hits = [v for v in validate_roster(result, target_work_min=960)
            if v.rule is Rule.consecutive_days]
    assert len(hits) == 1
    assert "recount gives 2" in hits[0].message


# ── the identity/label/cross-reference split ────────────────────────────────

def test_violations_carry_a_label_and_constraint_number(two_staff):
    result = make_result({("E1", 0): "D07"}, [two_staff[0]], num_days=1,
                         demands=[Demand(START, 480, 840, headcount=1)])
    v = next(v for v in validate_roster(result, target_work_min=960)
             if v.rule is Rule.contracted_hours)
    assert v.rule == "contracted_hours"   # stable identity, what's stored
    assert v.label == "Contracted hours"  # what the operator reads
    assert v.constraint == "C2"           # cross-reference into generate_roster()


def test_consecutive_days_has_no_constraint_number():
    # It's a soft objective term in the solver, not a numbered constraint.
    assert Rule.consecutive_days.constraint is None
