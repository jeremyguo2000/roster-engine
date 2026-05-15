import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { listProfiles } from "../api/profiles";
import { listRosters, createRoster } from "../api/rosters";
import { listLeaves } from "../api/staff";
import { listSkillTypes } from "../api/skills";
import { createDemand, DemandInput } from "../api/demands";
import { errorMessage } from "../api/client";
import { useToast } from "../components/Toast";
import { hhmmToMin } from "../lib/time";

interface DemandDraft {
  start: string;
  end: string;
  headcount: number;
  skill_value_id: number | null;
}

function emptyDemand(): DemandDraft {
  return { start: "08:00", end: "20:00", headcount: 1, skill_value_id: null };
}

function isoDate(d: Date): string {
  // Use local components — toISOString() converts to UTC and shifts dates
  // by 1 day in non-UTC timezones.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const out = new Date(y, m - 1, d);
  out.setDate(out.getDate() + n);
  return isoDate(out);
}

export default function GeneratePage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Step 1 — profile + name
  const profilesQ = useQuery({ queryKey: ["profiles"], queryFn: listProfiles });
  const rostersQ = useQuery({ queryKey: ["rosters"], queryFn: () => listRosters() });
  const skillsQ = useQuery({ queryKey: ["skills", "types"], queryFn: listSkillTypes });

  const [profileId, setProfileId] = useState<number | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    if (profileId === null && profilesQ.data && profilesQ.data.length > 0) {
      setProfileId(profilesQ.data[0].id);
    }
  }, [profilesQ.data, profileId]);

  // Step 2 — range + target work
  const [rosterStart, setRosterStart] = useState<string>(isoDate(new Date()));
  const [numDays, setNumDays] = useState(7);
  const [targetWorkHours, setTargetWorkHours] = useState(40);
  const [previousRosterId, setPreviousRosterId] = useState<number | "none">("none");

  const dates = useMemo(
    () => Array.from({ length: Math.max(numDays, 0) }, (_, i) => addDays(rosterStart, i)),
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
  const [demands, setDemands] = useState<Record<string, DemandDraft[]>>({});

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

  const formValid =
    profileId !== null &&
    name.trim().length > 0 &&
    rosterStart.length === 10 &&
    numDays > 0 &&
    targetWorkHours > 0 &&
    allDemandRows.length > 0;

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
      const roster = await createRoster({
        profile_id: profileId,
        name: name.trim(),
        roster_start: rosterStart,
        num_days: numDays,
        target_work_min: Math.round(targetWorkHours * 60),
        demand_ids,
        previous_roster_id: previousRosterId === "none" ? null : previousRosterId,
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

        <Step n={2} title="Date range & target hours">
          <div className="grid-3">
            <div className="field">
              <label className="label">Roster start</label>
              <input
                type="date"
                className="input"
                value={rosterStart}
                onChange={(e) => setRosterStart(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label className="label">Number of days</label>
              <input
                type="number"
                min={1}
                className="input mono"
                value={numDays}
                onChange={(e) => setNumDays(Math.max(1, parseInt(e.target.value || "1", 10)))}
                required
              />
            </div>
            <div className="field">
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
              <span className="field-hint">Sent as target_work_min = hours × 60.</span>
            </div>
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label className="label">Chain from previous roster</label>
            <select
              className="select"
              value={previousRosterId}
              onChange={(e) =>
                setPreviousRosterId(e.target.value === "none" ? "none" : Number(e.target.value))
              }
              style={{ maxWidth: 480 }}
            >
              <option value="none">No chaining — start fresh</option>
              {rostersQ.data
                ?.filter((r) => r.status === "approved" || r.status === "draft")
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    #{r.id} {r.name} ({r.roster_start})
                  </option>
                ))}
            </select>
            <span className="field-hint">
              Enables ConditionalConstraint rules to look back into the previous roster's last days.
            </span>
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
            Read-only preview — manage leaves on the Staff page.
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
                  <button className="btn btn-sm" onClick={() => addDemand(d)}>+ Demand</button>
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
                            className="input mono"
                            value={dem.start}
                            onChange={(e) => updateDemand(d, i, { start: e.target.value })}
                          />
                        </div>
                        <div className="field" style={{ width: 110 }}>
                          <label className="label">End</label>
                          <input
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

        <Step n={5} title="Generate">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="muted" style={{ fontSize: "var(--fs-sm)" }}>
              {allDemandRows.length} demand{allDemandRows.length === 1 ? "" : "s"} across {dates.length} day{dates.length === 1 ? "" : "s"}
              {!formValid && " — fill all required fields and add ≥ 1 demand."}
            </span>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => generate.mutate()}
              disabled={!formValid || generate.isPending}
            >
              {generate.isPending ? "Dispatching…" : "Run Solver"}
            </button>
          </div>
          <p className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 8 }}>
            Demands are created first, then the roster is dispatched to Celery. You can leave this page —
            the nav will show "Solving…" and a toast appears when it finishes.
          </p>
        </Step>
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

