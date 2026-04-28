from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date
from typing import Union


# ---------------------------------------------------------------------------
# ShiftGroup
# ---------------------------------------------------------------------------

@dataclass
class ShiftGroup:
    """
    Represents a named group of shifts.
 
    Attributes
    ----------
    code             : Short identifier used as the shift group label (e.g. "DSG", "ESG", "NSG").
    is_night_shift   : True if this group covers overnight/night hours. Default False.
    is_work_shift    : True if shifts in this group count as working time. Default True.
 
    Examples
    --------
    ShiftGroup("DSG")
    ShiftGroup("ESG")
    ShiftGroup("NSG",    is_night_shift = True)
    ShiftGroup("Off",    is_work_shift = False)
    ShiftGroup("Leaves", is_work_shift = False)
    """
    code:             str
    is_night_shift:   bool = False
    is_work_shift:    bool = True


# ---------------------------------------------------------------------------
# Shift
# ---------------------------------------------------------------------------

@dataclass
class Shift:
    """
    A shift template that can be assigned to staff on any given day.
 
    Attributes
    ----------
    code        : Short roster code used as the backend identifier (e.g. "D078", "N2012").
    name        : Human-readable description of the shift purpose (e.g. "0700-1500 Day Shift").
    shift_group : The code of the ShiftGroup this shift belongs to (e.g. "DSG").
    start_time  : Shift start in minutes from midnight (0–1439). e.g. 420 = 07:00.
    end_time    : Shift end in minutes from midnight (0–1439). e.g. 900 = 15:00.
                  If end_time <= start_time the shift crosses midnight.
    work_time   : Net working time in minutes (gross duration minus break_time).
    break_time  : Break duration in minutes (unpaid).
 
    Examples
    --------
    Shift("D088",  "0700 - 1500",    dsg,    start_time=420,  end_time=900,  work_time=480, break_time=60),
    Shift("D096",  "0900 - 1700",    dsg,    start_time=540,  end_time=1020, work_time=480, break_time=60),
    Shift("E128",  "1200 - 2000",    esg,    start_time=720,  end_time=1200, work_time=480, break_time=60),
    Shift("E135",  "1400 - 2200",    esg,    start_time=840,  end_time=1320, work_time=480, break_time=60),
    Shift("N2210", "2200 - 0600",    nsg,    start_time=1320, end_time=360,  work_time=480, break_time=60),
    Shift("N21M",  "2100 - 0500",    nsg,    start_time=1260, end_time=300,  work_time=480, break_time=60),
    Shift("AL",    "Applied Leave",  leaves, start_time=0,    end_time=0,    work_time=480, break_time=960),
    """
    code:        str
    name:        str
    shift_group: ShiftGroup
    start_time:  int = 0
    end_time:    int = 0
    work_time:   int = 0
    break_time:  int = 0


# ---------------------------------------------------------------------------
# Skill
# ---------------------------------------------------------------------------

@dataclass
class Skill:
    """
    A key-value pair describing a single capability or attribute of a staff member.
    The value is flexible — bool, int, or str.
 
    Attributes
    ----------
    key   : Capability category (e.g. "seniority", "icu_certified").
    value : Capability value (e.g. "senior", True, 5). Matching in the solver
            is exact — both key and value must match a required Skill.
 
    Examples
    --------
    Skill("seniority", "senior")
    Skill("seniority", "junior")
    Skill("icu_certified", True)
    Skill("years_experience", 5)
    """
    key:   str
    value: Union[bool, int, str]

    def __repr__(self):
        return f"Skill({self.key!r}: {self.value!r})"


# ---------------------------------------------------------------------------
# Staff
# ---------------------------------------------------------------------------

@dataclass
class Staff:
    """
    Represents a staff member that can be assigned to shifts.
 
    Attributes
    ----------
    fullname         : Human-readable name displayed in the roster.
    skillset         : List of Skill objects describing this staff member's capabilities.
                       Can be empty if no skill constraints are needed.
    permitted_shifts : List of Shift objects this staff member is allowed to be assigned to.
                       Defaults to an empty list, which the solver interprets as
                       no restriction (all shifts are permitted).
 
    Examples
    --------
    Staff("Alice Tan", [Skill("seniority", "senior")], permitted_shifts=[shift_d078])   # shift_d078.code = "D078"
    Staff("Bob Lim",   [Skill("seniority", "junior")])   # permitted = all shifts
    Staff("Carol Ng",  [])
    """
    fullname:         str
    skillset:         list[Skill] = field(default_factory=list)
    permitted_shifts: list[Shift] = field(default_factory=list)

    def _has_skill(self, key: str, value=None) -> bool:
        """
        Return True if the staff member has a skill with the given key.
        Optionally pass a value to match exactly.
        """
        match = next((s for s in self.skillset if s.key == key), None)
        if match is None:
            return False
        return match.value == value if value is not None else True

    def meets_requirements(self, skillset_required: list[Skill]) -> bool:
        """
        Return True if this staff member satisfies all skills in skillset_required.
        Matching is exact — both key and value must match for each required Skill.
        An empty skillset_required always returns True.
        """
        return all(self._has_skill(req.key, req.value) for req in skillset_required)


# ---------------------------------------------------------------------------
# Demand
# ---------------------------------------------------------------------------

@dataclass
class Demand:
    """
    Defines the minimum headcount required during a time window on a given day.
 
    Attributes
    ----------
    date              : Specific calendar date this demand applies to.
                        Pass None when working purely with day-of-week patterns.
    start_time        : Window start in minutes from midnight (0–1439). e.g. 600 = 10:00.
    end_time          : Window end in minutes from midnight (0–1439). e.g. 1080 = 18:00.
    headcount         : Minimum number of staff required during this window.
    skillset_required : Optional list of Skills that qualifying staff must ALL possess
                        (exact key+value match). Staff who do not meet every skill in
                        this list are ignored when counting toward this demand's headcount.
                        An empty list (default) means all staff count.
 
    Examples
    --------
    # 10 staff, 10:00 – 18:00, no skill filter
    Demand(date(2025, 1, 6), start_time=600, end_time=1080, headcount=10)
 
    # 4 senior staff, 13:00 – 18:00
    Demand(date(2025, 1, 6), start_time=780, end_time=1080, headcount=4,
           skillset_required=[Skill("seniority", "senior")])
    """
    date:              date | None
    start_time:        int
    end_time:          int
    headcount:         int = 0
    skillset_required: list[Skill] = field(default_factory=list)

