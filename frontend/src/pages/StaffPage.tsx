import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Staff,
  StaffGroup,
  StaffInput,
  createStaff,
  createStaffGroup,
  deleteStaffGroup,
  listStaff,
  listStaffGroups,
  restoreStaff,
  softDeleteStaff,
  updateStaff,
  updateStaffGroup,
} from "../api/staff";
import { errorMessage } from "../api/client";
import Modal from "../components/Modal";
import { useToast } from "../components/Toast";
import StaffSkillsModal from "../components/staff/StaffSkillsModal";
import PermittedShiftsModal from "../components/staff/PermittedShiftsModal";
import { useCollapsed } from "../lib/useCollapsed";

export default function StaffPage() {
  const [showDeleted, setShowDeleted] = useState(false);

  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [addStaffFor, setAddStaffFor] = useState<StaffGroup | null>(null);
  const [editStaff, setEditStaff] = useState<Staff | null>(null);
  const [skillsFor, setSkillsFor] = useState<Staff | null>(null);
  const [permittedFor, setPermittedFor] = useState<Staff | null>(null);

  const groupsQ = useQuery({ queryKey: ["staff", "groups"], queryFn: listStaffGroups });
  const staffQ = useQuery({
    queryKey: ["staff", "list", { include_deleted: showDeleted }],
    queryFn: () => listStaff({ include_deleted: showDeleted }),
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Staff</h1>
          <p className="page-sub">Staff groups and the staff they contain.</p>
        </div>
        <div className="row-end">
          <label className="row" style={{ gap: 6 }}>
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
            />
            <span style={{ fontSize: "var(--fs-sm)" }}>Show deleted</span>
          </label>
          <button className="btn btn-primary" onClick={() => setAddGroupOpen(true)}>
            + Add Group
          </button>
        </div>
      </div>

      {groupsQ.isLoading && <div className="empty-state">Loading…</div>}
      {groupsQ.isError && (
        <div className="empty-state" style={{ color: "var(--accent-ink)" }}>
          {errorMessage(groupsQ.error)}
        </div>
      )}
      {groupsQ.data && groupsQ.data.length === 0 && (
        <div className="empty-state">No staff groups yet. Add one to get started.</div>
      )}

      <div className="stack">
        {groupsQ.data?.map((g) => (
          <StaffGroupCard
            key={g.id}
            group={g}
            staff={(staffQ.data ?? []).filter((s) => s.staff_group_id === g.id)}
            onAddStaff={() => setAddStaffFor(g)}
            onEditStaff={setEditStaff}
            onSkills={setSkillsFor}
            onPermitted={setPermittedFor}
          />
        ))}
      </div>

      <AddStaffGroupModal open={addGroupOpen} onClose={() => setAddGroupOpen(false)} />
      {addStaffFor && (
        <StaffFormModal
          mode="add"
          group={addStaffFor}
          onClose={() => setAddStaffFor(null)}
          groups={groupsQ.data ?? []}
        />
      )}
      {editStaff && (
        <StaffFormModal
          mode="edit"
          group={editStaff.staff_group}
          onClose={() => setEditStaff(null)}
          groups={groupsQ.data ?? []}
          existing={editStaff}
        />
      )}
      {skillsFor && <StaffSkillsModal staff={skillsFor} onClose={() => setSkillsFor(null)} />}
      {permittedFor && (
        <PermittedShiftsModal staff={permittedFor} onClose={() => setPermittedFor(null)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function StaffGroupCard({
  group,
  staff,
  onAddStaff,
  onEditStaff,
  onSkills,
  onPermitted,
}: {
  group: StaffGroup;
  staff: Staff[];
  onAddStaff: () => void;
  onEditStaff: (s: Staff) => void;
  onSkills: (s: Staff) => void;
  onPermitted: (s: Staff) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [collapsed, setCollapsed] = useCollapsed(`roster-engine.collapsed.staff-group.${group.id}`);
  const bodyId = `staff-group-body-${group.id}`;

  const del = useMutation({
    mutationFn: () => deleteStaffGroup(group.id),
    onSuccess: () => {
      toast(`Group ${group.name} deleted`, "success");
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (e) => toast(errorMessage(e, "Delete failed"), "error"),
  });
  const rename = useMutation({
    mutationFn: () => updateStaffGroup(group.id, { name: name.trim() }),
    onSuccess: () => {
      toast("Group renamed", "success");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (e) => toast(errorMessage(e, "Save failed"), "error"),
  });

  return (
    <div className="card">
      <div className="card-header-row">
        {editing ? (
          <div style={{ flex: 1 }}>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ fontSize: 18, fontWeight: 600, maxWidth: 320 }}
              autoFocus
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            style={{
              background: "none",
              border: 0,
              padding: 0,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 12,
              font: "inherit",
              color: "inherit",
              textAlign: "left",
              flex: 1,
            }}
          >
            <span style={{ fontSize: 14, width: 12, display: "inline-block" }}>
              {collapsed ? "▸" : "▾"}
            </span>
            <span style={{ fontSize: 18, fontWeight: 600 }}>{group.name}</span>
            <span className="muted">({staff.length})</span>
          </button>
        )}
        <div className="row-end">
          {editing ? (
            <>
              <button
                className="btn btn-sm"
                onClick={() => {
                  setEditing(false);
                  setName(group.name);
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => rename.mutate()}
                disabled={!name.trim() || rename.isPending}
              >
                Save
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-sm" onClick={() => setEditing(true)}>Rename</button>
              <button className="btn btn-sm btn-primary" onClick={onAddStaff}>+ Staff</button>
              <button
                className="btn btn-sm btn-danger"
                onClick={() => {
                  if (confirm(`Delete group ${group.name}?`)) del.mutate();
                }}
                disabled={del.isPending}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {!collapsed && (
        <div id={bodyId} role="region">
          {staff.length === 0 ? (
            <div className="empty-state" style={{ marginTop: 16 }}>No staff in this group yet.</div>
          ) : (
            <div style={{ marginTop: 16, overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee ID</th>
                    <th>Name</th>
                    <th>Status</th>
                    <th></th>
                    <th></th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s) => (
                    <StaffRow
                      key={s.id}
                      staff={s}
                      onEdit={() => onEditStaff(s)}
                      onSkills={() => onSkills(s)}
                      onPermitted={() => onPermitted(s)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function StaffRow({
  staff,
  onEdit,
  onSkills,
  onPermitted,
}: {
  staff: Staff;
  onEdit: () => void;
  onSkills: () => void;
  onPermitted: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const del = useMutation({
    mutationFn: () => softDeleteStaff(staff.id),
    onSuccess: () => {
      toast(`${staff.full_name} archived`, "success");
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (e) => toast(errorMessage(e, "Delete failed"), "error"),
  });
  const restore = useMutation({
    mutationFn: () => restoreStaff(staff.id),
    onSuccess: () => {
      toast(`${staff.full_name} restored`, "success");
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (e) => toast(errorMessage(e, "Restore failed"), "error"),
  });

  return (
    <tr style={staff.deleted ? { opacity: 0.55 } : undefined}>
      <td className="mono">{staff.employee_id}</td>
      <td>{staff.full_name}</td>
      <td>
        {staff.deleted ? (
          <span className="badge badge-draft">Archived</span>
        ) : (
          <span className="badge badge-approved">Active</span>
        )}
      </td>
      <td>
        <button
          className="btn btn-sm mono"
          onClick={onSkills}
          style={{
            background: "var(--status-running-bg)",
            color: "var(--status-running-ink)",
            borderColor: "var(--status-running-ink)",
            borderRadius: 999,
          }}
        >
          Skills
        </button>
      </td>
      <td>
        <button
          className="btn btn-sm mono"
          onClick={onPermitted}
          style={{
            background: "var(--status-running-bg)",
            color: "var(--status-running-ink)",
            borderColor: "var(--status-running-ink)",
            borderRadius: 999,
          }}
        >
          Shifts
        </button>
      </td>
      <td className="row-end">
        <button className="btn btn-sm" aria-label="Edit" title="Edit" onClick={onEdit}>✎</button>
        {staff.deleted ? (
          <button className="btn btn-sm" onClick={() => restore.mutate()} disabled={restore.isPending}>
            Restore
          </button>
        ) : (
          <button
            className="btn btn-sm btn-danger"
            aria-label="Archive"
            title="Archive"
            onClick={() => confirm(`Archive ${staff.full_name}?`) && del.mutate()}
            disabled={del.isPending}
          >
            ✕
          </button>
        )}
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function StaffFormModal({
  mode,
  group,
  existing,
  groups,
  onClose,
}: {
  mode: "add" | "edit";
  group: StaffGroup;
  existing?: Staff;
  groups: StaffGroup[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<StaffInput>(
    existing
      ? {
          staff_group_id: existing.staff_group_id,
          employee_id: existing.employee_id,
          full_name: existing.full_name,
        }
      : {
          staff_group_id: group.id,
          employee_id: "",
          full_name: "",
        },
  );

  const mut = useMutation({
    mutationFn: () => (mode === "add" ? createStaff(form) : updateStaff(existing!.id, form)),
    onSuccess: () => {
      toast(mode === "add" ? `${form.full_name} added` : `${form.full_name} updated`, "success");
      qc.invalidateQueries({ queryKey: ["staff"] });
      onClose();
    },
    onError: (e) => toast(errorMessage(e, "Save failed"), "error"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    mut.mutate();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "add" ? `Add Staff to ${group.name}` : `Edit — ${existing?.full_name}`}
      size="md"
    >
      <form onSubmit={onSubmit} className="stack">
        <div className="field">
          <label className="label">Employee ID</label>
          <input
            className="input mono"
            autoFocus
            value={form.employee_id}
            onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
            required
          />
        </div>
        <div className="field">
          <label className="label">Full name</label>
          <input
            className="input"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            required
          />
        </div>
        {mode === "edit" && (
          <div className="field">
            <label className="label">Group</label>
            <select
              className="select"
              value={form.staff_group_id}
              onChange={(e) => setForm({ ...form, staff_group_id: Number(e.target.value) })}
              required
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="row-end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={mut.isPending}>
            {mut.isPending ? "Saving…" : mode === "add" ? "Add Staff" : "Save Changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function AddStaffGroupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");

  const mut = useMutation({
    mutationFn: () => createStaffGroup({ name: name.trim() }),
    onSuccess: () => {
      toast(`Group ${name} added`, "success");
      qc.invalidateQueries({ queryKey: ["staff", "groups"] });
      setName("");
      onClose();
    },
    onError: (e) => toast(errorMessage(e, "Create failed"), "error"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    mut.mutate();
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Staff Group" size="md">
      <form onSubmit={onSubmit} className="stack">
        <div className="field">
          <label className="label">Name</label>
          <input
            className="input"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Nurses, Doctors, Admin"
            required
          />
        </div>
        <div className="row-end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!name.trim() || mut.isPending}>
            {mut.isPending ? "Adding…" : "Add Group"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

