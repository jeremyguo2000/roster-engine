from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date, timedelta
from ortools.sat.python import cp_model
from solver.models import Demand, Shift, Staff


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _shift_covers_checkpoint(shift: Shift, checkpoint: int) -> tuple[bool, int]:
    """
    Determine whether a given shift covers a specific time checkpoint.

    Returns (covers, day_offset): day_offset is -1 when the checkpoint is
    covered by the tail of an overnight shift started the previous day,
    0 when covered same-day. Overnight shifts are those with
    end_time <= start_time.
    """
    s_start = shift.start_time
    s_end   = shift.end_time
    is_overnight = s_end <= s_start

    # Carryover case: overnight shift from day d-1 covers early hours of day d
    # checkpoint falls in [0, s_end) using raw end_time
    if is_overnight and checkpoint < s_end:
        return True, -1

    # Same-day case: shift covers checkpoint within its own day
    if is_overnight:
        s_end += 1440  # extend for same-day coverage check
    if s_start <= checkpoint < s_end:
        return True, 0

    return False, 0


def _check_points(demand: Demand, shifts: list[Shift]) -> set[int]:
    """
    Return the minimal set of time points (minutes from midnight) at which
    the set of covering shifts may change within the demand window.
 
    These are: the demand start, plus any shift start or end that falls
    strictly inside the demand window. Coverage is constant between
    consecutive check points, so enforcing headcount at each one is
    sufficient to enforce it across the entire window.
    """
    d_start = demand.start_time
    d_end   = demand.end_time
    if d_end <= d_start:
        d_end += 1440

    points = {d_start}
    for shift in shifts:
        s_start = shift.start_time
        s_end = shift.end_time
            
        if d_start < s_start < d_end:
            points.add(s_start)
        if d_start < s_end < d_end:
            points.add(s_end)

    return points


def _demands_for_day(demands: list[Demand], roster_start: date, day_index: int) -> list[Demand]:
    """Return all demands whose date matches the given day index in the roster."""
    target = roster_start + timedelta(days=day_index)
    return [d for d in demands if d.date == target]
 
 
# ---------------------------------------------------------------------------
# RosterContext
# ---------------------------------------------------------------------------
 
@dataclass
class RosterContext:
    """
    Carry-over state from a previous roster for use in chained roster generation.
 
    Attributes
    ----------
    carry_consec       : dict mapping Staff to their consecutive working day count
                         at the end of the previous roster.
    carry_shifts       : dict mapping staff id to a (shift_group_code, days_ago)
                         tuple representing the most recent shift assigned near the end
                         of the previous roster.
                         days_ago is a negative integer relative to the new roster start:
                         -1 = assigned on the last day, -2 = second-to-last day, etc.
                         Staff with no assignments in the previous roster are absent.
    carry_night_shifts : dict mapping employee_id to a specific shift code for staff
                         who were on an overnight shift on the last day of the previous
                         roster. Used by C5 to correctly count carryover night staff
                         toward day 0 early morning demand coverage.
 
    Examples
    --------
    RosterContext(
        carry_consec       = {SN_1: 2, SN_2: 0, SN_3: 1},
        carry_shifts       = {"SN_3": ("NSG", -1), "SN_4": ("ESG", -2)},
        carry_night_shifts = {"SN_3": "N2210"},
    )
    """
    carry_consec:       dict[str, int]             = field(default_factory=dict)
    carry_shifts:       dict[str, tuple[str, int]] = field(default_factory=dict)
    carry_night_shifts: dict[str, str]             = field(default_factory=dict)

# ---------------------------------------------------------------------------
# ConditionalConstraint
# ---------------------------------------------------------------------------
 
