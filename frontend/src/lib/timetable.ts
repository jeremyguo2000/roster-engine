import { Roster, RosterDetail, RosterResult, RosterShiftInfo } from "../api/rosters";
import { addDaysIso, pickRosterForDate } from "./calendar";

export interface TimetableBar {
  staff_id: string;
  staff_name: string;
  shift_code: string;
  shift_info: RosterShiftInfo;
  /** Start (minutes from window origin). */
  start: number;
  /** End (minutes from window origin), exclusive. */
  end: number;
  /** Original shift wall-clock minutes [s, e); e > s after overnight unrolling. */
  rawStart: number;
  rawEnd: number;
}

/** Day timetable: 18:00 (prev day) to 09:00 (next day) — 39 hours. */
export const DAY_WIN_START = 18 * 60; // minutes from prev midnight
export const DAY_WIN_END = 2 * 1440 + 9 * 60; // 09:00 on next day
export const DAY_WIN_DUR = DAY_WIN_END - DAY_WIN_START;

/** Range timetable: 18:00 (prev day) to 09:00 (last day +1). */
export function rangeWindowDuration(numDays: number): number {
  return (numDays + 1) * 1440 + 9 * 60 - DAY_WIN_START;
}

/**
 * Given a covering roster (the one whose [start, start+num_days) range contains
 * `date`), find the day index inside that roster.
 */
export function rosterDayIndex(roster: Roster, date: string): number {
  const [y, m, d] = roster.roster_start.split("-").map(Number);
  const [y2, m2, d2] = date.split("-").map(Number);
  const start = new Date(y, m - 1, d).getTime();
  const target = new Date(y2, m2 - 1, d2).getTime();
  return Math.round((target - start) / 86400000);
}

/** All bars within the day timetable window centred on `date`. */
export function dayTimetableBars(rosters: RosterDetail[], date: string): TimetableBar[] {
  const prevDate = addDaysIso(date, -1);
  const nextDate = addDaysIso(date, 1);
  const bars: TimetableBar[] = [];

  collectDay(rosters, prevDate, /*dayOffset*/ 0, /*nsgOnly*/ true, bars);
  collectDay(rosters, date, /*dayOffset*/ 1, /*nsgOnly*/ false, bars);
  collectDay(rosters, nextDate, /*dayOffset*/ 2, /*nsgOnly*/ true, bars);

  // Clip to window.
  return bars
    .map((b) => {
      const s = Math.max(b.start, DAY_WIN_START);
      const e = Math.min(b.end, DAY_WIN_END);
      return e > s ? { ...b, start: s, end: e } : null;
    })
    .filter((b): b is TimetableBar => b !== null);
}

/** All bars within a range timetable spanning `dates`. */
export function rangeTimetableBars(rosters: RosterDetail[], dates: string[]): TimetableBar[] {
  if (dates.length === 0) return [];
  const prevDate = addDaysIso(dates[0], -1);
  const nextDate = addDaysIso(dates[dates.length - 1], 1);
  const numDays = dates.length;
  const winEnd = rangeWindowDuration(numDays) + DAY_WIN_START;
  const bars: TimetableBar[] = [];

  collectDay(rosters, prevDate, 0, true, bars);
  dates.forEach((d, idx) => collectDay(rosters, d, idx + 1, false, bars));
  collectDay(rosters, nextDate, numDays + 1, true, bars);

  return bars
    .map((b) => {
      const s = Math.max(b.start, DAY_WIN_START);
      const e = Math.min(b.end, winEnd);
      return e > s ? { ...b, start: s, end: e } : null;
    })
    .filter((b): b is TimetableBar => b !== null);
}

// ─────────────────────────────────────────────────────────────────────────────

function collectDay(
  rosters: RosterDetail[],
  date: string,
  dayOffset: number,
  nsgOnly: boolean,
  out: TimetableBar[],
): void {
  // Use the single canonical roster for this date — otherwise overlapping
  // drafts stack bars on top of each other and the Gantt becomes unreadable
  // (and slow to paint).
  const r = pickRosterForDate(rosters, date);
  if (!r || !r.result) return;
  const idx = rosterDayIndex(r, date);
  if (idx < 0 || idx >= r.num_days) return;
  extractAssignments(r.result, idx, dayOffset, nsgOnly, out);
}

function extractAssignments(
  result: RosterResult,
  dayIdx: number,
  dayOffset: number,
  nsgOnly: boolean,
  out: TimetableBar[],
): void {
  const dayBase = dayOffset * 1440;
  for (const staff of result.staff) {
    const code = result.assignments[staff.employee_id]?.[String(dayIdx)];
    if (!code) continue;
    const info = result.shifts[code];
    if (!info) continue;
    if (nsgOnly && info.group !== "NSG") continue;

    let s = info.start_time;
    let e = info.end_time;
    if (e <= s) e += 1440; // overnight unroll

    out.push({
      staff_id: staff.employee_id,
      staff_name: staff.fullname,
      shift_code: code,
      shift_info: info,
      start: dayBase + s,
      end: dayBase + e,
      rawStart: s,
      rawEnd: e,
    });
  }
}

/** Stable order: by staff first-seen order in the input bars. */
export function staffOrderFromBars(bars: TimetableBar[]): { id: string; name: string }[] {
  const seen = new Set<string>();
  const order: { id: string; name: string }[] = [];
  for (const b of bars) {
    if (!seen.has(b.staff_id)) {
      seen.add(b.staff_id);
      order.push({ id: b.staff_id, name: b.staff_name });
    }
  }
  return order;
}

export function fmtMin(min: number): string {
  const mm = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`;
}
