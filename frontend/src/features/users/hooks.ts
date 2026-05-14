import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import type { components } from "@/api/schema.gen";

type UserOut = components["schemas"]["UserOut"];
type UserCreate = components["schemas"]["UserCreate"];
type ChangePasswordRequest = components["schemas"]["ChangePasswordRequest"];

export function useUsers() {
  return useQuery<UserOut[]>({
    queryKey: queryKeys.auth.users,
    queryFn: async () => {
      const { data } = await api.get<UserOut[]>("/auth/users");
      return data;
    },
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UserCreate) => {
      const { data } = await api.post<UserOut>("/auth/users", body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.auth.users }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/auth/users/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.auth.users }),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (body: ChangePasswordRequest) => {
      await api.post("/auth/change-password", body);
    },
  });
}
