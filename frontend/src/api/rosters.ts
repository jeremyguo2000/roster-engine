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

export interface RosterResult {
  roster_start: string;
  num_days: number;
  status?: string;
  staff: RosterStaffRef[];
  shifts: Record<string, RosterShiftInfo>;
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
