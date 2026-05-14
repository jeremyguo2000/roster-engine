import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import type { components } from "@/api/schema.gen";

type DemandOut = components["schemas"]["DemandOut"];
type DemandCreate = components["schemas"]["DemandCreate"];

export interface DemandsFilter {
  from?: string;
  to?: string;
  skillValueId?: number;
}

export function useDemands(filters: DemandsFilter = {}) {
  return useQuery<DemandOut[]>({
    queryKey: queryKeys.demands.list({
      from: filters.from,
      to: filters.to,
      skillValueId: filters.skillValueId,
    }),
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (filters.from) params.from_date = filters.from;
      if (filters.to) params.to_date = filters.to;
      if (filters.skillValueId) params.skill_value_id = filters.skillValueId;
      const { data } = await api.get<DemandOut[]>("/demands", { params });
      return data;
    },
  });
}

export function useCreateDemand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: DemandCreate) => {
      const { data } = await api.post<DemandOut>("/demands", body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.demands.all }),
  });
}
