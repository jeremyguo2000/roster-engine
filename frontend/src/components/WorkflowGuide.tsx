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

// Concrete numbered instructions per step, shown in the expanded panel.
const DETAILS: Record<StepKey, string[]> = {
  shifts: [
    "Press “+ Group” for each kind of shift: e.g. DSG (day), ESG (evening), NSG (night — tick “night shift”), and a Leaves group with “counts as work” off.",
    "Press “+ Shift” inside each group: short code, start/end time, and paid work minutes.",
    "Keep paid minutes the same across shifts (e.g. 440) — staff must hit their hours target exactly, so mixed credits make targets hard to reach.",
    "Add one leave shift (code “AL”) with the same paid minutes, so leave days still count toward hours.",
  ],
  staff: [
    "Press “+ Group” to create the team (e.g. a ward).",
    "Press “+ Staff” for each person — employee ID must be unique.",
    "Optional: add skills (e.g. seniority) so demands can require them, and permitted shifts to restrict who works what (none listed = all allowed).",
  ],
  profiles: [
    "Press “+ Profile” and name it after the team/ward.",
    "Under Staff, press “Add group” to pull in the whole team at once.",
    "Under Shifts, press “Add group” for each shift group — include the Leaves group.",
    "Optional: tune solver weights, time limit, and rules like “no work the day after a night shift” in the config.",
  ],
  generate: [
    "Click a start and end date on the calendar, then press “Use this range”.",
    "Press “Suggest demands & target” for a feasible starting point, or “Apply template” if you saved one.",
    "Adjust headcounts to your real needs — the feasibility check below warns before you waste a solve.",
    "Name the roster and press Generate.",
  ],
  approve: [
    "Wait for the solver — a “Solving…” pill shows in the nav (seconds to minutes).",
    "Open the draft to review the grid, timetables, and per-staff summary.",
    "Press “Approve” to lock it in, or “Discard” and regenerate with tweaks.",
    "Happy with the setup? On Generate, press “Save as template” to reuse it next time.",
  ],
};

const OPEN_KEY = "workflow-guide-open"; // "1" open, "0" hidden, unset = auto

export default function WorkflowGuide() {
  const { user } = useAuth();
  const location = useLocation();
  const [openPref, setOpenPref] = useState<string | null>(() => localStorage.getItem(OPEN_KEY));
  const [expandedPref, setExpandedPref] = useState<StepKey | null>(null);

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
  // The current step starts expanded; clicking another step peeks at it.
  const expanded = expandedPref ?? current?.key ?? null;

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
          const isExpanded = expanded === step.key;
          const onPage = location.pathname === step.to;
          return (
            <div key={step.key}>
              <button
                className={`workflow-step workflow-step-toggle${isCurrent ? " current" : ""}`}
                onClick={() => setExpandedPref(isExpanded ? null : step.key)}
                aria-expanded={isExpanded}
              >
                <span className={`workflow-step-dot${isDone ? " done" : ""}${isCurrent ? " current" : ""}`}>
                  {isDone ? "✓" : i + 1}
                </span>
                <span className="workflow-step-label">{step.label}</span>
                <span className="workflow-step-chevron">{isExpanded ? "▾" : "▸"}</span>
              </button>
              {isExpanded && (
                <div className="workflow-step-details">
                  <ol>
                    {DETAILS[step.key].map((line, j) => (
                      <li key={j}>{line}</li>
                    ))}
                  </ol>
                  {!onPage && (
                    <Link to={step.to} className="btn btn-sm btn-primary">
                      Open {step.label} →
                    </Link>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="row" style={{ justifyContent: "space-between", marginTop: "var(--s-3)" }}>
        <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
          {current === null ? "All steps done ✓" : `Next: ${current.label}`}
        </span>
        <a
          className="workflow-guide-link"
          href="/documentation/operators-manual.html"
          target="_blank"
          rel="noreferrer"
        >
          Full guide ↗
        </a>
      </div>
    </div>
  );
}
