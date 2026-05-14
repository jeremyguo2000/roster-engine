import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import type { components } from "@/api/schema.gen";

type ShiftOut = components["schemas"]["ShiftOut"];
type ShiftCreate = components["schemas"]["ShiftCreate"];
type ShiftUpdate = components["schemas"]["ShiftUpdate"];
type ShiftGroupOut = components["schemas"]["ShiftGroupOut"];
type ShiftGroupCreate = components["schemas"]["ShiftGroupCreate"];
type ShiftGroupUpdate = components["schemas"]["ShiftGroupUpdate"];

export function useShifts(groupId?: number) {
  return useQuery<ShiftOut[]>({
    queryKey: queryKeys.shifts.list(groupId),
    queryFn: async () => {
      const params: Record<string, number> = {};
      if (groupId) params.group_id = groupId;
      const { data } = await api.get<ShiftOut[]>("/shifts", { params });
      return data;
    },
  });
}

export function useShiftGroups() {
  return useQuery<ShiftGroupOut[]>({
    queryKey: queryKeys.shifts.groups(),
    queryFn: async () => {
      const { data } = await api.get<ShiftGroupOut[]>("/shifts/groups");
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useCreateShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ShiftCreate) => {
      const { data } = await api.post<ShiftOut>("/shifts", body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.shifts.all }),
  });
}

export function useUpdateShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: number; body: ShiftUpdate }) => {
      const { data } = await api.patch<ShiftOut>(`/shifts/${args.id}`, args.body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.shifts.all }),
  });
}

export function useDeleteShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/shifts/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.shifts.all }),
  });
}

export function useCreateShiftGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ShiftGroupCreate) => {
      const { data } = await api.post<ShiftGroupOut>("/shifts/groups", body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.shifts.all }),
  });
}

export function useUpdateShiftGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: number; body: ShiftGroupUpdate }) => {
      const { data } = await api.patch<ShiftGroupOut>(`/shifts/groups/${args.id}`, args.body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.shifts.all }),
  });
}

export function useDeleteShiftGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/shifts/groups/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.shifts.all }),
  });
}
