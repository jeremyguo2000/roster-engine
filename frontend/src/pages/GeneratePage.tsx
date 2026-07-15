import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";

import { listProfiles, listProfileShifts, listProfileStaff } from "../api/profiles";
import { listRosters, createRoster } from "../api/rosters";
import { listShifts } from "../api/shifts";
import { listLeaves } from "../api/staff";
import { listSkillTypes } from "../api/skills";
import { createDemand, DemandInput, Demand } from "../api/demands";
import { errorMessage } from "../api/client";
import { useToast } from "../components/Toast";
import Calendar from "../components/Calendar";
import { hhmmToMin, minToHHMM } from "../lib/time";
import { addDaysIso, dateRange, isoDate, pickRosterForDate } from "../lib/calendar";
import { DemandRow, feasibilityHints } from "../lib/feasibility";

interface DemandDraft {
  start: string;
  end: string;
  headcount: number;
  skill_value_id: number | null;
}

function emptyDemand(): DemandDraft {
  return { start: "00:00", end: "00:00", headcount: 1, skill_value_id: null };
}

interface RegenerateFromState {
  source_roster_id: number;
  source_roster_name: string;
  profile_id: number;
  roster_start: string;
  num_days: number;
  target_work_min: number;
  demands: Demand[];
}

export default function GeneratePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const prefill = (location.state as { regenerateFrom?: RegenerateFromState } | null)?.regenerateFrom ?? null;
  const { toast } = useToast();

  // Step 1 — profile + name
  const profilesQ = useQuery({ queryKey: ["profiles"], queryFn: listProfiles });
  const rostersQ = useQuery({ queryKey: ["rosters"], queryFn: () => listRosters() });
  const skillsQ = useQuery({ queryKey: ["skills", "types"], queryFn: listSkillTypes });

  const [profileId, setProfileId] = useState<number | null>(prefill?.profile_id ?? null);
  const [name, setName] = useState(prefill ? `${prefill.source_roster_name} (regen)` : "");

  useEffect(() => {
    if (profileId === null && profilesQ.data && profilesQ.data.length > 0) {
      setProfileId(profilesQ.data[0].id);
    }
  }, [profilesQ.data, profileId]);

  // Step 2 — range + target work
  const [rosterStart, setRosterStart] = useState<string>(prefill?.roster_start ?? isoDate(new Date()));
  const [numDays, setNumDays] = useState(prefill?.num_days ?? 1);
  const [targetWorkHours, setTargetWorkHours] = useState(prefill ? prefill.target_work_min / 60 : 40);
  const [startInitialised, setStartInitialised] = useState(prefill !== null);

  useEffect(() => {
    if (startInitialised) return;
    if (rostersQ.isError) {
      setStartInitialised(true);
      return;
    }
    if (!rostersQ.data) return;
    const today = isoDate(new Date());
    const approved = rostersQ.data.filter((r) => r.status === "approved");
    if (approved.length > 0) {
      const latestEnd = approved
        .map((r) => addDaysIso(r.roster_start, r.num_days - 1))
        .sort()
        .at(-1)!;
      const nextAvailable = addDaysIso(latestEnd, 1);
      if (nextAvailable > today) {
        setRosterStart(nextAvailable);
      }
    }
    setStartInitialised(true);
  }, [rostersQ.data, rostersQ.isError, startInitialised]);

  const dates = useMemo(
    () => Array.from({ length: Math.max(numDays, 0) }, (_, i) => addDaysIso(rosterStart, i)),
    [rosterStart, numDays],
  );

  // Step 3 — leaves preview
  const leavesQ = useQuery({
    queryKey: ["leaves", "preview", { from: rosterStart, to: dates[dates.length - 1] }],
    queryFn: () =>
      listLeaves({
        from_date: rosterStart,
        to_date: dates[dates.length - 1] ?? rosterStart,
      }),
    enabled: dates.length > 0,
  });

  // Step 4 — demands per day
  const [demands, setDemands] = useState<Record<string, DemandDraft[]>>(() => {
    if (!prefill) return {};
    const grouped: Record<string, DemandDraft[]> = {};
    for (const d of prefill.demands) {
      const draft: DemandDraft = {
        start: minToHHMM(d.start_min),
        end: minToHHMM(d.end_min),
        headcount: d.headcount,
        skill_value_id: d.skill_value_id,
      };
      (grouped[d.date] ??= []).push(draft);
    }
    return grouped;
  });

  useEffect(() => {
    // Ensure every date has an entry; preserve existing.
    setDemands((cur) => {
      const next: Record<string, DemandDraft[]> = {};
      for (const d of dates) next[d] = cur[d] ?? [];
      return next;
    });
  }, [dates.join("|")]);

  function addDemand(date: string) {
    setDemands((cur) => ({ ...cur, [date]: [...(cur[date] ?? []), emptyDemand()] }));
  }
  function updateDemand(date: string, i: number, patch: Partial<DemandDraft>) {
    setDemands((cur) => ({
      ...cur,
      [date]: (cur[date] ?? []).map((d, idx) => (idx === i ? { ...d, ...patch } : d)),
    }));
  }
  function removeDemand(date: string, i: number) {
    setDemands((cur) => ({
      ...cur,
      [date]: (cur[date] ?? []).filter((_, idx) => idx !== i),
    }));
  }
  function copyFirstToAll() {
    if (dates.length === 0) return;
    const first = demands[dates[0]] ?? [];
    setDemands((cur) => {
      const next: Record<string, DemandDraft[]> = { ...cur };
      for (const d of dates) {
        next[d] = first.map((x) => ({ ...x }));
      }
      return next;
    });
  }

  // Step 5 — generate
  const allDemandRows = useMemo(() => {
    const rows: { date: string; demand: DemandDraft }[] = [];
    for (const d of dates) for (const dem of demands[d] ?? []) rows.push({ date: d, demand: dem });
    return rows;
  }, [dates, demands]);

  // Feasibility hints — advisory cross-checks of target/credits/demands/leaves
  const shiftsQ = useQuery({ queryKey: ["shifts"], queryFn: () => listShifts() });
  const profileShiftsQ = useQuery({
    queryKey: ["profiles", profileId, "shifts"],
    queryFn: () => listProfileShifts(profileId!),
    enabled: profileId !== null,
  });
  const profileStaffQ = useQuery({
    queryKey: ["profiles", profileId, "staff"],
    queryFn: () => listProfileStaff(profileId!),
    enabled: profileId !== null,
  });

  const hints = useMemo(() => {
    if (!shiftsQ.data || !profileShiftsQ.data || !profileStaffQ.data) return [];
    const inProfile = new Set(profileShiftsQ.data.map((e) => e.shift_id));
    const activeStaff = profileStaffQ.data.filter((e) => !e.excluded);
    const activeStaffIds = new Set(activeStaff.map((e) => e.staff_id));
    const rows: DemandRow[] = [];
    for (const { date, demand } of allDemandRows) {
      try {
        rows.push({
          date,
          start_min: hhmmToMin(demand.start),
          end_min: hhmmToMin(demand.end),
          headcount: demand.headcount || 0,
          skill_value_id: demand.skill_value_id,
        });
      } catch {
        // skip rows whose time input is still being typed
      }
    }
    return feasibilityHints({
      dates,
      targetWorkMin: Math.round(targetWorkHours * 60),
      profileShifts: shiftsQ.data.filter((s) => inProfile.has(s.id)),
      staffCount: activeStaff.length,
      demands: rows,
      leaves: (leavesQ.data ?? [])
        .filter((l) => activeStaffIds.has(l.staff_id))
        .map((l) => ({ date: l.date, shift_code: l.shift_code })),
    });
  }, [shiftsQ.data, profileShiftsQ.data, profileStaffQ.data, allDemandRows, dates, targetWorkHours, leavesQ.data]);

  const missingRequirements: string[] = [];
  if (profileId === null) missingRequirements.push("pick a profile");
  if (name.trim().length === 0) missingRequirements.push("name the roster");
  if (rosterStart.length !== 10 || numDays <= 0) missingRequirements.push("choose a date range");
  if (targetWorkHours <= 0) missingRequirements.push("set target hours per staff");
  if (allDemandRows.length === 0) missingRequirements.push("add at least one demand");

  const formValid = missingRequirements.length === 0;

  const generate = useMutation({
    mutationFn: async () => {
      if (profileId === null) throw new Error("Pick a profile");
      // 1) Create all demands, collect IDs.
      const demand_ids: number[] = [];
      for (const { date, demand } of allDemandRows) {
        const payload: DemandInput = {
          date,
          start_min: hhmmToMin(demand.start),
          end_min: hhmmToMin(demand.end),
          headcount: demand.headcount,
          skill_value_id: demand.skill_value_id,
        };
        const created = await createDemand(payload);
        demand_ids.push(created.id);
      }
      // 2) Create the roster.
      const prev = pickRosterForDate(rostersQ.data ?? [], addDaysIso(rosterStart, -1));
      const roster = await createRoster({
        profile_id: profileId,
        name: name.trim(),
        roster_start: rosterStart,
        num_days: numDays,
        target_work_min: Math.round(targetWorkHours * 60),
        demand_ids,
        previous_roster_id: prev?.id ?? null,
      });
      return roster;
    },
    onSuccess: (r) => {
      toast(`${r.name} dispatched to solver`, "success");
      navigate("/rosters");
    },
    onError: (e) => toast(errorMessage(e, "Generate failed"), "error"),
  });

  const skillValues = useMemo(() => {
    const out: { id: number; label: string }[] = [];
    for (const t of skillsQ.data ?? []) {
      for (const v of t.values) out.push({ id: v.id, label: `${t.name}: ${v.value}` });
    }
    return out;
  }, [skillsQ.data]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Generate Roster</h1>
          <p className="page-sub">Configure the solver inputs, then dispatch.</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <button
            className="btn btn-primary btn-lg"
            onClick={() => generate.mutate()}
            disabled={!formValid || generate.isPending}
          >
            {generate.isPending ? "Generating…" : "Generate"}
          </button>
          {!formValid && (
            <p className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>
              Still need to {missingRequirements.join(", ")}.
            </p>
          )}
        </div>
      </div>

      <div className="stack">
        <Step n={1} title="Profile & name">
          <div className="grid-2">
            <div className="field">
              <label className="label">Profile</label>
              <select
                className="select"
                value={profileId ?? ""}
                onChange={(e) => setProfileId(Number(e.target.value))}
                required
              >
                {profilesQ.data?.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label">Roster name</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ward A — May Wk2"
                required
              />
            </div>
          </div>
        </Step>

        {startInitialised ? (
        <>
        <Step n={2} title="Date range & target hours">
          <Calendar
            rosters={rostersQ.data ?? []}
            selectableDays="all"
            dayActionLabel="Use this day"
            rangeActionLabel="Use this range"
            hint="Click a date to start, click a second to extend a range. The chosen window becomes the roster start + length. Chaining from an approved roster covering the day before is automatic."
            committedRange={
              rosterStart && numDays > 0
                ? { from: rosterStart, to: addDaysIso(rosterStart, numDays - 1) }
                : null
            }
            onSelectDay={(d) => {
              setRosterStart(d);
              setNumDays(1);
            }}
            onSelectRange={(from, to) => {
              setRosterStart(from);
              setNumDays(dateRange(from, to).length);
            }}
          />
          <div
            className="row"
            style={{ justifyContent: "space-between", marginTop: 12, alignItems: "flex-end", gap: 16 }}
          >
            <span className="muted" style={{ fontSize: "var(--fs-sm)" }}>
              Window: <span className="mono">{rosterStart}</span> →{" "}
              <span className="mono">{addDaysIso(rosterStart, numDays - 1)}</span>
              {" · "}
              {numDays} day{numDays === 1 ? "" : "s"}
            </span>
            <div className="field" style={{ width: 200 }}>
              <label className="label">Target hours per staff</label>
              <input
                type="number"
                step="0.5"
                min={0}
                className="input mono"
                value={targetWorkHours}
                onChange={(e) => setTargetWorkHours(Math.max(0, parseFloat(e.target.value || "0")))}
                required
              />
            </div>
          </div>
        </Step>

        <Step n={3} title="Leaves preview">
          {dates.length === 0 ? (
            <div className="empty-state">Pick a date range first.</div>
          ) : leavesQ.isLoading ? (
            <div className="empty-state">Loading leaves…</div>
          ) : (leavesQ.data?.length ?? 0) === 0 ? (
            <div className="empty-state">No leaves in this window.</div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr><th>Date</th><th>Staff ID</th><th>Code</th><th>Note</th></tr>
                </thead>
                <tbody>
                  {leavesQ.data!.map((l) => (
                    <tr key={l.id}>
                      <td className="mono">{l.date}</td>
                      <td className="mono">#{l.staff_id}</td>
                      <td className="mono">{l.shift_code}</td>
                      <td className="muted" style={{ fontSize: "var(--fs-sm)" }}>{l.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 8 }}>
            Read-only preview — manage leaves on the Leaves page.
          </p>
        </Step>

        <Step n={4} title="Demands">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <span className="muted" style={{ fontSize: "var(--fs-sm)" }}>
              Headcount requirements per day. Solver covers every minute of every demand window.
            </span>
            <button className="btn btn-sm" onClick={copyFirstToAll} disabled={dates.length < 2}>
              Copy day 1 to all days
            </button>
          </div>
          <div className="stack">
            {dates.map((d) => (
              <div key={d} className="card" style={{ padding: 16 }}>
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
                  <span className="mono" style={{ fontWeight: 600 }}>{d}</span>
                  <button className="btn btn-sm btn-primary" onClick={() => addDemand(d)}>+ Demand</button>
                </div>
                {(demands[d] ?? []).length === 0 ? (
                  <div className="muted" style={{ fontSize: "var(--fs-sm)" }}>No demands.</div>
                ) : (
                  <div className="stack">
                    {(demands[d] ?? []).map((dem, i) => (
                      <div key={i} className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                        <div className="field" style={{ width: 110 }}>
                          <label className="label">Start</label>
                          <input
                            type="time"
                            className="input mono"
                            value={dem.start}
                            onChange={(e) => updateDemand(d, i, { start: e.target.value })}
                          />
                        </div>
                        <div className="field" style={{ width: 110 }}>
                          <label className="label">End</label>
                          <input
                            type="time"
                            className="input mono"
                            value={dem.end}
                            onChange={(e) => updateDemand(d, i, { end: e.target.value })}
                          />
                        </div>
                        <div className="field" style={{ width: 110 }}>
                          <label className="label">Headcount</label>
                          <input
                            type="number"
                            min={1}
                            className="input mono"
                            value={dem.headcount}
                            onChange={(e) => updateDemand(d, i, { headcount: parseInt(e.target.value || "1", 10) })}
                          />
                        </div>
                        <div className="field" style={{ minWidth: 200, flex: 1 }}>
                          <label className="label">Skill (optional)</label>
                          <select
                            className="select"
                            value={dem.skill_value_id ?? "any"}
                            onChange={(e) =>
                              updateDemand(d, i, {
                                skill_value_id: e.target.value === "any" ? null : Number(e.target.value),
                              })
                            }
                          >
                            <option value="any">Any</option>
                            {skillValues.map((sv) => (
                              <option key={sv.id} value={sv.id}>{sv.label}</option>
                            ))}
                          </select>
                        </div>
                        <button className="btn btn-sm btn-danger" onClick={() => removeDemand(d, i)}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Step>

        {allDemandRows.length > 0 && hints.length > 0 && (
          <section
            className="card"
            style={{ background: "var(--status-draft-bg)", borderLeft: "4px solid var(--status-draft-ink)" }}
          >
            <h3 className="section-title" style={{ marginBottom: 8, fontSize: "var(--fs-lg)" }}>
              Feasibility check
            </h3>
            <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
              {hints.map((h, i) => (
                <li key={i} style={{ fontSize: "var(--fs-sm)" }}>{h}</li>
              ))}
            </ul>
            <p className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 8, marginBottom: 0 }}>
              Advisory only — you can still generate, but the solver is likely to come back infeasible.
            </p>
          </section>
        )}

        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <span className="muted" style={{ fontSize: "var(--fs-sm)" }}>
            {!formValid
              ? `Still need to ${missingRequirements.join(", ")}.`
              : hints.length === 0 && allDemandRows.length > 0
                ? "✓ Basic feasibility checks pass."
                : ""}
          </span>
          <button
            className="btn btn-primary btn-lg"
            onClick={() => generate.mutate()}
            disabled={!formValid || generate.isPending}
          >
            {generate.isPending ? "Generating…" : "Generate"}
          </button>
        </div>
        </>
        ) : (
          <div className="card empty-state">Loading…</div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <h3 className="section-title" style={{ marginBottom: 16, fontSize: "var(--fs-lg)" }}>
        <span className="mono" style={{ color: "var(--muted)", marginRight: 8 }}>0{n}.</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

