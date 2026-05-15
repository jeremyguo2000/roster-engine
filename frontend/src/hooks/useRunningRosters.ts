import { useQuery } from "@tanstack/react-query";

import { listRosters } from "../api/rosters";
import { useAuth } from "../auth/AuthContext";

/**
 * Polls every 3s while the user is authenticated, returning all rosters in
 * the `running` state. Used by the nav to show a "Solving…" indicator and by
 * the rosters page to invalidate caches when one transitions out of running.
 */
export function useRunningRosters() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["rosters", "running"],
    queryFn: () => listRosters({ status: "running" }),
    enabled: Boolean(user),
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
}