@dataclass
class ConditionalConstraint:
    """
    A dynamic if/then constraint applied during roster generation.
 
    When any shift in the trigger ShiftGroup equals trigger_val on day d,
    the solver enforces enforce_val on all shifts in the enforce ShiftGroup
    on day d + offset.
 
    Attributes
    ----------
    trigger      : ShiftGroup code string (e.g. "NSG", "DSG"), or "*" for all shifts.
    trigger_val  : 1 = fires when any trigger shift is assigned,
                   0 = fires when no trigger shift is assigned.
    offset       : Day offset from the trigger day. Can be negative.
                   e.g. 1 = next day, -1 = previous day, 2 = two days after.
    enforce      : ShiftGroup code string (e.g. "DSG"), or "*" for all shifts.
    enforce_val  : 0 = block (set to 0), 1 = force (set to 1).
 
    Examples
    --------
    # Block all work shifts the day after a night shift
    ConditionalConstraint(trigger="NSG", trigger_val=1, offset=1, enforce="*",   enforce_val=0)
 
    # Block DSG shifts 2 days after a night shift
    ConditionalConstraint(trigger="NSG", trigger_val=1, offset=2, enforce="DSG", enforce_val=0)
 
    # Block night shifts the day before a leave
    ConditionalConstraint(trigger="Leaves", trigger_val=1, offset=-1, enforce="NSG", enforce_val=0)
    """
    trigger:     str   # ShiftGroup code, or "*" for all shifts
    trigger_val: int   # 1 = fires when any trigger shift is assigned, 0 = when none assigned
    offset:      int   # day offset from trigger day, can be negative
    enforce:     str   # ShiftGroup code, or "*" for all shifts
    enforce_val: int   # 0 = block (set to 0), 1 = force (set to 1)
    
    
# ---------------------------------------------------------------------------
# RosterEngine
# ---------------------------------------------------------------------------

