import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import type { components } from "@/api/schema.gen";

type SkillTypeOut = components["schemas"]["SkillTypeOut"];
type SkillTypeCreate = components["schemas"]["SkillTypeCreate"];
type SkillTypeUpdate = components["schemas"]["SkillTypeUpdate"];
type SkillValueOut = components["schemas"]["SkillValueOut"];
type SkillValueCreate = components["schemas"]["SkillValueCreate"];

export function useSkillTypes() {
  return useQuery<SkillTypeOut[]>({
    queryKey: queryKeys.skills.types(),
    queryFn: async () => {
      const { data } = await api.get<SkillTypeOut[]>("/skills/types");
      return data;
    },
  });
}

export function useCreateSkillType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: SkillTypeCreate) => {
      const { data } = await api.post<SkillTypeOut>("/skills/types", body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.skills.all }),
  });
}

export function useUpdateSkillType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: number; body: SkillTypeUpdate }) => {
      const { data } = await api.patch<SkillTypeOut>(`/skills/types/${args.id}`, args.body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.skills.all }),
  });
}

export function useDeleteSkillType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/skills/types/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.skills.all }),
  });
}

export function useAddSkillValue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { typeId: number; body: SkillValueCreate }) => {
      const { data } = await api.post<SkillValueOut>(
        `/skills/types/${args.typeId}/values`,
        args.body,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.skills.all }),
  });
}

export function useDeleteSkillValue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { typeId: number; valueId: number }) => {
      await api.delete(`/skills/types/${args.typeId}/values/${args.valueId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.skills.all }),
  });
}
