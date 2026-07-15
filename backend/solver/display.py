"""
Console display and merge helpers for roster results.

Dev/debug utilities only — nothing in the app imports these. They render
the result dict returned by RosterEngine.generate_roster().
"""
from __future__ import annotations
from datetime import timedelta

from solver.solver import _demands_for_day


def print_roster(result: dict) -> None:
    """
    Print a staff × day grid.
    Rows = staff members, Columns = days, Data = assigned shift code.
    """
    if result is None:
        print("No solution to display.")
        return

    assignments  = result["assignments"]
    staff_list   = result["staff"]
    roster_start = result["roster_start"]
    num_days     = result["num_days"]

    header = f"{'Staff':<20}" + "".join(
        f"{(roster_start + timedelta(days=d)).strftime('%d%b'):>8}"
        for d in range(num_days)
    )
    print(header)
    print("-" * len(header))

    for staff in staff_list:
        row = f"{staff.fullname:<20}"
        for d in range(num_days):
            assigned = [
                shift_code
                for (name, day, shift_code), val in assignments.items()
                if name == staff.employee_id and day == d and val == 1
            ]
            row += f"{''.join(assigned) if assigned else '-':>8}"
        print(row)

    # Overstaffing row: total workers assigned minus max headcount demanded per day
    demands      = result["demands"]
    shifts_list  = result["shifts"]
    work_shifts  = {s.code for s in shifts_list if s.shift_group.is_work_shift}

    print("-" * len(header))
    over_row = f"{'Overstaffed':>20}"
    for d in range(num_days):
        # Count staff assigned to any work shift on this day
        total_headcount = sum(
            1 for (name, day, shift_code), val in assignments.items()
            if day == d and val == 1 and shift_code in work_shifts
        )
        # Total headcount demanded across all demands on this day
        day_demands = _demands_for_day(demands, roster_start, d)
        total_demand = sum(demand.headcount for demand in day_demands if not demand.skillset_required)
        over_row += f"{total_headcount - total_demand:>+8}"

    print(over_row)
    print()


def print_timetable(result: dict) -> None:
    """
    Print a Gantt-style timetable for each day.
    Rows = staff members, Columns = 30-min slots (00:00–23:30).
    ## marks slots where the staff member is on shift.
    One table per day.
    """
    if result is None:
        print("No solution to display.")
        return

    assignments  = result["assignments"]
    staff_list   = result["staff"]
    shifts       = result["shifts"]
    roster_start = result["roster_start"]
    num_days     = result["num_days"]

    shift_map  = {s.code: s for s in shifts}
    slot_times = [h * 60 + m for h in range(24) for m in (0, 30)]
    num_slots  = len(slot_times)
    NAME_W     = 20
    SLOT_W     = 3

    for d in range(num_days):
        day_label = (roster_start + timedelta(days=d)).strftime("%a %d %b %Y")
        sep = "=" * (NAME_W + num_slots * SLOT_W + 1)
        print(f"\n{sep}")
        print(f"  {day_label}")
        print(sep)

        hour_row = " " * NAME_W
        tick_row = " " * NAME_W
        for t in slot_times:
            h, m = divmod(t, 60)
            if m == 0 and h % 2 == 0:
                hour_row += f"{h:02d}:00".ljust(SLOT_W * 4)
            tick_row += "|  " if m == 0 else ".  "
        print(hour_row)
        print(tick_row)
        print("-" * (NAME_W + num_slots * SLOT_W + 1))

        for staff in staff_list:
            # Shift assigned on this day
            assigned_shift = None
            for (emp_id, day, shift_code), val in assignments.items():
                if emp_id == staff.employee_id and day == d and val == 1:
                    assigned_shift = shift_map.get(shift_code)
                    break

            # Overnight carryover from previous day
            prev_shift = None
            if d > 0:
                for (emp_id, day, shift_code), val in assignments.items():
                    if emp_id == staff.employee_id and day == d - 1 and val == 1:
                        s = shift_map.get(shift_code)
                        if s and s.end_time <= s.start_time:  # overnight shift
                            prev_shift = s
                        break

            row = f"{staff.fullname:<{NAME_W}}"

            for t in slot_times:
                active = False

                # Current day shift
                if assigned_shift:
                    s_start = assigned_shift.start_time
                    s_end   = assigned_shift.end_time
                    if s_end <= s_start:
                        s_end = 1440  # render only up to midnight for current day
                    active = active or (s_start < t + 30 and s_end > t)

                # Overnight carryover: render from 00:00 up to the shift's end_time
                if prev_shift:
                    active = active or (t < prev_shift.end_time)

                row += "## " if active else "   "

            print(row)


def print_staff_summary(result: dict) -> None:
    """
    Print a per-staff summary table.

    Columns: staff name, total work hours, weekend days worked, night shifts
    worked, and max consecutive working days over the roster.
    """
    if result is None:
        print("No solution to display.")
        return

    assignments   = result["assignments"]
    consec_days   = result["consec_days"]
    staff_list    = result["staff"]
    shifts        = result["shifts"]
    roster_start  = result["roster_start"]
    num_days      = result["num_days"]

    shift_map = {s.code: s for s in shifts}

    print(f"{'Staff':<20} {'Work(hrs)':>10} {'Weekend Days':>13} {'Night Shifts':>13} {'Max Consecutive Working Days':>28}")
    print("-" * (20 + 11 + 14 + 14 + 29))

    for n, staff in enumerate(staff_list):
        total_work   = 0
        weekend_days = 0
        night_shifts = 0

        for d in range(num_days):
            day_date   = roster_start + timedelta(days=d)
            is_weekend = day_date.weekday() >= 5

            for (emp_id, day, shift_code), val in assignments.items():
                if emp_id == staff.employee_id and day == d and val == 1:
                    shift = shift_map.get(shift_code)
                    if shift:
                        total_work += shift.work_time

                        if is_weekend:
                            weekend_days += 1

                        if shift.shift_group.is_night_shift:
                            night_shifts += 1
                    break

        max_run = max(consec_days[n, d] for d in range(num_days))

        print(f"{staff.fullname:<20} {total_work/60:>10.1f} {weekend_days:>13} {night_shifts:>13} {max_run:>28}")


def merge_roster_results(result_1: dict, result_2: dict) -> dict:
    """
    Merge two roster results into a single result dict for combined display.

    Days from result_1 that fall on or after result_2's roster_start are
    dropped, naturally handling any lookahead day overlap. Day indices in
    result_2 are offset by the calendar difference between the two
    roster_start dates so they map correctly onto a single timeline.

    Only the fields required for display are included in the merged result:
    assignments, roster_start, num_days, staff, shifts, and demands.
    print_staff_summary() should not be called on the merged result as
    consec_days is not carried over.
    """
    roster_start_1 = result_1["roster_start"]
    roster_start_2 = result_2["roster_start"]
    offset         = (roster_start_2 - roster_start_1).days

    assignments_1 = {
        (name, d, code): val
        for (name, d, code), val in result_1["assignments"].items()
        if d < offset
    }

    assignments_2 = {
        (name, d + offset, code): val
        for (name, d, code), val in result_2["assignments"].items()
    }

    return {
        "assignments":  {**assignments_1, **assignments_2},
        "roster_start": roster_start_1,
        "num_days":     offset + result_2["num_days"],
        "staff":        result_1["staff"],
        "shifts":       result_1["shifts"],
        "demands":      result_1["demands"] + result_2["demands"],
    }
