import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import type { components } from "@/api/schema.gen";

type ProfileOut = components["schemas"]["ProfileOut"];
type ProfileCreate = components["schemas"]["ProfileCreate"];
type ProfileUpdate = components["schemas"]["ProfileUpdate"];
type ProfileStaffOut = components["schemas"]["ProfileStaffOut"];
type ProfileShiftOut = components["schemas"]["ProfileShiftOut"];

export function useProfile(id: number | undefined) {
  return useQuery<ProfileOut>({
    queryKey: queryKeys.profiles.detail(id ?? -1),
    queryFn: async () => {
      const { data } = await api.get<ProfileOut>(`/profiles/${id}`);
      return data;
    },
    enabled: id != null,
  });
}

export function useCreateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ProfileCreate) => {
      const { data } = await api.post<ProfileOut>("/profiles", body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.profiles.all }),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: number; body: ProfileUpdate }) => {
      const { data } = await api.patch<ProfileOut>(`/profiles/${args.id}`, args.body);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.profiles.all });
      qc.setQueryData(queryKeys.profiles.detail(data.id), data);
    },
  });
}

export function useDeleteProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/profiles/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.profiles.all }),
  });
}

export function useProfileStaff(id: number | undefined) {
  return useQuery<ProfileStaffOut[]>({
    queryKey: queryKeys.profiles.staff(id ?? -1),
    queryFn: async () => {
      const { data } = await api.get<ProfileStaffOut[]>(`/profiles/${id}/staff`);
      return data;
    },
    enabled: id != null,
  });
}

export function useAddProfileStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { profileId: number; staffId: number; excluded?: boolean }) => {
      await api.post(`/profiles/${args.profileId}/staff`, {
        staff_id: args.staffId,
        excluded: args.excluded ?? false,
      });
    },
    onSuccess: (_d, args) =>
      qc.invalidateQueries({ queryKey: queryKeys.profiles.staff(args.profileId) }),
  });
}

export function useUpdateProfileStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { profileId: number; staffId: number; excluded: boolean }) => {
      await api.patch(`/profiles/${args.profileId}/staff/${args.staffId}`, {
        excluded: args.excluded,
      });
    },
    onSuccess: (_d, args) =>
      qc.invalidateQueries({ queryKey: queryKeys.profiles.staff(args.profileId) }),
  });
}

export function useRemoveProfileStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { profileId: number; staffId: number }) => {
      await api.delete(`/profiles/${args.profileId}/staff/${args.staffId}`);
    },
    onSuccess: (_d, args) =>
      qc.invalidateQueries({ queryKey: queryKeys.profiles.staff(args.profileId) }),
  });
}

export function useAddStaffGroupToProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { profileId: number; groupId: number }) => {
      const { data } = await api.post<{ added: number }>(
        `/profiles/${args.profileId}/staff/add-group/${args.groupId}`,
      );
      return data;
    },
    onSuccess: (_d, args) =>
      qc.invalidateQueries({ queryKey: queryKeys.profiles.staff(args.profileId) }),
  });
}

export function useProfileShifts(id: number | undefined) {
  return useQuery<ProfileShiftOut[]>({
    queryKey: queryKeys.profiles.shifts(id ?? -1),
    queryFn: async () => {
      const { data } = await api.get<ProfileShiftOut[]>(`/profiles/${id}/shifts`);
      return data;
    },
    enabled: id != null,
  });
}

export function useAddProfileShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { profileId: number; shiftId: number }) => {
      await api.post(`/profiles/${args.profileId}/shifts`, { shift_id: args.shiftId });
    },
    onSuccess: (_d, args) =>
      qc.invalidateQueries({ queryKey: queryKeys.profiles.shifts(args.profileId) }),
  });
}

export function useRemoveProfileShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { profileId: number; shiftId: number }) => {
      await api.delete(`/profiles/${args.profileId}/shifts/${args.shiftId}`);
    },
    onSuccess: (_d, args) =>
      qc.invalidateQueries({ queryKey: queryKeys.profiles.shifts(args.profileId) }),
  });
}

export function useAddShiftGroupToProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { profileId: number; groupId: number }) => {
      const { data } = await api.post<{ added: number }>(
        `/profiles/${args.profileId}/shifts/add-group/${args.groupId}`,
      );
      return data;
    },
    onSuccess: (_d, args) =>
      qc.invalidateQueries({ queryKey: queryKeys.profiles.shifts(args.profileId) }),
  });
}
