/**
 * Pre-solve feasibility hints for the Generate wizard.
 *
 * Mirrors the solver's hard rules that most often surprise operators:
 *  - C4: every staff member must hit target_work_min EXACTLY, so the target
 *    must be a sum of shift credits (work_min) achievable within the days
 *    that actually have demands (C8 blocks work on undemanded days).
 *  - C5: coverage checkpoints no shift covers are silently skipped.
 *  - Leaves reference a shift code that must exist in the profile.
 *
 * Pure functions only — no API calls, so it stays unit-testable.
 */
import { Shift } from "../api/shifts";
import { minToHHMM } from "./time";

export interface DemandRow {
  date: string;
  start_min: number;
  end_min: number; // end <= start means the window crosses midnight
  headcount: number;
  skill_value_id: number | null;
}

export interface LeaveRow {
  date: string;
  shift_code: string;
}

export interface FeasibilityInput {
  dates: string[]; // every date in the roster window, in order
  targetWorkMin: number;
  profileShifts: Shift[]; // shifts participating in the profile
  staffCount: number; // active (non-excluded) staff in the profile
  demands: DemandRow[];
  leaves: LeaveRow[]; // leaves that fall inside the window
}

// Two decimals so a suggested target typed into the hours field rounds back
// to the exact minute value (e.g. 440 min → "7.33h" → round(7.33 × 60) = 440).
const hours = (min: number) => {
  const h = min / 60;
  return Number.isInteger(h) ? `${h}h` : `${parseFloat(h.toFixed(2))}h`;
};

/** dp[s] = minimum number of shifts whose credits sum to exactly s. */
function minShiftsPerSum(credits: number[], maxSum: number): number[] {
  const dp = new Array<number>(maxSum + 1).fill(Infinity);
  dp[0] = 0;
  for (let s = 1; s <= maxSum; s++) {
    for (const c of credits) {
      if (c > 0 && c <= s && dp[s - c] + 1 < dp[s]) dp[s] = dp[s - c] + 1;
    }
  }
  return dp;
}

/** Does this shift cover minute-of-day `cp`, including overnight tails? */
function shiftCovers(shift: Shift, cp: number): boolean {
  const s = shift.start_min;
  const e = shift.end_min;
  const overnight = e <= s;
  if (overnight && cp < e) return true; // tail of yesterday's shift
  return s <= cp && cp < (overnight ? e + 1440 : e);
}

/** Same checkpoint set the solver enforces C5 at (demand start + interior shift edges). */
function checkpoints(demand: DemandRow, workShifts: Shift[]): number[] {
  const dStart = demand.start_min;
  const dEnd = demand.end_min <= demand.start_min ? demand.end_min + 1440 : demand.end_min;
  const points = new Set([dStart]);
  for (const s of workShifts) {
    if (dStart < s.start_min && s.start_min < dEnd) points.add(s.start_min);
    if (dStart < s.end_min && s.end_min < dEnd) points.add(s.end_min);
  }
  return [...points];
}

