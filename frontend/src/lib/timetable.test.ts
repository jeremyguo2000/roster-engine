import { describe, it, expect } from "vitest";

import { RosterDetail, RosterResult } from "../api/rosters";
import {
  DAY_WIN_DUR,
  DAY_WIN_END,
  DAY_WIN_START,
  dayTimetableBars,
  fmtMin,
  rangeTimetableBars,
  rangeWindowDuration,
  rosterDayIndex,
} from "./timetable";

function makeResult(over: Partial<RosterResult>): RosterResult {
  return {
    roster_start: "2026-05-04",
    num_days: 7,
    staff: [
      { fullname: "Alice", employee_id: "EMP001" },
      { fullname: "Bob", employee_id: "EMP002" },
    ],
    shifts: {
      D088: { name: "0800-1600", group: "DSG", start_time: 480, end_time: 960, work_time: 480 },
      N2010: { name: "2000-0900", group: "NSG", start_time: 1200, end_time: 540, work_time: 480 },
      E135: { name: "1400-2200", group: "ESG", start_time: 840, end_time: 1320, work_time: 480 },
    },
    assignments: {
      EMP001: { "0": "D088", "1": "N2010" },
      EMP002: { "0": "E135" },
    },
    ...over,
  };
}

function makeApproved(result: RosterResult, id = 1): RosterDetail {
  return {
    id,
    profile_id: 1,
    profile_name: "Test Profile",
    name: `R${id}`,
    status: "approved",
    roster_start: result.roster_start,
    num_days: result.num_days,
    target_work_min: 2400,
    celery_task_id: null,
    result,
  };
}

describe("rangeWindowDuration", () => {
  it("matches the 39h day window for n=1", () => {
    expect(rangeWindowDuration(1)).toBe(DAY_WIN_DUR);
  });
  it("grows by 1440 per extra day", () => {
    expect(rangeWindowDuration(2) - rangeWindowDuration(1)).toBe(1440);
  });
});

describe("rosterDayIndex", () => {
  const r = makeApproved(makeResult({}));
  it("0 for the first day", () => {
    expect(rosterDayIndex(r, "2026-05-04")).toBe(0);
  });
  it("6 for the last day of a 7-day roster", () => {
    expect(rosterDayIndex(r, "2026-05-10")).toBe(6);
  });
  it("negative before the start", () => {
    expect(rosterDayIndex(r, "2026-05-03")).toBe(-1);
  });
});

describe("dayTimetableBars", () => {
  const r = makeApproved(makeResult({}));

  it("emits bars for the centre day", () => {
    const bars = dayTimetableBars([r], "2026-05-04");
    // EMP001 has D088 (DSG) and EMP002 has E135 (ESG) on day 0 — both should
    // appear in the centre slot.
    expect(bars.some((b) => b.shift_code === "D088")).toBe(true);
    expect(bars.some((b) => b.shift_code === "E135")).toBe(true);
  });

  it("filters NSG-only on prev/next neighbours", () => {
    // Day 1 has EMP001=N2010 (NSG) so when viewing day 2 (May 06), prev day
    // (May 05) should contribute that N2010 as spillover.
    const bars = dayTimetableBars([r], "2026-05-06");
    const prevDayBars = bars.filter((b) => b.start < DAY_WIN_START + 1440); // before midnight of day 0
    // The N2010 on May 05 starts at 20:00 = 1200 min of prev day, in window 1080..
    expect(prevDayBars.some((b) => b.shift_info.group === "NSG")).toBe(true);
  });

  it("ignores draft rosters", () => {
    const draft: RosterDetail = { ...r, status: "draft" };
    const bars = dayTimetableBars([draft], "2026-05-04");
    expect(bars).toEqual([]);
  });

  it("clips bars to the day window", () => {
    const bars = dayTimetableBars([r], "2026-05-04");
    for (const b of bars) {
      expect(b.start).toBeGreaterThanOrEqual(DAY_WIN_START);
      expect(b.end).toBeLessThanOrEqual(DAY_WIN_END);
    }
  });
});

describe("rangeTimetableBars", () => {
  const r = makeApproved(makeResult({}));

  it("returns empty for an empty date list", () => {
    expect(rangeTimetableBars([r], [])).toEqual([]);
  });

  it("covers each day in the range", () => {
    const bars = rangeTimetableBars([r], ["2026-05-04", "2026-05-05"]);
    expect(bars.length).toBeGreaterThan(0);
    // Bars from day 0 (D088, E135) and day 1 (N2010) should appear.
    expect(bars.some((b) => b.shift_code === "D088")).toBe(true);
    expect(bars.some((b) => b.shift_code === "N2010")).toBe(true);
  });

  it("clips bars to the range window", () => {
    const dates = ["2026-05-04", "2026-05-05"];
    const winEnd = DAY_WIN_START + rangeWindowDuration(dates.length);
    const bars = rangeTimetableBars([r], dates);
    for (const b of bars) {
      expect(b.start).toBeGreaterThanOrEqual(DAY_WIN_START);
      expect(b.end).toBeLessThanOrEqual(winEnd);
    }
  });
});

describe("fmtMin", () => {
  it("rounds modulo 1440", () => {
    expect(fmtMin(540)).toBe("09:00");
    expect(fmtMin(540 + 1440)).toBe("09:00");
  });
});
