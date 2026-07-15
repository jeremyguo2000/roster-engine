import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useRunningRosters } from "../hooks/useRunningRosters";
import { useToast } from "./Toast";
import { getRoster } from "../api/rosters";

/**
 * Watches the running-rosters poll and toasts when a roster transitions out of
 * the running state. Invalidates the rosters list cache so the UI refreshes.
 *
 * Renders nothing — mount it once at the top of the tree.
 */
export default function RosterJobWatcher() {
  const { data: running = [] } = useRunningRosters();
  const { toast } = useToast();
  const qc = useQueryClient();
  const prevIds = useRef<Set<number>>(new Set());
  const seenInitial = useRef(false);

  useEffect(() => {
    const currentIds = new Set(running.map((r) => r.id));
    if (!seenInitial.current) {
      // First poll — adopt without firing toasts (avoids announcing pre-existing running jobs).
      seenInitial.current = true;
      prevIds.current = currentIds;
      return;
    }

    const finished: number[] = [];
    for (const id of prevIds.current) {
      if (!currentIds.has(id)) finished.push(id);
    }
    const started: number[] = [];
    for (const id of currentIds) {
      if (!prevIds.current.has(id)) started.push(id);
    }
    prevIds.current = currentIds;

    if (started.length > 0) {
      // A roster started running outside this tab (e.g. via MCP) — refresh so it appears in the list.
      qc.invalidateQueries({ queryKey: ["rosters"] });
    }

    if (finished.length === 0) return;

    // Re-fetch each finished roster to learn its final status + name.
    finished.forEach(async (id) => {
      try {
        const r = await getRoster(id);
        if (r.status === "draft") toast(`${r.name} saved as draft ✓`, "success");
        else if (r.status === "failed") toast(`Solver failed for ${r.name}`, "error", 6000);
        else if (r.status === "approved") toast(`${r.name} approved ✓`, "success");
      } catch {
        // Roster may have been deleted — silent.
      }
      qc.invalidateQueries({ queryKey: ["rosters"] });
    });
  }, [running, toast, qc]);

  return null;
}
