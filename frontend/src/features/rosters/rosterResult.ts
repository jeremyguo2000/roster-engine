import { z } from "zod";

/**
 * Validates the JSON shape that the solver writes to `Roster.result`.
 *
 * Backend shape (from `backend/app/worker/tasks.py::_result_to_json`):
 *   - assignments:      { employee_id: { day_index: shift_code } }
 *   - staff:            [{ employee_id, fullname }]
 *   - shifts:           { code: { name, group, is_work_shift, is_night_shift, start_time, end_time, work_time } }
 *   - staff_max_consec: { employee_id: int }
 *   - consec_days:      { employee_id: { day_index: int } }
 *   - num_days:         int
 *   - roster_start:     "YYYY-MM-DD"
 *   - status / max_consecutive: optional
 *
 * On failure, the backend writes `{ "error": "..." }` instead.
 */
export const rosterShiftSchema = z.object({
  name: z.string(),
  group: z.string(),
  // Older rosters were solved before these flags were persisted on the result.
  // Leave them optional here so the renderer can fall back to the live
  // shift-group flags rather than guess a wrong default at parse time.
  is_work_shift: z.boolean().optional(),
  is_night_shift: z.boolean().optional(),
  start_time: z.number().int(),
  end_time: z.number().int(),
  work_time: z.number().int(),
});

export const rosterStaffEntrySchema = z.object({
  employee_id: z.string(),
  fullname: z.string(),
});

export const rosterResultSchema = z.object({
  assignments: z.record(z.string(), z.record(z.string(), z.string())),
  staff: z.array(rosterStaffEntrySchema),
  shifts: z.record(z.string(), rosterShiftSchema),
  staff_max_consec: z.record(z.string(), z.number()).default({}),
  consec_days: z.record(z.string(), z.record(z.string(), z.number())).default({}),
  num_days: z.number().int().positive(),
  roster_start: z.string(),
  status: z.string().nullable().optional(),
  max_consecutive: z.number().nullable().optional(),
});

export const rosterErrorResultSchema = z.object({
  error: z.string(),
});

export type RosterResult = z.infer<typeof rosterResultSchema>;
export type RosterShiftInfo = z.infer<typeof rosterShiftSchema>;
export type RosterStaffEntry = z.infer<typeof rosterStaffEntrySchema>;

export type ParsedRosterResult =
  | { kind: "ok"; data: RosterResult }
  | { kind: "error"; message: string }
  | { kind: "invalid"; issues: string };

/** Parse `Roster.result` into a discriminated union, never throwing. */
export function parseRosterResult(raw: unknown): ParsedRosterResult | null {
  if (raw == null) return null;

  const errParse = rosterErrorResultSchema.safeParse(raw);
  if (errParse.success) {
    return { kind: "error", message: errParse.data.error };
  }

  const okParse = rosterResultSchema.safeParse(raw);
  if (okParse.success) {
    return { kind: "ok", data: okParse.data };
  }

  return {
    kind: "invalid",
    issues: okParse.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; "),
  };
}
