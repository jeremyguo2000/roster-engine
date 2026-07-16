import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { listShifts } from "../api/shifts";
import { listStaff } from "../api/staff";
import { listProfiles } from "../api/profiles";
import { listRosters } from "../api/rosters";
import { useAuth } from "../auth/AuthContext";

// Floating setup guide that follows the user across pages. The nav order
// (Shifts → Staff → Skills → Leaves → Profiles → Generate → Rosters) is the
// full checklist, but Skills/Leaves are optional — this shows only the
// required path so a new user always has a "click here next".
const STEPS = [
  { key: "shifts", label: "Shifts", to: "/shifts" },
  { key: "staff", label: "Staff", to: "/staff" },
  { key: "profiles", label: "Profile", to: "/profiles" },
  { key: "generate", label: "Generate", to: "/generate" },
  { key: "approve", label: "Review & approve", to: "/rosters" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

// Concrete "what to press" per step, shown for the current step.
const HINTS: Record<StepKey, string> = {
  shifts: "Press “+ Group” for a shift group (e.g. Day / Night), then “+ Shift” for each start–end time with its paid minutes.",
  staff: "Press “+ Group” for a team, then “+ Staff” for each person. Skills and permitted shifts are optional.",
  profiles: "Press “+ Profile”, then use “Add group” under Staff and Shifts to pull in a whole team and shift catalogue at once.",
  generate: "Click two dates to pick a window, press “Suggest demands & target” (or “Apply template”), name the roster, then Generate.",
  approve: "Open the draft once the solver finishes and press “Approve”.",
};

const OPEN_KEY = "workflow-guide-open"; // "1" open, "0" hidden, unset = auto

export default function WorkflowGuide() {
  const { user } = useAuth();
  const location = useLocation();
  const [openPref, setOpenPref] = useState<string | null>(() => localStorage.getItem(OPEN_KEY));

  const enabled = !!user;
  const shiftsQ = useQuery({ queryKey: ["shifts", "all"], queryFn: () => listShifts(), enabled });
  const staffQ = useQuery({ queryKey: ["staff", "all"], queryFn: () => listStaff(), enabled });
  const profilesQ = useQuery({ queryKey: ["profiles"], queryFn: listProfiles, enabled });
  const rostersQ = useQuery({ queryKey: ["rosters"], queryFn: () => listRosters(), enabled });

  if (!user) return null;
  const loading = shiftsQ.isLoading || staffQ.isLoading || profilesQ.isLoading || rostersQ.isLoading;
  if (loading) return null;

  const done: Record<StepKey, boolean> = {
    shifts: (shiftsQ.data?.length ?? 0) > 0,
    staff: (staffQ.data?.length ?? 0) > 0,
    profiles: (profilesQ.data?.length ?? 0) > 0,
    generate: (rostersQ.data?.length ?? 0) > 0,
    approve: (rostersQ.data ?? []).some((r) => r.status === "approved"),
  };
  const completed = done.approve;

  // Auto-open for new setups; once the flow has been completed end to end,
  // stay collapsed unless explicitly reopened.
  const open = openPref !== null ? openPref === "1" : !completed;

  function setOpen(next: boolean) {
    localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    setOpenPref(next ? "1" : "0");
  }

  if (!open) {
    return (
      <button className="workflow-overlay-pill" onClick={() => setOpen(true)}>
        Setup guide
      </button>
    );
  }

  const currentIndex = STEPS.findIndex((s) => !done[s.key]);
  const current = currentIndex === -1 ? null : STEPS[currentIndex];
  const onCurrentPage = current !== null && location.pathname === current.to;

  return (
    <div className="workflow-overlay">
      <div className="workflow-overlay-head">
        <span style={{ fontWeight: 600 }}>Setup guide</span>
        <button className="workflow-overlay-close" onClick={() => setOpen(false)} aria-label="Hide setup guide">
          ✕
        </button>
      </div>

      <div className="workflow-overlay-steps">
        {STEPS.map((step, i) => {
          const isDone = done[step.key];
          const isCurrent = i === currentIndex;
          return (
            <Link key={step.key} to={step.to} className={`workflow-step${isCurrent ? " current" : ""}`}>
              <span className={`workflow-step-dot${isDone ? " done" : ""}${isCurrent ? " current" : ""}`}>
                {isDone ? "✓" : i + 1}
              </span>
              <span className="workflow-step-label">{step.label}</span>
            </Link>
          );
        })}
      </div>

      <p className="muted" style={{ fontSize: "var(--fs-sm)", margin: "var(--s-2) 0 0" }}>
        {current === null
          ? "All steps done — generate a new roster from any profile whenever you like."
          : onCurrentPage
            ? HINTS[current.key]
            : `Next: ${current.label}.`}
      </p>

      <div className="row" style={{ justifyContent: "space-between", marginTop: "var(--s-3)" }}>
        <a
          className="workflow-guide-link"
          href="/documentation/operators-manual.html"
          target="_blank"
          rel="noreferrer"
        >
          Full guide ↗
        </a>
        {current !== null && !onCurrentPage && (
          <Link to={current.to} className="btn btn-sm btn-primary">
            Take me there →
          </Link>
        )}
      </div>
    </div>
  );
}
