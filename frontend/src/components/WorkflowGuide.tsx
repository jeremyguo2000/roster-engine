import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { listShifts } from "../api/shifts";
import { listStaff } from "../api/staff";
import { listProfiles } from "../api/profiles";
import { listRosters } from "../api/rosters";

// The nav bar order (Shifts → Staff → Skills → Leaves → Profiles → Generate →
// Rosters) is the full setup checklist, but Skills/Leaves are optional. This
// shows only the required path so a new user always has a "click here next".
const STEPS = [
  { key: "shifts", label: "Shifts", to: "/shifts" },
  { key: "staff", label: "Staff", to: "/staff" },
  { key: "profiles", label: "Profile", to: "/profiles" },
  { key: "generate", label: "Generate", to: "/generate" },
  { key: "approve", label: "Review & approve", to: null },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

export default function WorkflowGuide() {
  const shiftsQ = useQuery({ queryKey: ["shifts", "all"], queryFn: () => listShifts() });
  const staffQ = useQuery({ queryKey: ["staff", "all"], queryFn: () => listStaff() });
  const profilesQ = useQuery({ queryKey: ["profiles"], queryFn: listProfiles });
  const rostersQ = useQuery({ queryKey: ["rosters"], queryFn: () => listRosters() });

  const loading = shiftsQ.isLoading || staffQ.isLoading || profilesQ.isLoading || rostersQ.isLoading;
  if (loading) return null;

  const done: Record<StepKey, boolean> = {
    shifts: (shiftsQ.data?.length ?? 0) > 0,
    staff: (staffQ.data?.length ?? 0) > 0,
    profiles: (profilesQ.data?.length ?? 0) > 0,
    generate: (rostersQ.data?.length ?? 0) > 0,
    approve: (rostersQ.data ?? []).some((r) => r.status === "approved"),
  };

  // Once a roster has been approved at least once, the flow has been used
  // end to end — stop nagging a returning user with the full checklist.
  if (done.approve) return null;

  const currentIndex = STEPS.findIndex((s) => !done[s.key]);

  return (
    <div className="workflow-guide">
      <div className="workflow-guide-steps">
        {STEPS.map((step, i) => {
          const isDone = done[step.key];
          const isCurrent = i === currentIndex;
          const dot = (
            <span className={`workflow-step-dot${isDone ? " done" : ""}${isCurrent ? " current" : ""}`}>
              {isDone ? "✓" : i + 1}
            </span>
          );
          const body = (
            <>
              {dot}
              <span className="workflow-step-label">{step.label}</span>
            </>
          );
          return (
            <div className="workflow-step-wrap" key={step.key}>
              {i > 0 && <span className="workflow-step-arr">→</span>}
              {step.to ? (
                <Link to={step.to} className={`workflow-step${isCurrent ? " current" : ""}`}>
                  {body}
                </Link>
              ) : (
                <span className={`workflow-step${isCurrent ? " current" : ""}`}>{body}</span>
              )}
            </div>
          );
        })}
      </div>
      <a
        className="workflow-guide-link"
        href="/documentation/operators-manual.html"
        target="_blank"
        rel="noreferrer"
      >
        Full guide ↗
      </a>
    </div>
  );
}