class RosterEngine:
    """
    Encapsulates the roster solver configuration.
    Set once, then call generate_roster() repeatedly with different
    demands and start dates.
 
    Parameters
    ----------
    shifts                  : Pool of Shift objects available every day.
    staff_list              : List of Staff objects to be scheduled.
    conditional_constraints : List of ConditionalConstraint objects defining dynamic
                              if/then shift rules. Applied during solving and also
                              carried over across roster boundaries via RosterContext.
                              Defaults to an empty list (no rules).
    weight_consec           : Objective weight for minimising max consecutive working
                              days per staff. Default 100.
    weight_overstaff        : Objective weight for minimising overstaffing spread
                              across days. Default 20.
    weight_burden           : Objective weight for minimising the combined night/weekend
                              burden score across staff. Default 10.
    weight_night            : Multiplier applied to night shifts in the burden score.
                              Default 2.
    weight_weekend          : Multiplier applied to weekend shifts in the burden score.
                              Default 1.
    time_limit_s            : CP-SAT wall-clock time limit in seconds. Default 600.
    """

    def __init__(
        self,
        shifts:                  list[Shift],
        staff_list:              list[Staff],
        conditional_constraints: list  = None,
        weight_consec:           int   = 100,
        weight_overstaff:        int   = 20,
        weight_burden:           int   = 10,
        weight_night:            int   = 2,
        weight_weekend:          int   = 1,
        time_limit_s:            int   = 600,
    ):
        self.shifts                  = shifts
        self.staff_list              = staff_list
        self.conditional_constraints = conditional_constraints or []
        self.weight_overstaff        = weight_overstaff
        self.weight_consec           = weight_consec
        self.weight_burden           = weight_burden
        self.weight_night            = weight_night
        self.weight_weekend          = weight_weekend
        self.time_limit_s            = time_limit_s
    
    def build_pre_assignments_for_leaves(
        self,
        leaves:       list[tuple[str, date, str]],
        roster_start: date,
        num_days:     int,
    ) -> list[tuple[int, int, int]]:
        """
        Convert a list of (employee_id, leave_date, shift_code) tuples into
        pre_assignment index tuples (n, d, s) for use in generate_roster().

        Leave dates that fall outside the roster window [0, num_days) are
        silently skipped. Raises ValueError if a staff name or shift code
        is not found.

        Parameters
        ----------
        leaves       : List of (employee_id, leave_date, shift_code) tuples.
        roster_start : The roster start date used to compute day index d.

        Returns
        -------
        List of (n, d, s) index tuples ready to pass to generate_roster().
        """
        staff_index = {staff.employee_id: n for n, staff in enumerate(self.staff_list)}
        shift_index = {shift.code: s for s, shift in enumerate(self.shifts)}

        pre_assignments = []

        for employee_id, leave_date, shift_code in leaves:
            n = staff_index.get(employee_id)
            if n is None:
                raise ValueError(f"Staff '{employee_id}' not found")
            s = shift_index.get(shift_code)
            if s is None:
                raise ValueError(f"Shift '{shift_code}' not found")
            d = (leave_date - roster_start).days
            if 0 <= d < num_days:
                pre_assignments.append((n, d, s))

        return pre_assignments
    
 
    def build_roster_context(self, result: dict, roster_start: date) -> RosterContext:
        """
        Extract carry-over state from a completed roster result for use
        in the next generate_roster() call.
 
        Parameters
        ----------
        result       : Result dict returned by generate_roster().
        roster_start : Start date of the next roster. Used to determine
                       the actual last day of the current roster, correctly
                       excluding any lookahead days beyond the real schedule.
 
        Returns
        -------
        RosterContext containing:
        - carry_consec       : consecutive working day count per staff at end of roster.
        - carry_shifts       : most recent shift group and relative day offset per staff,
                               used by C_context to apply ConditionalConstraints across
                               the roster boundary.
        - carry_night_shifts : specific shift code for staff on an overnight shift on the
                               last day of the roster, used by C5 to count carryover night
                               staff toward day 0 early morning demand coverage.
        """
        assignments = result["assignments"]
        consec_days = result["consec_days"]
        staff_list  = result["staff"]
        shifts      = result["shifts"]
 
        last_day  = (roster_start - result["roster_start"]).days - 1
        shift_map = {s.code: s for s in shifts}
 
        carry_consec = {}
        carry_shifts = {}
        carry_night_shifts = {}

        # Index assignments once: (employee_id, day) -> shift_code
        assigned_code = {
            (employee_id, day): shift_code
            for (employee_id, day, shift_code), val in assignments.items()
            if val == 1
        }

        for n, staff in enumerate(staff_list):
            carry_consec[staff.employee_id] = consec_days[n, last_day]

            # Scan backwards to find the most recent assignment.
            # Staff with no assignments are simply absent from carry_shifts.
            for d in range(last_day, -1, -1):
                code = assigned_code.get((staff.employee_id, d))
                if code is None:
                    continue
                shift = shift_map.get(code)
                if shift:
                    carry_shifts[staff.employee_id] = (
                        shift.shift_group.code,
                        d - last_day - 1,  # negative offset relative to new roster start
                    )
                    if shift.shift_group.is_night_shift and d == last_day:
                        carry_night_shifts[staff.employee_id] = shift.code
                break
 
        return RosterContext(
            carry_consec=carry_consec,
            carry_shifts=carry_shifts,
            carry_night_shifts=carry_night_shifts,
        )
    
    
    def generate_roster(
        self,
        roster_start:    date,
        num_days:        int,
        target_work_min: float,
        demands:         list[Demand],
        pre_assignments: list[tuple[int, int, int]],
        context:         RosterContext | None = None,
    ) -> dict | None:
        """
        Generate a roster starting from roster_start.
 
        Parameters
        ----------
        roster_start    : Calendar date of day 0 in the roster window.
        num_days        : Length of the roster window in days, including any
                          lookahead days.
        target_work_min : Exact working minutes each staff member must accumulate
                          over the roster window (enforced by C4).
        demands         : Demand objects with specific dates and headcount
                          requirements. Days with no demand are blocked from
                          receiving any work shift assignments (C8).
        pre_assignments : List of (n, d, s) index tuples representing
                          pre-assigned leave shifts. Built via
                          build_pre_assignments_for_leaves().
        context         : Optional RosterContext from a previous roster run.
                          When provided, seeds the consecutive day counter
                          and enforces night shift rest constraints across
                          the roster boundary.
 
        Returns
        -------
        Result dict on success, None if no feasible solution is found within
        the time limit. The result dict contains: assignments, consec_days,
        max_consecutive, status, roster_start, num_days, staff, shifts, demands.
        """
        shifts         = self.shifts
        staff_list     = self.staff_list
        time_limit_s   = self.time_limit_s

        num_staff  = len(staff_list)
        num_shifts = len(shifts)
        
        staff_index = {staff.employee_id: n for n, staff in enumerate(staff_list)}

        weekends = [d for d in range(num_days)
                    if (roster_start + timedelta(days=d)).weekday() >= 5]
        
        work_shifts = [s for s in range(num_shifts) 
                       if shifts[s].shift_group.is_work_shift]
        night_shifts = [s for s in work_shifts 
                        if shifts[s].shift_group.is_night_shift]
        rest_shifts = [s for s in range(num_shifts) 
                       if not shifts[s].shift_group.is_work_shift]
        

        # -------------------------------------------------------------------
        # Model
        # -------------------------------------------------------------------
        model = cp_model.CpModel()

        # x[n, d, s] = 1 if staff n is assigned shift s on day d
        x = {}
        for n in range(num_staff):
            for d in range(num_days):
                for s in range(num_shifts):
                    x[n, d, s] = model.NewBoolVar(f"x_n{n}_d{d}_s{s}")
        
        # worked_days[n, d] = 1 if staff n works any shift on day d
        worked_days = {}
        for n in range(num_staff):
            for d in range(num_days):
                worked_days [n, d] = model.NewBoolVar(f"worked_days_n{n}_d{d}")
                model.AddMaxEquality(
                    worked_days [n, d],
                    [x[n, d, s] for s in work_shifts]
                )


        # -------------------------------------------------------------------
        # Constraints
        # -------------------------------------------------------------------

        # C1 — At most one work shift per staff per day 
        for n in range(num_staff):
            for d in range(num_days):
                model.Add(sum(x[n, d, s] for s in work_shifts) <= 1)

        # C4 — Exactly target_minutes of work per staff over the roster
        for n in range(num_staff):
            model.Add(
                sum(
                    x[n, d, s] * shifts[s].work_time
                    for d in range(num_days)
                    for s in range(num_shifts)
                ) == target_work_min
            )

        # Precompute carry_night_coverage: shift_idx -> [staff indices]
        # for overnight shifts carried over from the previous roster (day -1)
        carry_night_coverage: dict[int, list[int]] = {}
        if context and context.carry_night_shifts:
            for shift_idx in work_shifts:
                shift_code = shifts[shift_idx].code
                for employee_id, carry_shift_code in context.carry_night_shifts.items():
                    if carry_shift_code == shift_code:
                        n = staff_index.get(employee_id)
                        if n is not None:
                            carry_night_coverage.setdefault(shift_idx, []).append(n)
        
        # Precompute C5: for each demand, the check points and which shifts
        # cover each check point.
        # demand_coverage[(d_idx, check_point)] = list of shift indices covering it
        demand_coverage: list[tuple] = []
        for d in range(num_days):
            for demand in _demands_for_day(demands, roster_start, d):
                for point in _check_points(demand, shifts):
                    covering = []
                    carry_count = 0
                    for shift_idx in work_shifts:
                        covers, day_offset = _shift_covers_checkpoint(shifts[shift_idx], point)
                        if covers:
                            shift_day = d + day_offset
                            if 0 <= shift_day < num_days:
                                covering.append((shift_idx, day_offset))
                            elif shift_day == -1 and shift_idx in carry_night_coverage:
                                carry_count += sum(
                                    1 for n in carry_night_coverage[shift_idx]
                                    if not demand.skillset_required
                                    or staff_list[n].meets_requirements(demand.skillset_required)
                                )
                    demand_coverage.append((d, demand, covering, carry_count))
                    
        # C5 — Demand coverage at each boundary check point
        for d, demand, covering, carry_count in demand_coverage:
            if not covering:
                continue
            
            if not demand.skillset_required:
                model.Add(
                    sum(
                        x[n, d + day_offset, shift_idx]
                        for n in range(num_staff)
                        for shift_idx, day_offset in covering
                    ) >= demand.headcount - carry_count
                )
            else:
                eligible = [
                    n for n in range(num_staff)
                    if staff_list[n].meets_requirements(demand.skillset_required)
                ]
                model.Add(
                    sum(
                        x[n, d + day_offset, shift_idx]
                        for n in eligible
                        for shift_idx, day_offset in covering
                    ) >= demand.headcount - carry_count
                )

        # C6 — Permitted work shifts
        for n, staff in enumerate(staff_list):
            if staff.permitted_shifts:
                for d in range(num_days):
                    for s in work_shifts:
                        if shifts[s] not in staff.permitted_shifts:
                            model.Add(x[n, d, s] == 0)
        
        # C7 — Pre-assignments:
        #       set all un-assigned rest shifts to 0,
        #       set all pre-assigned shifts to 1,
        #       set all other work shifts on that day to 0.
        #
        #       This allows multiple rest shifts to be pre-assigned on the same
        #       day (e.g. AL + FDR) while still enforcing that at most one work
        #       shift can be pre-assigned per staff per day.
        pre_assigned = set(pre_assignments)
        for n in range(num_staff):
            for d in range(num_days):
                for s in rest_shifts:
                    if (n, d, s) not in pre_assigned:
                        model.Add(x[n, d, s] == 0)
                        
        for n, d, assigned_shift in pre_assignments:
            model.Add(x[n, d, assigned_shift] == 1)
            for s in work_shifts:
                if s != assigned_shift:
                    model.Add(x[n, d, s] == 0)
                    
        # C8 — No work shifts on days with no demand
        for d in range(num_days):
            if not _demands_for_day(demands, roster_start, d):
                for n in range(num_staff):
                    for s in work_shifts:
                        model.Add(x[n, d, s] == 0)
        
        # C9 — Dynamic conditional constraints
        for i, rule in enumerate(self.conditional_constraints):
            trigger_indices = (
                list(range(num_shifts)) if rule.trigger == "*"
                else [s for s in range(num_shifts) if shifts[s].shift_group.code == rule.trigger]
            )
            enforce_indices = (
                list(range(num_shifts)) if rule.enforce == "*"
                else [s for s in range(num_shifts) if shifts[s].shift_group.code == rule.enforce]
            )
 
            if not trigger_indices or not enforce_indices:
                continue
 
            for n in range(num_staff):
                for d in range(num_days):
                    target_d = d + rule.offset
                    if not (0 <= target_d < num_days):
                        continue
 
                    triggered = model.NewBoolVar(f"cc_{i}_n{n}_d{d}")
                    if rule.trigger_val == 1:
                        model.AddMaxEquality(triggered, [x[n, d, s] for s in trigger_indices])
                    else:
                        model.AddMinEquality(triggered, [x[n, d, s].Not() for s in trigger_indices])
 
                    if rule.enforce_val == 0:
                        model.Add(
                            sum(x[n, target_d, s] for s in enforce_indices) == 0
                        ).OnlyEnforceIf(triggered)
                    else:
                        for s in enforce_indices:
                            model.Add(x[n, target_d, s] == 1).OnlyEnforceIf(triggered)
                            
        # Boundary constraints from previous roster carry-over
        if context:
            for staff_name, (trigger_code, days_ago) in context.carry_shifts.items():
                n = staff_index.get(staff_name)
                if n is None:
                    continue
                for rule in self.conditional_constraints:
                    if rule.trigger != trigger_code or rule.trigger_val != 1:
                        continue
                    target_d = days_ago + rule.offset
                    if not (0 <= target_d < num_days):
                        continue
                    enforce_indices = (
                        list(range(num_shifts)) if rule.enforce == "*"
                        else [s for s in range(num_shifts)
                              if shifts[s].shift_group.code == rule.enforce]
                    )
                    if not enforce_indices:
                        continue
                    if rule.enforce_val == 0:
                        model.Add(sum(x[n, target_d, s] for s in enforce_indices) == 0)
                    else:
                        for s in enforce_indices:
                            model.Add(x[n, target_d, s] == 1)
        

        # -------------------------------------------------------------------
        # Objective — minimise max consecutive working days, night shifts, weekend days
        # -------------------------------------------------------------------
        
        max_overstaff = model.NewIntVar(0, num_staff, "max_overstaff")
        min_overstaff = model.NewIntVar(-num_staff, num_staff, "min_overstaff")
        
        max_consec = model.NewIntVar(0, num_days, "max_consec")
        
        # Burden score per staff — combined weight of nights and weekends
        max_burden = model.NewIntVar(0, num_days * 2, "max_burden")
        
        # Overstaffing fairness across days
        for d in range(num_days):
            day_demands  = _demands_for_day(demands, roster_start, d)

            if not day_demands:
                continue
            
            total_demand = sum(dem.headcount for dem in day_demands if not dem.skillset_required)
 
            daily_headcount = model.NewIntVar(0, num_staff, f"headcount_d{d}")
            model.Add(daily_headcount == sum(x[n, d, s]
                for n in range(num_staff)
                for s in work_shifts))
 
            overstaff = model.NewIntVar(-num_staff, num_staff, f"overstaff_d{d}")
            model.Add(overstaff == daily_headcount - total_demand)
            model.Add(max_overstaff >= overstaff)
            model.Add(min_overstaff <= overstaff)

        # consec_days[n, d] = length of working run ending at day d
        consec_days = {}
        for n in range(num_staff):
            for d in range(num_days):
                consec_days[n, d] = model.NewIntVar(0, num_days, f"cr_n{n}_d{d}")
            
            # Consecutive working days from previous roster carry-over
            carry = context.carry_consec.get(staff_list[n].employee_id, 0) if context else 0
            if carry == 0:
                model.Add(consec_days[n, 0] == worked_days[n, 0])
            else:
                model.Add(consec_days[n, 0] == carry * worked_days[n, 0] + worked_days[n, 0])

            for d in range(1, num_days):
                model.Add(consec_days[n, d] == 0).OnlyEnforceIf(worked_days[n, d].Not())
                model.Add(consec_days[n, d] == consec_days[n, d - 1] + 1).OnlyEnforceIf(worked_days[n, d])

            for d in range(num_days):
                model.Add(max_consec >= consec_days[n, d])
                
            # Combined burden of nights and weekends
            night_count   = model.NewIntVar(0, num_days, f"night_n{n}")
            weekend_count = model.NewIntVar(0, num_days, f"weekend_n{n}")
            burden        = model.NewIntVar(0, num_days * 2, f"burden_n{n}")
 
            model.Add(night_count == sum(x[n, d, s]
                for d in range(num_days)
                for s in night_shifts))
 
            model.Add(weekend_count == sum(x[n, d, s]
                for d in weekends
                for s in work_shifts))
 
            model.Add(burden == night_count * self.weight_night 
                            + weekend_count * self.weight_weekend)
            model.Add(max_burden >= burden)

        # Weighted minimisation
        model.Minimize((max_overstaff - min_overstaff) * self.weight_overstaff 
                                          + max_consec * self.weight_consec 
                                          + max_burden * self.weight_burden)


        # -------------------------------------------------------------------
        # Solve
        # -------------------------------------------------------------------
        cp_solver = cp_model.CpSolver()
        cp_solver.parameters.max_time_in_seconds = time_limit_s
        cp_solver.parameters.num_search_workers  = 8
        cp_solver.parameters.log_search_progress = False

        status = cp_solver.Solve(model)

        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            print(f"[RosterEngine] No solution found. Status: {cp_solver.StatusName(status)}")
            return None

        assignments = {
            (staff_list[n].employee_id, d, shifts[s].code): cp_solver.Value(x[n, d, s])
            for n in range(num_staff)
            for d in range(num_days)
            for s in range(num_shifts)
        }

        # consec_days_values[(n, d)] = run length ending at day d for staff n
        consec_days_values = {
            (n, d): cp_solver.Value(consec_days[n, d])
            for n in range(num_staff)
            for d in range(num_days)
        }
        
        return {
            "assignments":     assignments,
            "consec_days":     consec_days_values,
            "max_consecutive": cp_solver.Value(max_consec),
            "status":          cp_solver.StatusName(status),
            "roster_start":    roster_start,
            "num_days":        num_days,
            "staff":           staff_list,
            "shifts":          shifts,
            "demands":         demands,
        }
