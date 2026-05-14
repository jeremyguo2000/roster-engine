import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import type { components } from "@/api/schema.gen";

type StaffOut = components["schemas"]["StaffOut"];
type StaffCreate = components["schemas"]["StaffCreate"];
type StaffUpdate = components["schemas"]["StaffUpdate"];
type StaffGroupOut = components["schemas"]["StaffGroupOut"];
type StaffGroupCreate = components["schemas"]["StaffGroupCreate"];
type StaffGroupUpdate = components["schemas"]["StaffGroupUpdate"];
type LeaveOut = components["schemas"]["LeaveOut"];
type LeaveCreate = components["schemas"]["LeaveCreate"];
type LeaveUpdate = components["schemas"]["LeaveUpdate"];

interface StaffFilters {
  groupId?: number;
  includeDeleted?: boolean;
}

export interface StaffSkillEntry {
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

export function useStaffList(filters: StaffFilters = {}) {
  return useQuery<StaffOut[]>({
    queryKey: queryKeys.staff.list(filters),
    queryFn: async () => {
      const params: Record<string, string | number | boolean> = {};
      if (filters.groupId) params.group_id = filters.groupId;
      if (filters.includeDeleted) params.include_deleted = true;
      const { data } = await api.get<StaffOut[]>("/staff", { params });
      return data;
    },
  });
}

export function useStaff(id: number | undefined) {
  return useQuery<StaffOut>({
    queryKey: queryKeys.staff.detail(id ?? -1),
    queryFn: async () => {
      const { data } = await api.get<StaffOut>(`/staff/${id}`);
      return data;
    },
    enabled: id != null,
  });
}

export function useCreateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: StaffCreate) => {
      const { data } = await api.post<StaffOut>("/staff", body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.staff.all }),
  });
}

export function useUpdateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: number; body: StaffUpdate }) => {
      const { data } = await api.patch<StaffOut>(`/staff/${args.id}`, args.body);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.staff.all });
      qc.setQueryData(queryKeys.staff.detail(data.id), data);
    },
  });
}

export function useSoftDeleteStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post<StaffOut>(`/staff/${id}/delete`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.staff.all }),
  });
}

export function useRestoreStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post<StaffOut>(`/staff/${id}/restore`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.staff.all }),
  });
}

export function useStaffGroups() {
  return useQuery<StaffGroupOut[]>({
    queryKey: queryKeys.staff.groups(),
    queryFn: async () => {
      const { data } = await api.get<StaffGroupOut[]>("/staff/groups");
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useCreateStaffGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: StaffGroupCreate) => {
      const { data } = await api.post<StaffGroupOut>("/staff/groups", body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.staff.all }),
  });
}

export function useUpdateStaffGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: number; body: StaffGroupUpdate }) => {
      const { data } = await api.patch<StaffGroupOut>(`/staff/groups/${args.id}`, args.body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.staff.all }),
  });
}

export function useDeleteStaffGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/staff/groups/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.staff.all }),
  });
}

/* ── Skills ─────────────────────────────────────────────────────────── */

export function useStaffSkills(staffId: number | undefined) {
  return useQuery<StaffSkillEntry[]>({
    queryKey: queryKeys.staff.skills(staffId ?? -1),
    queryFn: async () => {
      const { data } = await api.get<StaffSkillEntry[]>(`/staff/${staffId}/skills`);
      return data;
    },
    enabled: staffId != null,
  });
}

export function useAddStaffSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { staffId: number; skillValueId: number }) => {
      await api.post(`/staff/${args.staffId}/skills`, { skill_value_id: args.skillValueId });
    },
    onSuccess: (_d, args) =>
      qc.invalidateQueries({ queryKey: queryKeys.staff.skills(args.staffId) }),
  });
}

export function useRemoveStaffSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { staffId: number; skillValueId: number }) => {
      await api.delete(`/staff/${args.staffId}/skills/${args.skillValueId}`);
    },
    onSuccess: (_d, args) =>
      qc.invalidateQueries({ queryKey: queryKeys.staff.skills(args.staffId) }),
  });
}

/* ── Permitted shifts ───────────────────────────────────────────────── */

export function usePermittedShifts(staffId: number | undefined) {
  return useQuery<PermittedShiftsResponse>({
    queryKey: queryKeys.staff.permittedShifts(staffId ?? -1),
    queryFn: async () => {
      const { data } = await api.get<PermittedShiftsResponse>(
        `/staff/${staffId}/permitted-shifts`,
      );
      return data;
    },
    enabled: staffId != null,
  });
}

export function useAddPermittedShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { staffId: number; shiftId: number }) => {
      await api.post(`/staff/${args.staffId}/permitted-shifts`, { shift_id: args.shiftId });
    },
    onSuccess: (_d, args) =>
      qc.invalidateQueries({ queryKey: queryKeys.staff.permittedShifts(args.staffId) }),
  });
}

export function useRemovePermittedShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { staffId: number; shiftId: number }) => {
      await api.delete(`/staff/${args.staffId}/permitted-shifts/${args.shiftId}`);
    },
    onSuccess: (_d, args) =>
      qc.invalidateQueries({ queryKey: queryKeys.staff.permittedShifts(args.staffId) }),
  });
}

/* ── Leaves ─────────────────────────────────────────────────────────── */

export function useLeaves(filters: { staffId?: number; from?: string; to?: string } = {}) {
  return useQuery<LeaveOut[]>({
    queryKey: queryKeys.staff.leaves(filters),
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (filters.staffId) params.staff_id = filters.staffId;
      if (filters.from) params.from_date = filters.from;
      if (filters.to) params.to_date = filters.to;
      const { data } = await api.get<LeaveOut[]>("/staff/leaves", { params });
      return data;
    },
  });
}

export function useCreateLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: LeaveCreate) => {
      const { data } = await api.post<LeaveOut>("/staff/leaves", body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.staff.all }),
  });
}

export function useUpdateLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: number; body: LeaveUpdate }) => {
      const { data } = await api.patch<LeaveOut>(`/staff/leaves/${args.id}`, args.body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.staff.all }),
  });
}

export function useDeleteLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/staff/leaves/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.staff.all }),
  });
}
