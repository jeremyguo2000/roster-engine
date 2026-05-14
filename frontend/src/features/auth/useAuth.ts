import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, clearToken, readToken, writeToken } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import type { components } from "@/api/schema.gen";

type UserOut = components["schemas"]["UserOut"];
type TokenResponse = components["schemas"]["TokenResponse"];

interface LoginInput {
  username: string;
  password: string;
  remember: boolean;
}

/** Fetch the current user; only enabled when a token is present. */
export function useCurrentUser() {
  return useQuery<UserOut>({
    queryKey: queryKeys.auth.me,
    queryFn: async () => {
      const { data } = await api.get<UserOut>("/auth/me");
      return data;
    },
    enabled: !!readToken(),
    staleTime: 5 * 60_000,
  });
}

/** Mutation for logging in; on success stores the token and navigates. */
export function useLogin() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async ({ username, password, remember }: LoginInput) => {
      const { data } = await api.post<TokenResponse>("/auth/login", { username, password });
      writeToken(data.access_token, remember);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      navigate("/dashboard", { replace: true });
    },
  });
}

/** Logout: clear token, reset query cache, navigate to login. */
export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return () => {
    clearToken();
    queryClient.clear();
    navigate("/login", { replace: true });
  };
}

/** Quick boolean: is the user authenticated? */
export function isAuthenticated(): boolean {
  return !!readToken();
}
