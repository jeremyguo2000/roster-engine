import { api } from "./client";

export interface StaffGroup {
  id: number;
  name: string;
}

export interface StaffGroupInput {
  name: string;
}

export interface Staff {
  id: number;
  staff_group_id: number;
  employee_id: string;
  full_name: string;
  deleted: boolean;
  staff_group: StaffGroup;
}

export interface StaffInput {
  staff_group_id: number;
  employee_id: string;
  full_name: string;
}

export interface StaffSkill {
  skill_value_id: number;
  skill_type: string;
  value: string;
}

export interface PermittedShiftEntry {
  shift_id: number;
  shift_code: string;
  shift_name: string;
  group: string;
}

export interface PermittedShiftsResponse {
  note: string;
  permitted_shifts: PermittedShiftEntry[];
}

export interface Leave {
  id: number;
  staff_id: number;
  date: string;
  shift_code: string;
  note: string | null;
}

export interface LeaveInput {
  staff_id: number;
  date: string;
  shift_code?: string;
  note?: string | null;
}

// Staff groups
export const listStaffGroups = () =>
  api.get<StaffGroup[]>("/staff/groups").then((r) => r.data);

export const createStaffGroup = (body: StaffGroupInput) =>
  api.post<StaffGroup>("/staff/groups", body).then((r) => r.data);

export const updateStaffGroup = (id: number, body: Partial<StaffGroupInput>) =>
  api.patch<StaffGroup>(`/staff/groups/${id}`, body).then((r) => r.data);

export const deleteStaffGroup = (id: number) =>
  api.delete(`/staff/groups/${id}`).then(() => undefined);

// Staff
export const listStaff = (params?: { group_id?: number; include_deleted?: boolean }) =>
  api.get<Staff[]>("/staff", { params }).then((r) => r.data);

export const getStaff = (id: number) =>
  api.get<Staff>(`/staff/${id}`).then((r) => r.data);

export const createStaff = (body: StaffInput) =>
  api.post<Staff>("/staff", body).then((r) => r.data);

export const updateStaff = (id: number, body: Partial<StaffInput>) =>
  api.patch<Staff>(`/staff/${id}`, body).then((r) => r.data);

export const softDeleteStaff = (id: number) =>
  api.post<Staff>(`/staff/${id}/delete`).then((r) => r.data);

export const restoreStaff = (id: number) =>
  api.post<Staff>(`/staff/${id}/restore`).then((r) => r.data);

// Skills
export const getStaffSkills = (staff_id: number) =>
  api.get<StaffSkill[]>(`/staff/${staff_id}/skills`).then((r) => r.data);

export const addStaffSkill = (staff_id: number, skill_value_id: number) =>
  api.post(`/staff/${staff_id}/skills`, { skill_value_id }).then(() => undefined);

export const removeStaffSkill = (staff_id: number, skill_value_id: number) =>
  api.delete(`/staff/${staff_id}/skills/${skill_value_id}`).then(() => undefined);

// Permitted shifts
export const getPermittedShifts = (staff_id: number) =>
  api.get<PermittedShiftsResponse>(`/staff/${staff_id}/permitted-shifts`).then((r) => r.data);

export const addPermittedShift = (staff_id: number, shift_id: number) =>
  api.post(`/staff/${staff_id}/permitted-shifts`, { shift_id }).then(() => undefined);

export const removePermittedShift = (staff_id: number, shift_id: number) =>
  api.delete(`/staff/${staff_id}/permitted-shifts/${shift_id}`).then(() => undefined);

// Leaves
export const listLeaves = (params?: { staff_id?: number; from_date?: string; to_date?: string }) =>
  api.get<Leave[]>("/staff/leaves", { params }).then((r) => r.data);

export const createLeave = (body: LeaveInput) =>
  api.post<Leave>("/staff/leaves", body).then((r) => r.data);

export const updateLeave = (id: number, body: Partial<Pick<LeaveInput, "shift_code" | "note">>) =>
  api.patch<Leave>(`/staff/leaves/${id}`, body).then((r) => r.data);

export const deleteLeave = (id: number) =>
  api.delete(`/staff/leaves/${id}`).then(() => undefined);
