import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { api } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import type { components } from "@/api/schema.gen";

type RosterOut = components["schemas"]["RosterOut"];
type RosterCreate = components["schemas"]["RosterCreate"];
type RosterStatus = components["schemas"]["RosterStatus"];
type DemandOut = components["schemas"]["DemandOut"];
type ProfileOut = components["schemas"]["ProfileOut"];

export interface RosterFilters {
  status?: RosterStatus;
  profileId?: number;
}

export function useRosters(filters: RosterFilters = {}) {
  return useQuery<RosterOut[]>({
    queryKey: queryKeys.rosters.list({
      status: filters.status,
      profileId: filters.profileId,
    }),
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (filters.status) params.status = filters.status;
      if (filters.profileId) params.profile_id = filters.profileId;
      const { data } = await api.get<RosterOut[]>("/rosters", { params });
      return data;
    },
  });
}

/** Detail query; auto-polls every 2s while the solver is running. */
export function useRoster(
  id: number | undefined,
  options?: Partial<UseQueryOptions<RosterOut>>,
) {
  return useQuery<RosterOut>({
    queryKey: queryKeys.rosters.detail(id ?? -1),
    queryFn: async () => {
      const { data } = await api.get<RosterOut>(`/rosters/${id}`);
      return data;
    },
    enabled: id != null,
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? 2_000 : false,
    refetchIntervalInBackground: false,
    ...options,
  });
}

export function useRosterDemands(id: number | undefined) {
  return useQuery<DemandOut[]>({
    queryKey: queryKeys.rosters.demands(id ?? -1),
    queryFn: async () => {
      const { data } = await api.get<DemandOut[]>(`/rosters/${id}/demands`);
      return data;
    },
    enabled: id != null,
  });
}

export function useProfiles() {
  return useQuery<ProfileOut[]>({
    queryKey: queryKeys.profiles.list(),
    queryFn: async () => {
      const { data } = await api.get<ProfileOut[]>("/profiles");
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useApproveRoster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post<RosterOut>(`/rosters/${id}/approve`);
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.rosters.detail(data.id), data);
      qc.invalidateQueries({ queryKey: queryKeys.rosters.all });
    },
  });
}

export function useDiscardRoster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.post(`/rosters/${id}/discard`);
      return id;
    },
    onSuccess: (id) => {
      qc.removeQueries({ queryKey: queryKeys.rosters.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.rosters.all });
    },
  });
}

export function useDeleteRoster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/rosters/${id}`);
      return id;
    },
    onSuccess: (id) => {
      qc.removeQueries({ queryKey: queryKeys.rosters.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.rosters.all });
    },
  });
}

export function useCreateRoster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: RosterCreate) => {
      const { data } = await api.post<RosterOut>("/rosters", body);
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.rosters.detail(data.id), data);
      qc.invalidateQueries({ queryKey: queryKeys.rosters.all });
    },
  });
}
