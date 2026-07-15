import { describe, expect, it } from "vitest";

import { Shift, ShiftGroup } from "../api/shifts";
import { DemandRow, feasibilityHints, FeasibilityInput } from "./feasibility";

const dsg: ShiftGroup = { id: 1, code: "DSG", is_work_shift: true, is_night_shift: false, color: "" };
const nsg: ShiftGroup = { id: 2, code: "NSG", is_work_shift: true, is_night_shift: true, color: "" };
const lvs: ShiftGroup = { id: 3, code: "Leaves", is_work_shift: false, is_night_shift: false, color: "" };

function shift(id: number, code: string, group: ShiftGroup, start: number, end: number, work = 440): Shift {
  return { id, group_id: group.id, code, name: code, start_min: start, end_min: end, work_min: work, break_min: 0, group };
}

const day = shift(1, "D0710", dsg, 420, 1020); // 07:00–17:00
const evening = shift(2, "E1110", dsg, 660, 1260); // 11:00–21:00
const night = shift(3, "N2012", nsg, 1200, 480); // 20:00–08:00 overnight
const al = shift(4, "AL", lvs, 0, 0);

const dates = ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"];

function demandEveryDay(start: number, end: number, headcount: number): DemandRow[] {
  return dates.map((date) => ({ date, start_min: start, end_min: end, headcount, skill_value_id: null }));
}

function base(overrides: Partial<FeasibilityInput> = {}): FeasibilityInput {
  return {
    dates,
    targetWorkMin: 4 * 440,
    profileShifts: [day, evening, night, al],
    staffCount: 10,
    demands: demandEveryDay(420, 1020, 3),
    leaves: [],
    ...overrides,
  };
}

describe("feasibilityHints", () => {
  it("is silent on a solvable setup", () => {
    expect(feasibilityHints(base())).toEqual([]);
  });

  it("flags a target that is not a sum of shift credits", () => {
    const hints = feasibilityHints(base({ targetWorkMin: 2400 })); // 40h vs 440-min credits
    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain("40h");
    expect(hints[0]).toContain("not reachable");
    // 44h (6 shifts) must NOT be suggested — six shifts don't fit in five days
    expect(hints[0]).toContain("Nearest reachable target: 36.67h (5 shifts).");
  });

  it("flags a target needing more days than have demands (C8)", () => {
    const hints = feasibilityHints(
      base({ demands: demandEveryDay(420, 1020, 3).slice(0, 2), targetWorkMin: 4 * 440 }),
    );
    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain("2 of 5 days have demands");
  });

  it("notes undemanded days even when the target is reachable", () => {
    const hints = feasibilityHints(
      base({ demands: demandEveryDay(420, 1020, 3).slice(0, 4), targetWorkMin: 4 * 440 }),
    );
    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain("1 day has no demands");
  });

  it("flags peak concurrent headcount above the staff pool", () => {
    const demands = [
      ...demandEveryDay(420, 1020, 8),
      ...demandEveryDay(660, 900, 5), // overlaps 11:00–15:00 → peak 13 > 10 staff
    ];
    const hints = feasibilityHints(base({ demands, targetWorkMin: 5 * 440 }));
    expect(hints.some((h) => h.includes("13 staff at once") && h.includes("only 10"))).toBe(true);
  });

  it("does not double-count skill-filtered rows inside a wider demand", () => {
    const demands = [
      ...demandEveryDay(420, 1020, 8),
      ...dates.map((date) => ({ date, start_min: 420, end_min: 1020, headcount: 5, skill_value_id: 1 })),
    ];
    const hints = feasibilityHints(base({ demands, targetWorkMin: 5 * 440 }));
    expect(hints).toEqual([]);
  });

  it("flags demand stretches no shift covers, aggregated across days", () => {
    // No night shift in the profile, so nothing is on duty 02:00–05:00
    const demands = demandEveryDay(120, 300, 1);
    const hints = feasibilityHints(
      base({ profileShifts: [day, evening, al], demands, targetWorkMin: 440 }),
    );
    expect(hints.some((h) => h.includes("02:00–05:00") && h.includes("5 days"))).toBe(true);
  });

  it("accepts overnight coverage for late-night demands", () => {
    const demands = [...demandEveryDay(420, 1020, 2), ...demandEveryDay(1320, 360, 1)];
    const hints = feasibilityHints(base({ demands, targetWorkMin: 4 * 440 }));
    expect(hints).toEqual([]);
  });

  it("flags leaves whose shift code is missing from the profile", () => {
    const hints = feasibilityHints(
      base({ leaves: [{ date: dates[1], shift_code: "MC" }] }),
    );
    expect(hints.some((h) => h.includes("“MC”") && h.includes("solve will fail"))).toBe(true);
  });

  it("ignores leaves outside the roster window", () => {
    const hints = feasibilityHints(
      base({ leaves: [{ date: "2026-09-01", shift_code: "MC" }] }),
    );
    expect(hints).toEqual([]);
  });
});
