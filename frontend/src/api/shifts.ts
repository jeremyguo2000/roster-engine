import { api } from "./client";

export interface ShiftGroup {
  id: number;
  code: string;
  is_work_shift: boolean;
  is_night_shift: boolean;
  color: string;
}

export interface ShiftGroupInput {
  code: string;
  is_work_shift?: boolean;
  is_night_shift?: boolean;
  color?: string;
}

export interface Shift {
  id: number;
  group_id: number;
  code: string;
  name: string;
  start_min: number;
  end_min: number;
  work_min: number;
  break_min: number;
  group: ShiftGroup;
}

export interface ShiftInput {
  group_id: number;
  code: string;
  name: string;
  start_min: number;
  end_min: number;
  work_min: number;
  break_min?: number;
}

// Shift groups
export const listShiftGroups = () =>
  api.get<ShiftGroup[]>("/shifts/groups").then((r) => r.data);

export const createShiftGroup = (body: ShiftGroupInput) =>
  api.post<ShiftGroup>("/shifts/groups", body).then((r) => r.data);

export const updateShiftGroup = (id: number, body: Partial<ShiftGroupInput>) =>
  api.patch<ShiftGroup>(`/shifts/groups/${id}`, body).then((r) => r.data);

export const deleteShiftGroup = (id: number) =>
  api.delete(`/shifts/groups/${id}`).then(() => undefined);

// Shifts
export const listShifts = (params?: { group_id?: number }) =>
  api.get<Shift[]>("/shifts", { params }).then((r) => r.data);

export const getShift = (id: number) =>
  api.get<Shift>(`/shifts/${id}`).then((r) => r.data);

export const createShift = (body: ShiftInput) =>
  api.post<Shift>("/shifts", body).then((r) => r.data);

export const updateShift = (id: number, body: Partial<ShiftInput>) =>
  api.patch<Shift>(`/shifts/${id}`, body).then((r) => r.data);

export const deleteShift = (id: number) =>
  api.delete(`/shifts/${id}`).then(() => undefined);
