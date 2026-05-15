/**
 * Minutes-from-midnight ↔ "HH:MM" helpers. Times in the solver are integers in
 * [0, 1439]. Overnight shifts have end_min <= start_min.
 */

export function minToHHMM(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${String(h).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function hhmmToMin(hhmm: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) throw new Error(`Invalid time "${hhmm}", expected HH:MM`);
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) {
    throw new Error(`Invalid time "${hhmm}", out of range`);
  }
  return h * 60 + m;
}

/** Duration in minutes, treating end <= start as overnight. */
export function durationMin(start_min: number, end_min: number): number {
  return end_min > start_min ? end_min - start_min : 1440 - start_min + end_min;
}