export function feasibilityHints(input: FeasibilityInput): string[] {
  const { dates, targetWorkMin, profileShifts, staffCount, demands, leaves } = input;
  const hints: string[] = [];
  if (dates.length === 0 || targetWorkMin <= 0) return hints;

  const workShifts = profileShifts.filter((s) => s.group.is_work_shift);
  const profileCodes = new Set(profileShifts.map((s) => s.code));
  const windowDates = new Set(dates);

  // ── Leaves referencing shift codes missing from the profile (solve errors out) ──
  const badLeaveCodes = new Set(
    leaves
      .filter((l) => windowDates.has(l.date) && !profileCodes.has(l.shift_code))
      .map((l) => l.shift_code),
  );
  for (const code of badLeaveCodes) {
    hints.push(
      `A leave in this window uses shift code “${code}”, which is not in this profile — the solve will fail. Add the shift to the profile or fix the leave.`,
    );
  }

  if (workShifts.length === 0) {
    hints.push("This profile has no work shifts — nothing can be scheduled.");
    return hints;
  }

  // ── Target reachability from shift credits within demanded days (C4 + C8) ──
  const credits = [...new Set(workShifts.map((s) => s.work_min))].filter((c) => c > 0);
  const demandDays = dates.filter((d) => demands.some((row) => row.date === d)).length;
  const emptyDays = dates.length - demandDays;
  const maxCredit = Math.max(...credits);
  const dp = minShiftsPerSum(credits, targetWorkMin + maxCredit);
  const shiftsNeeded = dp[targetWorkMin];

  if (shiftsNeeded === Infinity || shiftsNeeded > demandDays) {
    let nearBelow: number | null = null;
    let nearAbove: number | null = null;
    for (let s = targetWorkMin - 1; s >= 0; s--)
      if (dp[s] <= demandDays) { nearBelow = s; break; }
    for (let s = targetWorkMin + 1; s < dp.length; s++)
      if (dp[s] <= demandDays) { nearAbove = s; break; }
    const nearest = [nearBelow, nearAbove]
      .filter((s): s is number => s !== null && s > 0)
      .map((s) => `${hours(s)} (${dp[s]} shift${dp[s] === 1 ? "" : "s"})`)
      .join(" or ");
    const creditsLabel = credits.map(hours).join(", ");
    const daysLabel =
      emptyDays > 0
        ? `${demandDays} of ${dates.length} days have demands (staff cannot work undemanded days)`
        : `the window has only ${demandDays} workable day${demandDays === 1 ? "" : "s"}`;
    hints.push(
      `Target ${hours(targetWorkMin)} per staff is not reachable: shifts credit ${creditsLabel} each, ` +
        `the target must be an exact sum of those, and ${daysLabel}.` +
        (nearest ? ` Nearest reachable target: ${nearest}.` : ""),
    );
  } else if (emptyDays > 0) {
    hints.push(
      `${emptyDays} day${emptyDays === 1 ? " has" : "s have"} no demands — the solver blocks all work on those days, leaving ${demandDays} workable days against a target needing ${shiftsNeeded}.`,
    );
  }

  // ── Peak concurrent headcount vs. staff pool, per day (skill-agnostic rows only,
  //    since a skilled nurse also satisfies overlapping “any” rows) ──
  const peakByDate = new Map<string, { peak: number; at: number }>();
  for (const d of dates) {
    const rows = demands.filter((r) => r.date === d && r.skill_value_id === null);
    if (rows.length === 0) continue;
    const events: { t: number; delta: number }[] = [];
    for (const r of rows) {
      const end = r.end_min <= r.start_min ? r.end_min + 1440 : r.end_min;
      events.push({ t: r.start_min, delta: r.headcount }, { t: end, delta: -r.headcount });
    }
    events.sort((a, b) => a.t - b.t || a.delta - b.delta);
    let cur = 0;
    let peak = 0;
    let at = rows[0].start_min;
    for (const e of events) {
      cur += e.delta;
      if (cur > peak) { peak = cur; at = e.t; }
    }
    peakByDate.set(d, { peak, at });
  }

  const overloaded = [...peakByDate.entries()].filter(([, v]) => v.peak > staffCount);
  if (overloaded.length > 0) {
    const [d, v] = overloaded[0];
    const more = overloaded.length - 1;
    hints.push(
      `Demands need ${v.peak} staff at once (${d} ${minToHHMM(v.at % 1440)}) but the profile has only ${staffCount}` +
        (more > 0 ? ` — same problem on ${more} more day${more === 1 ? "" : "s"}.` : "."),
    );
  }

  // ── Total demand vs. what the pool can supply at this target ──
  if (shiftsNeeded !== Infinity) {
    const minCredit = Math.min(...credits);
    const maxShiftsPerStaff = Math.floor(targetWorkMin / minCredit);
    const staffDaysNeeded = [...peakByDate.values()].reduce((a, v) => a + v.peak, 0);
    const staffDaysAvailable = staffCount * maxShiftsPerStaff;
    if (staffDaysNeeded > staffDaysAvailable) {
      hints.push(
        `Demands total at least ${staffDaysNeeded} staff-shifts, but ${staffCount} staff hitting ${hours(targetWorkMin)} can work at most ${staffDaysAvailable}. Lower headcounts, raise the target, or add staff.`,
      );
    }
  }

  // ── Demand stretches no shift covers (the solver silently skips these) ──
  const uncovered = new Map<string, { dates: Set<string>; at: number }>();
  for (const row of demands) {
    for (const cp of checkpoints(row, workShifts)) {
      if (!workShifts.some((s) => shiftCovers(s, cp % 1440))) {
        const key = `${row.start_min}-${row.end_min}`;
        const entry = uncovered.get(key) ?? { dates: new Set<string>(), at: cp % 1440 };
        entry.dates.add(row.date);
        uncovered.set(key, entry);
        break; // one report per demand row is enough
      }
    }
  }
  for (const [key, entry] of uncovered) {
    const [s, e] = key.split("-").map(Number);
    hints.push(
      `No shift in this profile is on duty at ${minToHHMM(entry.at)} within the ${minToHHMM(s)}–${minToHHMM(e)} demand (${entry.dates.size} day${entry.dates.size === 1 ? "" : "s"}) — the solver skips coverage there, so that stretch may go unstaffed.`,
    );
  }

  return hints;
}
