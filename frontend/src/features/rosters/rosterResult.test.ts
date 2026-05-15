import { describe, expect, it } from "vitest";
import { parseRosterResult } from "./rosterResult";

const BASE_OK = {
  roster_start: "2026-05-04",
  num_days: 1,
  staff: [{ employee_id: "E1", fullname: "Alice" }],
  shifts: {
    D: {
      name: "Day",
      group: "DAY",
      is_work_shift: true,
      is_night_shift: false,
      start_time: 420,
      end_time: 900,
      work_time: 480,
    },
  },
  assignments: { E1: { "0": "D" } },
  staff_max_consec: { E1: 1 },
  consec_days: {},
};

describe("parseRosterResult", () => {
  it("returns null for null input", () => {
    expect(parseRosterResult(null)).toBeNull();
  });

  it("returns kind=error for the failed-roster shape", () => {
    const r = parseRosterResult({ error: "No feasible solution" });
    expect(r).toEqual({ kind: "error", message: "No feasible solution" });
  });

  it("parses a complete result", () => {
    const r = parseRosterResult(BASE_OK);
    expect(r?.kind).toBe("ok");
  });

  it("tolerates legacy results missing is_work_shift / is_night_shift on shifts", () => {
    // Real-world payload from an older roster that was solved before the
    // backend persisted these flags on the result. The schema must accept
    // it but leave the missing fields as undefined so the renderer can
    // fall back to the live shift-group data instead of guessing.
    const legacy = {
      ...BASE_OK,
      shifts: {
        AL: {
          name: "Annual leave",
          group: "AL",
          start_time: 0,
          end_time: 0,
          work_time: 0,
        },
        D: {
          name: "Day",
          group: "DAY",
          start_time: 420,
          end_time: 900,
          work_time: 480,
        },
      },
    };
    const r = parseRosterResult(legacy);
    expect(r?.kind).toBe("ok");
    if (r?.kind === "ok") {
      expect(r.data.shifts.AL.is_work_shift).toBeUndefined();
      expect(r.data.shifts.AL.is_night_shift).toBeUndefined();
      expect(r.data.shifts.D.is_work_shift).toBeUndefined();
    }
  });

  it("returns kind=invalid when a required field really is missing", () => {
    const broken = { ...BASE_OK, num_days: undefined };
    const r = parseRosterResult(broken);
    expect(r?.kind).toBe("invalid");
  });
});
