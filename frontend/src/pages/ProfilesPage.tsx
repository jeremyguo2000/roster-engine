import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Profile,
  createProfile,
  deleteProfile,
  listProfiles,
  updateProfile,
} from "../api/profiles";
import { errorMessage } from "../api/client";
import Modal from "../components/Modal";
import { useToast } from "../components/Toast";
import ProfileShiftsTab from "../components/profiles/ProfileShiftsTab";
import ProfileStaffTab from "../components/profiles/ProfileStaffTab";
import ProfileSolverTab from "../components/profiles/ProfileSolverTab";
import ProfileRulesTab from "../components/profiles/ProfileRulesTab";

const TABS = ["Basics", "Shifts", "Staff", "Solver", "Rules"] as const;
type Tab = (typeof TABS)[number];

export default function ProfilesPage() {
  const profilesQ = useQuery({ queryKey: ["profiles"], queryFn: listProfiles });
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Profiles</h1>
          <p className="page-sub">Solver profiles: shifts, staff inclusion, weights, conditional rules.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>+ New Profile</button>
      </div>

      {profilesQ.isLoading && <div className="empty-state">Loading…</div>}
      {profilesQ.data?.length === 0 && (
        <div className="empty-state">No profiles yet. Create one to define a solver run.</div>
      )}

      <div className="stack">
        {profilesQ.data?.map((p) => (
          <ProfileCard key={p.id} profile={p} onEdit={() => setEditing(p)} />
        ))}
      </div>

      {createOpen && (
        <CreateProfileModal
          onClose={() => setCreateOpen(false)}
          onCreated={(p) => {
            setCreateOpen(false);
            setEditing(p);
          }}
        />
      )}
      {editing && <EditProfileModal profile={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function ProfileCard({ profile, onEdit }: { profile: Profile; onEdit: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const del = useMutation({
    mutationFn: () => deleteProfile(profile.id),
    onSuccess: () => {
      toast(`Profile ${profile.name} deleted`, "success");
      qc.invalidateQueries({ queryKey: ["profiles"] });
    },
    onError: (e) => toast(errorMessage(e, "Delete failed"), "error"),
  });

  const cfg = profile.config ?? {};
  const ruleCount = (cfg.conditional_constraints ?? []).length;

  return (
    <div className="card">
      <div className="card-header-row">
        <div>
          <div style={{ fontSize: "var(--fs-lg)", fontWeight: 500 }}>{profile.name}</div>
          <div className="muted" style={{ fontSize: "var(--fs-sm)", marginTop: 4 }}>
            time_limit {cfg.time_limit ?? 600}s · overstaff w{cfg.weight_overstaff ?? 20} · consec w{cfg.weight_consec ?? 100} · {ruleCount} rule{ruleCount === 1 ? "" : "s"}
          </div>
        </div>
        <div className="row-end">
          <button className="btn btn-sm" onClick={onEdit}>Edit</button>
          <button
            className="btn btn-sm btn-danger"
            onClick={() => confirm(`Delete profile ${profile.name}?`) && del.mutate()}
            disabled={del.isPending}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function CreateProfileModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (p: Profile) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const mut = useMutation({
    mutationFn: () => createProfile({ name: name.trim() }),
    onSuccess: (p) => {
      toast(`Profile ${p.name} created`, "success");
      qc.invalidateQueries({ queryKey: ["profiles"] });
      onCreated(p);
    },
    onError: (e) => toast(errorMessage(e, "Create failed"), "error"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) mut.mutate();
  }

  return (
    <Modal open onClose={onClose} title="New Profile" size="md">
      <form onSubmit={onSubmit} className="stack">
        <div className="field">
          <label className="label">Name</label>
          <input
            className="input"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <span className="field-hint">Add shifts, staff and config in the next step.</span>
        </div>
        <div className="row-end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={mut.isPending || !name.trim()}>
            {mut.isPending ? "Creating…" : "Create & Configure"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function EditProfileModal({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("Basics");
  // Refetch the profile so updates to config (Solver/Rules tabs) reflect immediately.
  const profileQ = useQuery({
    queryKey: ["profile", profile.id],
    queryFn: () => listProfiles().then((all) => all.find((p) => p.id === profile.id) ?? profile),
    initialData: profile,
    staleTime: 0,
  });
  const current = profileQ.data ?? profile;

  return (
    <Modal open onClose={onClose} title={`Edit Profile — ${current.name}`} size="wide">
      <div
        role="tablist"
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 16,
          borderBottom: "1px solid var(--border)",
        }}
      >
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`btn btn-sm ${tab === t ? "btn-primary" : "btn-ghost"}`}
            style={{
              borderRadius: "6px 6px 0 0",
              borderBottomColor: tab === t ? "var(--primary)" : "transparent",
            }}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Basics" && <ProfileBasicsTab profile={current} />}
      {tab === "Shifts" && <ProfileShiftsTab profile={current} />}
      {tab === "Staff" && <ProfileStaffTab profile={current} />}
      {tab === "Solver" && <ProfileSolverTab profile={current} />}
      {tab === "Rules" && <ProfileRulesTab profile={current} />}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function ProfileBasicsTab({ profile }: { profile: Profile }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState(profile.name);
  const [dirty, setDirty] = useState(false);

  const mut = useMutation({
    mutationFn: () => updateProfile(profile.id, { name }),
    onSuccess: () => {
      toast("Saved", "success");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["profiles"] });
      qc.invalidateQueries({ queryKey: ["profile", profile.id] });
    },
    onError: (e) => toast(errorMessage(e, "Save failed"), "error"),
  });

  return (
    <div className="stack">
      <div className="field">
        <label className="label">Profile name</label>
        <input
          className="input"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
        />
      </div>
      <div className="row-end">
        <button className="btn btn-primary" onClick={() => mut.mutate()} disabled={!dirty || mut.isPending}>
          {mut.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
