import { Roster, RosterStatus } from "../api/rosters";

export type DayStatus = "approved" | "draft" | "none";

export interface DayInfo {
  status: DayStatus;
  /** Rosters that cover this date. Ordered: approved first, then draft. */
  rosters: Roster[];
}

function isoDate(d: Date): string {
  // IMPORTANT: build the ISO string from *local* components, not toISOString().
  // toISOString() converts to UTC, which in timezones east of UTC shifts the
  // date backward by one day at midnight local. That breaks addDays() in a way
  // that makes dateRange() loop forever (cur never advances past `to`).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const out = new Date(y, m - 1, d);
  out.setDate(out.getDate() + n);
  return isoDate(out);
}

/**
 * For each calendar date, return its status (approved / draft / none) plus the
 * list of rosters that cover it. Approved rosters take priority over drafts on
 * overlap.
 */
export function buildDayStatusMap(rosters: Roster[]): Map<string, DayInfo> {
  const map = new Map<string, DayInfo>();
  const rank: Record<RosterStatus, number> = { approved: 3, draft: 2, running: 1, failed: 0 };

  // Sort so that higher-priority statuses win the "status" slot.
  const sorted = [...rosters].sort((a, b) => rank[b.status] - rank[a.status]);

  for (const r of sorted) {
    if (r.status !== "approved" && r.status !== "draft") continue;
    for (let i = 0; i < r.num_days; i++) {
      const d = addDays(r.roster_start, i);
      const existing = map.get(d);
      if (!existing) {
        map.set(d, { status: r.status, rosters: [r] });
      } else {
        existing.rosters.push(r);
      }
    }
  }
  return map;
}

/** Calendar matrix for the given year/month, weeks starting on Sunday. */
export function monthMatrix(year: number, month: number): (string | null)[] {
  const cells: (string | null)[] = [];
  const first = new Date(year, month - 1, 1);
  const leading = first.getDay(); // Sunday=0
  for (let i = 0; i < leading; i++) cells.push(null);
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let n = 1; n <= daysInMonth; n++) {
    cells.push(isoDate(new Date(year, month - 1, n)));
  }
  return cells;
}

/**
 * Pick the single approved roster covering `date`. Timetables show the
 * canonical, in-effect schedule only — drafts are hypothetical and never
 * displayed in the Gantt views. Invariant: there should be at most one
 * approved roster per date; if two overlap, the most recent `roster_start`
 * wins as defence-in-depth.
 */
export function pickRosterForDate<T extends Roster>(rosters: T[], date: string): T | null {
  let best: T | null = null;
  for (const r of rosters) {
    if (r.status !== "approved") continue;
    const last = addDays(r.roster_start, r.num_days - 1);
    if (date < r.roster_start || date > last) continue;
    if (!best || r.roster_start > best.roster_start) best = r;
  }
  return best;
}

/** Inclusive range of ISO dates between `from` and `to`. */
export function dateRange(from: string, to: string): string[] {
  const [fromIso, toIso] = from <= to ? [from, to] : [to, from];
  const out: string[] = [];
  let cur = fromIso;
  while (cur <= toIso) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export { addDays as addDaysIso, isoDate };
