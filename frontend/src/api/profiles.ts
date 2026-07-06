import { api } from "./client";

export interface ConditionalConstraint {
  trigger: string;
  trigger_val: number;
  offset: number;
  enforce: string;
  enforce_val: number;
}

export interface ProfileConfig {
  weight_overstaff?: number;
  weight_consec?: number;
  weight_burden?: number;
  weight_night?: number;
  weight_weekend?: number;
  time_limit?: number;
  conditional_constraints?: ConditionalConstraint[];
  [k: string]: unknown;
}

export interface Profile {
  id: number;
  name: string;
  config: ProfileConfig;
}

export interface ProfileInput {
  name: string;
  config?: ProfileConfig;
}

export interface ProfileStaffEntry {
  staff_id: number;
  excluded: boolean;
}

export interface ProfileShiftEntry {
  shift_id: number;
}

// Profile CRUD
export const listProfiles = () =>
  api.get<Profile[]>("/profiles").then((r) => r.data);

export const getProfile = (id: number) =>
  api.get<Profile>(`/profiles/${id}`).then((r) => r.data);

export const createProfile = (body: ProfileInput) =>
  api.post<Profile>("/profiles", body).then((r) => r.data);

export const updateProfile = (id: number, body: Partial<ProfileInput>) =>
  api.patch<Profile>(`/profiles/${id}`, body).then((r) => r.data);

export const deleteProfile = (id: number) =>
  api.delete(`/profiles/${id}`).then(() => undefined);

export const duplicateProfile = (id: number, body: { name: string }) =>
  api.post<Profile>(`/profiles/${id}/duplicate`, body).then((r) => r.data);

// Profile staff
export const listProfileStaff = (profile_id: number) =>
  api.get<ProfileStaffEntry[]>(`/profiles/${profile_id}/staff`).then((r) => r.data);

export const addProfileStaff = (profile_id: number, staff_id: number, excluded = false) =>
  api
    .post<ProfileStaffEntry>(`/profiles/${profile_id}/staff`, { staff_id, excluded })
    .then((r) => r.data);

export const addProfileStaffGroup = (profile_id: number, group_id: number) =>
  api.post(`/profiles/${profile_id}/staff/add-group/${group_id}`).then(() => undefined);

export const removeProfileStaffGroup = (profile_id: number, group_id: number) =>
  api
    .delete<{ removed: number }>(`/profiles/${profile_id}/staff/remove-group/${group_id}`)
    .then((r) => r.data);

export const updateProfileStaff = (profile_id: number, staff_id: number, excluded: boolean) =>
  api
    .patch<ProfileStaffEntry>(`/profiles/${profile_id}/staff/${staff_id}`, { excluded })
    .then((r) => r.data);

export const removeProfileStaff = (profile_id: number, staff_id: number) =>
  api.delete(`/profiles/${profile_id}/staff/${staff_id}`).then(() => undefined);

// Profile shifts
export const listProfileShifts = (profile_id: number) =>
  api.get<ProfileShiftEntry[]>(`/profiles/${profile_id}/shifts`).then((r) => r.data);

export const addProfileShift = (profile_id: number, shift_id: number) =>
  api
    .post<ProfileShiftEntry>(`/profiles/${profile_id}/shifts`, { shift_id })
    .then((r) => r.data);

export const addProfileShiftGroup = (profile_id: number, group_id: number) =>
  api.post(`/profiles/${profile_id}/shifts/add-group/${group_id}`).then(() => undefined);

export const removeProfileShiftGroup = (profile_id: number, group_id: number) =>
  api
    .delete<{ removed: number }>(`/profiles/${profile_id}/shifts/remove-group/${group_id}`)
    .then((r) => r.data);

export const removeProfileShift = (profile_id: number, shift_id: number) =>
  api.delete(`/profiles/${profile_id}/shifts/${shift_id}`).then(() => undefined);
