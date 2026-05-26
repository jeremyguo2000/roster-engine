import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Roster,
  approveRoster,
  deleteRoster,
  discardRoster,
  getRoster,
  getRosterDemands,
  listRosters,
} from "../api/rosters";
import { listShiftGroups } from "../api/shifts";
import { errorMessage } from "../api/client";
import { groupColour, groupColourFor } from "../lib/colours";
import { exportRosterToXlsx } from "../lib/rosterExport";
import Modal from "../components/Modal";
import { useToast } from "../components/Toast";
import RosterGrid from "../components/RosterGrid";
import RosterSummary from "../components/RosterSummary";
import Calendar from "../components/Calendar";
import DayTimetable from "../components/DayTimetable";
import RangeTimetable from "../components/RangeTimetable";

export default function RostersPage() {
  const rostersQ = useQuery({
    queryKey: ["rosters"],
    queryFn: () => listRosters(),
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return false;
      return data.some((r) => r.status === "running") ? 3000 : false;
    },
  });

  const { approved, drafts, running, failed } = useMemo(() => {
    const all = rostersQ.data ?? [];
    return {
      approved: all
        .filter((r) => r.status === "approved")
        .sort((a, b) => b.roster_start.localeCompare(a.roster_start)),
      drafts: all
        .filter((r) => r.status === "draft")
        .sort((a, b) => b.roster_start.localeCompare(a.roster_start)),
      running: all.filter((r) => r.status === "running"),
      failed: all.filter((r) => r.status === "failed"),
    };
  }, [rostersQ.data]);

  const [viewing, setViewing] = useState<Roster | null>(null);
  const [dayView, setDayView] = useState<string | null>(null);
  const [rangeView, setRangeView] = useState<{ from: string; to: string } | null>(null);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Rosters</h1>
          <p className="page-sub">Calendar, drafts and approved rosters.</p>
        </div>
        <Link to="/generate" className="btn btn-primary">+ Generate Roster</Link>
      </div>

      {rostersQ.isLoading && <div className="empty-state">Loading…</div>}

      {rostersQ.data && (
        <Calendar
          rosters={rostersQ.data}
          onSelectDay={(d) => setDayView(d)}
          onSelectRange={(from, to) => setRangeView({ from, to })}
        />
      )}

      {running.length > 0 && (
        <section className="section">
          <h2 className="section-title">Solving</h2>
          <div className="stack">
            {running.map((r) => <RunningCard key={r.id} roster={r} />)}
          </div>
        </section>
      )}

      {failed.length > 0 && (
        <section className="section">
          <h2 className="section-title">Failed</h2>
          <div className="stack">
            {failed.map((r) => <FailedCard key={r.id} roster={r} />)}
          </div>
        </section>
      )}

      <section className="section">
        <h2 className="section-title">Drafts</h2>
        {drafts.length === 0 ? (
          <div className="empty-state">
            No drafts yet. <Link to="/generate">Generate a roster</Link> to get started.
          </div>
        ) : (
          <div className="stack">
            {drafts.map((r) => (
              <DraftCard key={r.id} roster={r} onView={() => setViewing(r)} />
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <h2 className="section-title">Approved</h2>
        {approved.length === 0 ? (
          <div className="empty-state">No approved rosters yet.</div>
        ) : (
          <div className="stack">
            {approved.map((r) => (
              <ApprovedCard key={r.id} roster={r} onView={() => setViewing(r)} />
            ))}
          </div>
        )}
      </section>

      {viewing && (
        <Modal open onClose={() => setViewing(null)} title={viewing.name} size="full">
          <RosterDetailView roster={viewing} />
        </Modal>
      )}

      {dayView && rostersQ.data && (
        <Modal open onClose={() => setDayView(null)} title={`Day Timetable — ${dayView}`} size="full">
          <DayTimetable date={dayView} rosters={rostersQ.data} />
        </Modal>
      )}
      {rangeView && rostersQ.data && (
        <Modal
          open
          onClose={() => setRangeView(null)}
          title={`Timetable — ${rangeView.from} → ${rangeView.to}`}
          size="full"
        >
          <RangeTimetable from={rangeView.from} to={rangeView.to} rosters={rostersQ.data} />
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function RosterMeta({ roster }: { roster: Roster }) {
  return (
    <div className="muted" style={{ fontSize: "var(--fs-sm)", marginTop: 4 }}>
      {roster.profile_name} · <span className="mono">{roster.roster_start}</span> · {roster.num_days} day{roster.num_days === 1 ? "" : "s"}
      {" · "}target {(roster.target_work_min / 60).toFixed(1)}h / staff
    </div>
  );
}

function RunningCard({ roster }: { roster: Roster }) {
  return (
    <div className="card">
      <div className="card-header-row">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: "var(--fs-lg)", fontWeight: 500 }}>{roster.name}</span>
            <span className="badge badge-running">
              <span className="nav-spinner" style={{ width: 8, height: 8, marginRight: 6, borderWidth: 1 }} />
              Solving…
            </span>
          </div>
          <RosterMeta roster={roster} />
        </div>
      </div>
    </div>
  );
}

function FailedCard({ roster }: { roster: Roster }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const detailQ = useQuery({
    queryKey: ["roster", roster.id],
    queryFn: () => getRoster(roster.id),
  });
  const errorMsg = detailQ.data?.result?.error;
  const tooltip = errorMsg
    ?? (detailQ.isLoading ? "Loading error…" : "No error message recorded.");

  const del = useMutation({
    mutationFn: () => discardRoster(roster.id),
    onSuccess: () => {
      toast("Failed roster removed", "success");
      qc.invalidateQueries({ queryKey: ["rosters"] });
    },
    onError: (e) => toast(errorMessage(e, "Delete failed"), "error"),
  });

  return (
    <div className="card">
      <div className="card-header-row">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: "var(--fs-lg)", fontWeight: 500 }}>{roster.name}</span>
            <span
              className="badge badge-failed"
              title={tooltip}
              style={{ cursor: errorMsg ? "help" : "default" }}
            >
              Failed
            </span>
          </div>
          <RosterMeta roster={roster} />
        </div>
        <div className="row-end">
          <RegenerateButton roster={roster} />
          <button className="btn btn-sm btn-danger" onClick={() => del.mutate()}>Discard</button>
        </div>
      </div>
    </div>
  );
}

function RosterDetailView({ roster }: { roster: Roster }) {
  const detailQ = useQuery({
    queryKey: ["roster", roster.id],
    queryFn: () => getRoster(roster.id),
  });

  if (detailQ.isLoading) return <div className="empty-state">Loading…</div>;
  if (detailQ.isError) return <div className="empty-state">Failed to load roster.</div>;

  const detail = detailQ.data;
  if (!detail?.result) return <div className="empty-state">No solver result attached.</div>;

  return (
    <>
      <RosterGrid result={detail.result} />
      <RosterSummary result={detail.result} />
    </>
  );
}

function ExportButton({ roster }: { roster: Roster }) {
  const { toast } = useToast();
  const groupsQ = useQuery({ queryKey: ["shifts", "groups"], queryFn: listShiftGroups });
  const mut = useMutation({
    mutationFn: () => getRoster(roster.id),
    onSuccess: async (detail) => {
      if (!detail.result) {
        toast("No solver result to export", "error");
        return;
      }
      const groups = groupsQ.data ?? [];
      const resolveColour = (code: string) => {
        const g = groups.find((g) => g.code === code);
        return g ? groupColourFor(g) : groupColour(code);
      };
      try {
        await exportRosterToXlsx(detail, detail.result, resolveColour);
      } catch (e) {
        toast(errorMessage(e, "Export failed"), "error");
      }
    },
    onError: (e) => toast(errorMessage(e, "Could not load roster"), "error"),
  });
  return (
    <button
      className="btn btn-sm btn-primary"
      onClick={() => mut.mutate()}
      disabled={mut.isPending || groupsQ.isLoading}
    >
      {mut.isPending ? "Exporting…" : "Export"}
    </button>
  );
}

function DraftCard({ roster, onView }: { roster: Roster; onView: () => void }) {
  return (
    <div className="card">
      <div className="card-header-row">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: "var(--fs-lg)", fontWeight: 500 }}>{roster.name}</span>
            <span className="badge badge-draft">Draft</span>
          </div>
          <RosterMeta roster={roster} />
        </div>
        <div className="row-end">
          <button className="btn btn-sm" onClick={onView}>View</button>
          <RegenerateButton roster={roster} />
          <ApproveButton roster={roster} />
          <DiscardButton roster={roster} />
        </div>
      </div>
    </div>
  );
}

function ApprovedCard({ roster, onView }: { roster: Roster; onView: () => void }) {
  return (
    <div className="card">
      <div className="card-header-row">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: "var(--fs-lg)", fontWeight: 500 }}>{roster.name}</span>
            <span className="badge badge-approved">Approved</span>
          </div>
          <RosterMeta roster={roster} />
        </div>
        <div className="row-end">
          <button className="btn btn-sm" onClick={onView}>View</button>
          <ExportButton roster={roster} />
          <DiscardButton roster={roster} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function ApproveButton({ roster, onAfter }: { roster: Roster; onAfter?: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const mut = useMutation({
    mutationFn: () => approveRoster(roster.id),
    onSuccess: () => {
      toast(`${roster.name} approved ✓`, "success");
      qc.invalidateQueries({ queryKey: ["rosters"] });
      onAfter?.();
    },
    onError: (e) => toast(errorMessage(e, "Approve failed"), "error"),
  });
  return (
    <button className="btn btn-sm btn-success" onClick={() => mut.mutate()} disabled={mut.isPending}>
      {mut.isPending ? "Approving…" : "Approve"}
    </button>
  );
}

function RegenerateButton({ roster }: { roster: Roster }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const mut = useMutation({
    mutationFn: () => getRosterDemands(roster.id),
    onSuccess: (demands) => {
      navigate("/generate", {
        state: {
          regenerateFrom: {
            source_roster_id: roster.id,
            source_roster_name: roster.name,
            profile_id: roster.profile_id,
            roster_start: roster.roster_start,
            num_days: roster.num_days,
            target_work_min: roster.target_work_min,
            demands,
          },
        },
      });
      window.scrollTo({ top: 0 });
    },
    onError: (e) => toast(errorMessage(e, "Could not load demands"), "error"),
  });
  return (
    <button
      className="btn btn-sm btn-primary"
      onClick={() => mut.mutate()}
      disabled={mut.isPending}
    >
      {mut.isPending ? "Loading…" : "Regenerate"}
    </button>
  );
}

function DiscardButton({ roster, onAfter }: { roster: Roster; onAfter?: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isApproved = roster.status === "approved";
  const mut = useMutation({
    mutationFn: () => (isApproved ? deleteRoster(roster.id) : discardRoster(roster.id)),
    onSuccess: () => {
      toast(`${roster.name} ${isApproved ? "deleted" : "discarded"}`, "success");
      qc.invalidateQueries({ queryKey: ["rosters"] });
      onAfter?.();
    },
    onError: (e) => toast(errorMessage(e, isApproved ? "Delete failed" : "Discard failed"), "error"),
  });
  const confirmMsg = isApproved
    ? `${roster.name} is approved. Permanently delete? This cannot be undone.`
    : `Discard ${roster.name}?`;
  return (
    <button
      className="btn btn-sm btn-danger"
      onClick={() => confirm(confirmMsg) && mut.mutate()}
      disabled={mut.isPending}
    >
      {isApproved ? "Delete" : "Discard"}
    </button>
  );
}
