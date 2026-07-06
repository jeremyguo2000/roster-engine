import { describe, it, expect } from "vitest";

import {
  addDaysIso,
  buildDayStatusMap,
  dateRange,
  monthMatrix,
  pickRosterForDate,
} from "./calendar";
import { Roster } from "../api/rosters";

function roster(over: Partial<Roster> & Pick<Roster, "id" | "roster_start" | "num_days" | "status">): Roster {
  return {
    profile_id: 1,
    profile_name: "Test Profile",
    name: `Roster ${over.id}`,
    target_work_min: 2400,
    celery_task_id: null,
    ...over,
  };
}

describe("addDaysIso", () => {
  // This is the regression fix for the hang bug — verifies addDays advances
  // even in timezones east of UTC (where toISOString() shifted the date back).
  it("advances by 1 day", () => {
    expect(addDaysIso("2026-05-04", 1)).toBe("2026-05-05");
  });
  it("advances by 7 days across month boundary", () => {
    expect(addDaysIso("2026-05-28", 7)).toBe("2026-06-04");
  });
  it("goes backward", () => {
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("crosses a year", () => {
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("dateRange", () => {
  // Regression test — this was the loop that hung the browser when addDaysIso
  // didn't advance.
  it("returns 1 date when from === to", () => {
    expect(dateRange("2026-05-04", "2026-05-04")).toEqual(["2026-05-04"]);
  });
  it("returns 7 dates for a week", () => {
    const out = dateRange("2026-05-04", "2026-05-10");
    expect(out).toHaveLength(7);
    expect(out[0]).toBe("2026-05-04");
    expect(out[6]).toBe("2026-05-10");
  });
  it("swaps from/to if reversed", () => {
    expect(dateRange("2026-05-10", "2026-05-04")).toHaveLength(7);
  });
  it("terminates and never infinite-loops", () => {
    // Bounded by a manual cap as a safety net; the previous bug made this
    // never terminate at all.
    const out = dateRange("2026-05-04", "2026-05-10");
    expect(out.length).toBeLessThan(20);
  });
});

describe("monthMatrix", () => {
  it("pads the leading week for May 2026 (Fri=5)", () => {
    const cells = monthMatrix(2026, 5);
    // May 1 2026 is a Friday → 5 nulls before "2026-05-01"
    expect(cells.slice(0, 5).every((c) => c === null)).toBe(true);
    expect(cells[5]).toBe("2026-05-01");
    expect(cells[cells.length - 1]).toBe("2026-05-31");
  });
  it("contains 31 entries for May", () => {
    const cells = monthMatrix(2026, 5).filter((c) => c !== null);
    expect(cells).toHaveLength(31);
  });
});

describe("buildDayStatusMap", () => {
  it("approved beats draft on overlap", () => {
    const rs: Roster[] = [
      roster({ id: 1, roster_start: "2026-05-04", num_days: 7, status: "draft" }),
      roster({ id: 2, roster_start: "2026-05-04", num_days: 7, status: "approved" }),
    ];
    const map = buildDayStatusMap(rs);
    expect(map.get("2026-05-04")?.status).toBe("approved");
    expect(map.get("2026-05-04")?.rosters).toHaveLength(2);
  });
  it("draft alone shows draft", () => {
    const rs: Roster[] = [
      roster({ id: 1, roster_start: "2026-05-04", num_days: 3, status: "draft" }),
    ];
    const map = buildDayStatusMap(rs);
    expect(map.get("2026-05-05")?.status).toBe("draft");
  });
  it("ignores running and failed", () => {
    const rs: Roster[] = [
      roster({ id: 1, roster_start: "2026-05-04", num_days: 3, status: "running" }),
      roster({ id: 2, roster_start: "2026-05-04", num_days: 3, status: "failed" }),
    ];
    const map = buildDayStatusMap(rs);
    expect(map.has("2026-05-04")).toBe(false);
  });
  it("covers every day in [start, start+num_days)", () => {
    const rs: Roster[] = [
      roster({ id: 1, roster_start: "2026-05-04", num_days: 7, status: "approved" }),
    ];
    const map = buildDayStatusMap(rs);
    expect(map.has("2026-05-04")).toBe(true);
    expect(map.has("2026-05-10")).toBe(true);
    expect(map.has("2026-05-11")).toBe(false);
  });
});

describe("pickRosterForDate", () => {
  it("returns only approved", () => {
    const rs: Roster[] = [
      roster({ id: 1, roster_start: "2026-05-04", num_days: 7, status: "draft" }),
    ];
    expect(pickRosterForDate(rs, "2026-05-05")).toBeNull();
  });
  it("picks the approved when both exist", () => {
    const rs: Roster[] = [
      roster({ id: 1, roster_start: "2026-05-04", num_days: 7, status: "draft" }),
      roster({ id: 2, roster_start: "2026-05-04", num_days: 7, status: "approved" }),
    ];
    expect(pickRosterForDate(rs, "2026-05-05")?.id).toBe(2);
  });
  it("picks the most recent approved when two approved overlap", () => {
    const rs: Roster[] = [
      roster({ id: 1, roster_start: "2026-04-27", num_days: 14, status: "approved" }),
      roster({ id: 2, roster_start: "2026-05-04", num_days: 7, status: "approved" }),
    ];
    // Both cover May 5; the later start (id 2) wins.
    expect(pickRosterForDate(rs, "2026-05-05")?.id).toBe(2);
  });
  it("returns null for dates outside any roster", () => {
    const rs: Roster[] = [
      roster({ id: 1, roster_start: "2026-05-04", num_days: 7, status: "approved" }),
    ];
    expect(pickRosterForDate(rs, "2026-06-01")).toBeNull();
  });
});
