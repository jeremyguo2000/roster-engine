import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Roster,
  approveRoster,
  discardRoster,
  listRosters,
} from "../api/rosters";
import { errorMessage } from "../api/client";
import Modal from "../components/Modal";
import { useToast } from "../components/Toast";
import RosterGrid from "../components/RosterGrid";
import RosterSummary from "../components/RosterSummary";

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

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Rosters</h1>
          <p className="page-sub">Draft and approved rosters. Calendar view lands in step 9.</p>
        </div>
        <Link to="/generate" className="btn btn-primary">+ Generate Roster</Link>
      </div>

      {rostersQ.isLoading && <div className="empty-state">Loading…</div>}

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
            {approved.map((r) => <ApprovedCard key={r.id} roster={r} />)}
          </div>
        )}
      </section>

      {viewing && (
        <Modal open onClose={() => setViewing(null)} title={viewing.name} size="wide">
          {viewing.result ? (
            <>
              <RosterGrid result={viewing.result} />
              <RosterSummary result={viewing.result} />
              <div className="row-end" style={{ marginTop: 16 }}>
                <ApproveButton roster={viewing} onAfter={() => setViewing(null)} />
                <DiscardButton roster={viewing} onAfter={() => setViewing(null)} />
              </div>
            </>
          ) : (
            <div className="empty-state">No solver result attached.</div>
          )}
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function RosterMeta({ roster }: { roster: Roster }) {
  return (
    <div className="muted" style={{ fontSize: "var(--fs-sm)", marginTop: 4 }}>
      <span className="mono">{roster.roster_start}</span> · {roster.num_days} day{roster.num_days === 1 ? "" : "s"}
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
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: "var(--fs-lg)", fontWeight: 500 }}>{roster.name}</span>
            <span className="badge badge-failed">Failed</span>
          </div>
          <RosterMeta roster={roster} />
        </div>
        <div className="row-end">
          <button className="btn btn-sm btn-danger" onClick={() => del.mutate()}>Discard</button>
        </div>
      </div>
    </div>
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
          <ApproveButton roster={roster} />
          <DiscardButton roster={roster} />
        </div>
      </div>
    </div>
  );
}

function ApprovedCard({ roster }: { roster: Roster }) {
  const [open, setOpen] = useState(false);
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
          <button className="btn btn-sm" onClick={() => setOpen((v) => !v)}>
            {open ? "▲ Hide" : "▼ Show"}
          </button>
          <DiscardButton roster={roster} />
        </div>
      </div>
      {open && roster.result && (
        <div style={{ marginTop: 16 }}>
          <RosterGrid result={roster.result} />
          <RosterSummary result={roster.result} />
        </div>
      )}
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

function DiscardButton({ roster, onAfter }: { roster: Roster; onAfter?: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const mut = useMutation({
    mutationFn: () => discardRoster(roster.id),
    onSuccess: () => {
      toast(`${roster.name} discarded`, "success");
      qc.invalidateQueries({ queryKey: ["rosters"] });
      onAfter?.();
    },
    onError: (e) => toast(errorMessage(e, "Discard failed"), "error"),
  });
  return (
    <button
      className="btn btn-sm btn-danger"
      onClick={() => confirm(`Discard ${roster.name}?`) && mut.mutate()}
      disabled={mut.isPending}
    >
      {roster.status === "approved" ? "Delete" : "Discard"}
    </button>
  );
}
