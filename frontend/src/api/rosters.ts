import { api } from "./client";
import type { Demand } from "./demands";

export type RosterStatus = "running" | "draft" | "approved" | "failed";

/**
 * Shape of the solver output stored on `Roster.result`.
 * Mirrors `_result_to_json` in backend/app/worker/tasks.py.
 */
export interface RosterShiftInfo {
  name: string;
  group: string;
  start_time: number;
  end_time: number;
  work_time: number;
  is_work_shift?: boolean;
  is_night_shift?: boolean;
}

export interface RosterStaffRef {
  fullname: string;
  employee_id: string;
}

/**
 * One rule breach found by the post-solve audit.
 *
 * `rule` is the stable identity ("rest_rules", "shift_cover", …), `label` is
 * that rule in words for operators, and `constraint` cross-references the
 * matching block in generate_roster() ("C1".."C7"; null for rules with no
 * constraint number). `message` is already written for operators.
 *
 * Hand-written against the Violation dataclass in backend/solver/rules.py,
 * with nothing enforcing that the two agree — see DESIGN.md §5. Treat every
 * field the backend might omit as optional: `label` and `constraint` fall
 * back to `rule` in the panel.
 */
export interface RosterViolation {
  rule: string;
  message: string;
  employee_id?: string | null;
  day?: number | null;
  label?: string;
  constraint?: string | null;
}

export interface RosterResult {
  roster_start: string;
  num_days: number;
  status?: string;
  staff: RosterStaffRef[];
  shifts: Record<string, RosterShiftInfo>;
  /**
   * Post-solve audit. Absent on rosters solved before the validator existed, so
   * an empty array ("checked, all clear") and undefined ("never checked") are
   * different states and are shown differently.
   */
  violations?: RosterViolation[];
  /** Keyed by employee_id, then by day-index string ("0".."num_days-1"), value is the shift code. Sparse — unassigned days are absent. */
  assignments: Record<string, Record<string, string>>;
  staff_max_consec?: Record<string, number>;
  max_consecutive?: number;
  error?: string;
  [k: string]: unknown;
}

export interface Roster {
  id: number;
  profile_id: number;
  profile_name: string;
  name: string;
  status: RosterStatus;
  roster_start: string;
  num_days: number;
  target_work_min: number;
  celery_task_id: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface RosterDetail extends Roster {
  result: RosterResult | null;
}

export interface RosterCreateInput {
  profile_id: number;
  name: string;
  roster_start: string;
  num_days: number;
  target_work_min: number;
  demand_ids: number[];
  previous_roster_id?: number | null;
}

export const listRosters = (params?: { status?: RosterStatus; profile_id?: number }) =>
  api.get<Roster[]>("/rosters", { params }).then((r) => r.data);

export const getRoster = (id: number) =>
  api.get<RosterDetail>(`/rosters/${id}`).then((r) => r.data);

export const createRoster = (body: RosterCreateInput) =>
  api.post<RosterDetail>("/rosters", body).then((r) => r.data);

export const getRosterDemands = (id: number) =>
  api.get<Demand[]>(`/rosters/${id}/demands`).then((r) => r.data);

export interface RosterLeavePreview {
  staff_id: number;
  date: string;
  shift_code: string;
  note: string | null;
}

export const getRosterLeaves = (id: number) =>
  api.get<RosterLeavePreview[]>(`/rosters/${id}/leaves`).then((r) => r.data);

export const approveRoster = (id: number) =>
  api.post<RosterDetail>(`/rosters/${id}/approve`).then((r) => r.data);

export const discardRoster = (id: number) =>
  api.post(`/rosters/${id}/discard`).then(() => undefined);

export const deleteRoster = (id: number) =>
  api.delete(`/rosters/${id}`).then(() => undefined);

/**
 * Replacement suggestions for a single absence — the sick-call flow.
 *
 * These types match `ReplacementsOut` and friends in
 * backend/app/schemas/roster.py, which — unlike `Roster.result` — is a
 * declared Pydantic model, so the shape is in the OpenAPI schema and could be
 * generated from it (DESIGN.md §5).
 */
export interface CoverageGap {
  date: string;
  start_time: number;
  end_time: number;
  headcount: number;
  present: number;
  short_by: number;
  worst_minute: number;
  skills_required: string[];
  description: string;
}

export interface ReplacementCandidate {
  employee_id: string;
  fullname: string;
  /** Consecutive working days they'd be on, counting this shift. */
  consec_run: number;
  work_min_before: number;
  work_min_after: number;
  /** Minutes over (+) or under (−) contracted hours if they take it. */
  target_delta: number;
  nights: number;
  weekends: number;
  /** Meets the skills every open coverage gap asks for. */
  covers_gaps: boolean;
  notes: string[];
}

export interface Replacements {
  absent_employee_id: string;
  absent_fullname: string;
  day: number;
  date: string;
  shift: { code: string; name: string; start_time: number; end_time: number; work_time: number } | null;
  gaps: CoverageGap[];
  candidates: ReplacementCandidate[];
  /** Why everyone else was ruled out: reason → how many staff. */
  excluded: Record<string, number>;
  message: string | null;
}

export const getReplacements = (
  rosterId: number,
  employeeId: string,
  absenceDate: string,
  limit?: number,
) =>
  api
    .get<Replacements>(`/rosters/${rosterId}/replacements`, {
      params: { employee_id: employeeId, absence_date: absenceDate, limit },
    })
    .then((r) => r.data);
