import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Staff,
  StaffGroup,
  StaffInput,
  Leave,
  createLeave,
  createStaff,
  createStaffGroup,
  deleteLeave,
  deleteStaffGroup,
  listLeaves,
  listStaff,
  listStaffGroups,
  restoreStaff,
  softDeleteStaff,
  updateStaff,
  updateStaffGroup,
} from "../api/staff";
import {
  listSkillTypes,
  createSkillType,
  addSkillValue,
  deleteSkillValue,
  deleteSkillType,
} from "../api/skills";
import { errorMessage } from "../api/client";
import Modal from "../components/Modal";
import { useToast } from "../components/Toast";
import StaffSkillsModal from "../components/staff/StaffSkillsModal";
import PermittedShiftsModal from "../components/staff/PermittedShiftsModal";

export default function StaffPage() {
  const [groupFilter, setGroupFilter] = useState<number | "all">("all");
  const [showDeleted, setShowDeleted] = useState(false);

  const [addStaff, setAddStaff] = useState(false);
  const [editStaff, setEditStaff] = useState<Staff | null>(null);
  const [skillsFor, setSkillsFor] = useState<Staff | null>(null);
  const [permittedFor, setPermittedFor] = useState<Staff | null>(null);
  const [manageGroups, setManageGroups] = useState(false);
  const [manageSkills, setManageSkills] = useState(false);

  const groupsQ = useQuery({ queryKey: ["staff", "groups"], queryFn: listStaffGroups });
  const staffQ = useQuery({
    queryKey: ["staff", "list", { include_deleted: showDeleted }],
    queryFn: () => listStaff({ include_deleted: showDeleted }),
  });

  const filtered = useMemo(() => {
    const all = staffQ.data ?? [];
    if (groupFilter === "all") return all;
    return all.filter((s) => s.staff_group_id === groupFilter);
  }, [staffQ.data, groupFilter]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Staff</h1>
          <p className="page-sub">Manage staff, skills, permitted shifts and leaves.</p>
        </div>
        <div className="row-end">
          <button className="btn" onClick={() => setManageSkills(true)}>Skill types</button>
          <button className="btn" onClick={() => setManageGroups(true)}>Staff groups</button>
          <button
            className="btn btn-primary"
            onClick={() => setAddStaff(true)}
            disabled={(groupsQ.data?.length ?? 0) === 0}
            title={(groupsQ.data?.length ?? 0) === 0 ? "Add a staff group first" : ""}
          >
            + Add Staff
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
          <div className="field" style={{ minWidth: 200 }}>
            <label className="label">Group</label>
            <select
              className="select"
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            >
              <option value="all">All groups</option>
              {groupsQ.data?.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <label className="row" style={{ marginTop: 26, gap: 6 }}>
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
            />
            <span style={{ fontSize: "var(--fs-sm)" }}>Show deleted</span>
          </label>
        </div>
      </div>

      {staffQ.isLoading && <div className="empty-state">Loading…</div>}
      {staffQ.data && filtered.length === 0 && (
        <div className="empty-state">No staff match this filter.</div>
      )}

      {filtered.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Name</th>
                <th>Group</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <StaffRow
                  key={s.id}
                  staff={s}
                  onEdit={() => setEditStaff(s)}
                  onSkills={() => setSkillsFor(s)}
                  onPermitted={() => setPermittedFor(s)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <LeavesSection staffList={staffQ.data ?? []} />

      {addStaff && <StaffFormModal mode="add" onClose={() => setAddStaff(false)} groups={groupsQ.data ?? []} />}
      {editStaff && (
        <StaffFormModal
          mode="edit"
          onClose={() => setEditStaff(null)}
          groups={groupsQ.data ?? []}
          existing={editStaff}
        />
      )}
      {skillsFor && <StaffSkillsModal staff={skillsFor} onClose={() => setSkillsFor(null)} />}
      {permittedFor && (
        <PermittedShiftsModal staff={permittedFor} onClose={() => setPermittedFor(null)} />
      )}
      {manageGroups && <StaffGroupsModal onClose={() => setManageGroups(false)} />}
      {manageSkills && <SkillTypesModal onClose={() => setManageSkills(false)} />}
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
      <td>{staff.staff_group.name}</td>
      <td>
        {staff.deleted ? (
          <span className="badge badge-draft">Archived</span>
        ) : (
          <span className="badge badge-approved">Active</span>
        )}
      </td>
      <td className="row-end">
        <button className="btn btn-sm" onClick={onEdit}>Edit</button>
        <button className="btn btn-sm" onClick={onSkills}>Skills</button>
        <button className="btn btn-sm" onClick={onPermitted}>Permitted</button>
        {staff.deleted ? (
          <button className="btn btn-sm" onClick={() => restore.mutate()} disabled={restore.isPending}>
            Restore
          </button>
        ) : (
          <button
            className="btn btn-sm btn-danger"
            onClick={() => confirm(`Archive ${staff.full_name}?`) && del.mutate()}
            disabled={del.isPending}
          >
            Archive
          </button>
        )}
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function StaffFormModal({
  mode,
  existing,
  groups,
  onClose,
}: {
  mode: "add" | "edit";
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
          staff_group_id: groups[0]?.id ?? 0,
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
    <Modal open onClose={onClose} title={mode === "add" ? "Add Staff" : `Edit — ${existing?.full_name}`} size="md">
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

function StaffGroupsModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const groupsQ = useQuery({ queryKey: ["staff", "groups"], queryFn: listStaffGroups });
  const [newName, setNewName] = useState("");

  const create = useMutation({
    mutationFn: () => createStaffGroup({ name: newName.trim() }),
    onSuccess: () => {
      setNewName("");
      qc.invalidateQueries({ queryKey: ["staff", "groups"] });
    },
    onError: (e) => toast(errorMessage(e, "Create failed"), "error"),
  });

  return (
    <Modal open onClose={onClose} title="Staff Groups" size="md">
      <div className="stack">
        {(groupsQ.data ?? []).map((g) => (
          <StaffGroupRow key={g.id} group={g} />
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (newName.trim()) create.mutate();
        }}
        className="row"
        style={{ marginTop: 16 }}
      >
        <input
          className="input"
          placeholder="New group name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={!newName.trim() || create.isPending}>
          Add
        </button>
      </form>
      <div className="row-end" style={{ marginTop: 12 }}>
        <button className="btn" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}

function StaffGroupRow({ group }: { group: StaffGroup }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);

  const save = useMutation({
    mutationFn: () => updateStaffGroup(group.id, { name }),
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["staff", "groups"] });
    },
    onError: (e) => toast(errorMessage(e, "Save failed"), "error"),
  });
  const del = useMutation({
    mutationFn: () => deleteStaffGroup(group.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff"] }),
    onError: (e) => toast(errorMessage(e, "Delete failed"), "error"),
  });

  return (
    <div className="row" style={{ justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
      {editing ? (
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ flex: 1, marginRight: 8 }}
          autoFocus
        />
      ) : (
        <span>{group.name}</span>
      )}
      <div className="row-end">
        {editing ? (
          <>
            <button className="btn btn-sm" onClick={() => { setEditing(false); setName(group.name); }}>
              Cancel
            </button>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => save.mutate()}
              disabled={!name.trim() || save.isPending}
            >
              Save
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-sm" onClick={() => setEditing(true)}>Rename</button>
            <button
              className="btn btn-sm btn-danger"
              onClick={() => confirm(`Delete group ${group.name}?`) && del.mutate()}
            >
              ✕
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function SkillTypesModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const typesQ = useQuery({ queryKey: ["skills", "types"], queryFn: listSkillTypes });
  const [newType, setNewType] = useState({ name: "", description: "" });

  const createType = useMutation({
    mutationFn: () => createSkillType({ name: newType.name.trim(), description: newType.description.trim() || null }),
    onSuccess: () => {
      setNewType({ name: "", description: "" });
      qc.invalidateQueries({ queryKey: ["skills", "types"] });
    },
    onError: (e) => toast(errorMessage(e, "Create failed"), "error"),
  });

  return (
    <Modal open onClose={onClose} title="Skill Types" size="wide-md">
      <div className="stack">
        {typesQ.data?.length === 0 && (
          <div className="empty-state">No skill types yet.</div>
        )}
        {typesQ.data?.map((t) => (
          <SkillTypeRow key={t.id} typeId={t.id} name={t.name} description={t.description} values={t.values} />
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (newType.name.trim()) createType.mutate();
        }}
        className="card"
        style={{ marginTop: 16, padding: 16, background: "var(--bg)" }}
      >
        <div className="grid-2">
          <input
            className="input"
            placeholder="Type name (e.g. Certification)"
            value={newType.name}
            onChange={(e) => setNewType({ ...newType, name: e.target.value })}
          />
          <input
            className="input"
            placeholder="Description (optional)"
            value={newType.description}
            onChange={(e) => setNewType({ ...newType, description: e.target.value })}
          />
        </div>
        <div className="row-end" style={{ marginTop: 12 }}>
          <button type="submit" className="btn btn-primary" disabled={!newType.name.trim() || createType.isPending}>
            Add type
          </button>
        </div>
      </form>
      <div className="row-end" style={{ marginTop: 12 }}>
        <button className="btn" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}

function SkillTypeRow({
  typeId,
  name,
  description,
  values,
}: {
  typeId: number;
  name: string;
  description: string | null;
  values: { id: number; value: string }[];
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [newVal, setNewVal] = useState("");

  const addVal = useMutation({
    mutationFn: () => addSkillValue(typeId, newVal.trim()),
    onSuccess: () => {
      setNewVal("");
      qc.invalidateQueries({ queryKey: ["skills", "types"] });
    },
    onError: (e) => toast(errorMessage(e, "Add failed"), "error"),
  });
  const delVal = useMutation({
    mutationFn: (vid: number) => deleteSkillValue(typeId, vid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills", "types"] }),
    onError: (e) => toast(errorMessage(e, "Remove failed"), "error"),
  });
  const delType = useMutation({
    mutationFn: () => deleteSkillType(typeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills", "types"] }),
    onError: (e) => toast(errorMessage(e, "Delete failed"), "error"),
  });

  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <span style={{ fontWeight: 500 }}>{name}</span>
          {description && <span className="muted" style={{ marginLeft: 8, fontSize: "var(--fs-sm)" }}>— {description}</span>}
        </div>
        <button
          className="btn btn-sm btn-danger"
          onClick={() => confirm(`Delete type "${name}" and its values?`) && delType.mutate()}
        >
          Delete
        </button>
      </div>
      <div className="row" style={{ flexWrap: "wrap", marginBottom: 8 }}>
        {values.length === 0 ? (
          <span className="muted" style={{ fontSize: "var(--fs-sm)" }}>No values yet.</span>
        ) : (
          values.map((v) => (
            <span key={v.id} className="badge badge-running" style={{ padding: "4px 10px" }}>
              {v.value}
              <button
                className="btn btn-sm btn-ghost"
                style={{ padding: "0 4px", height: 18, marginLeft: 6 }}
                onClick={() => delVal.mutate(v.id)}
                aria-label="Remove"
              >
                ✕
              </button>
            </span>
          ))
        )}
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (newVal.trim()) addVal.mutate();
        }}
      >
        <input
          className="input"
          placeholder="New value"
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
        />
        <button type="submit" className="btn btn-sm btn-primary" disabled={!newVal.trim() || addVal.isPending}>
          + Value
        </button>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function LeavesSection({ staffList }: { staffList: Staff[] }) {
  const [from_date, setFromDate] = useState("");
  const [to_date, setToDate] = useState("");
  const [staffFilter, setStaffFilter] = useState<number | "all">("all");
  const [addOpen, setAddOpen] = useState(false);

  const leavesQ = useQuery({
    queryKey: ["leaves", { staff_id: staffFilter === "all" ? undefined : staffFilter, from_date, to_date }],
    queryFn: () =>
      listLeaves({
        staff_id: staffFilter === "all" ? undefined : staffFilter,
        from_date: from_date || undefined,
        to_date: to_date || undefined,
      }),
  });

  const staffMap = useMemo(() => new Map(staffList.map((s) => [s.id, s])), [staffList]);

  return (
    <section className="section">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <h2 className="section-title" style={{ margin: 0 }}>Leaves</h2>
        <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
          + Add Leave
        </button>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
          <div className="field" style={{ minWidth: 200 }}>
            <label className="label">Staff</label>
            <select
              className="select"
              value={staffFilter}
              onChange={(e) => setStaffFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            >
              <option value="all">All staff</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>{s.full_name}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: 160 }}>
            <label className="label">From</label>
            <input type="date" className="input" value={from_date} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="field" style={{ minWidth: 160 }}>
            <label className="label">To</label>
            <input type="date" className="input" value={to_date} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>
      </div>

      {leavesQ.isLoading && <div className="empty-state">Loading leaves…</div>}
      {leavesQ.data?.length === 0 && <div className="empty-state">No leaves recorded for this filter.</div>}
      {(leavesQ.data?.length ?? 0) > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Staff</th>
                <th>Shift code</th>
                <th>Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {leavesQ.data!.map((leave) => (
                <LeaveRow key={leave.id} leave={leave} staffName={staffMap.get(leave.staff_id)?.full_name ?? `#${leave.staff_id}`} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && <AddLeaveModal staffList={staffList} onClose={() => setAddOpen(false)} />}
    </section>
  );
}

function LeaveRow({ leave, staffName }: { leave: Leave; staffName: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const del = useMutation({
    mutationFn: () => deleteLeave(leave.id),
    onSuccess: () => {
      toast("Leave removed", "success");
      qc.invalidateQueries({ queryKey: ["leaves"] });
    },
    onError: (e) => toast(errorMessage(e, "Delete failed"), "error"),
  });
  return (
    <tr>
      <td className="mono">{leave.date}</td>
      <td>{staffName}</td>
      <td className="mono">{leave.shift_code}</td>
      <td className="muted" style={{ fontSize: "var(--fs-sm)" }}>{leave.note ?? ""}</td>
      <td className="row-end">
        <button
          className="btn btn-sm btn-danger"
          onClick={() => confirm("Remove this leave?") && del.mutate()}
        >
          ✕
        </button>
      </td>
    </tr>
  );
}

function AddLeaveModal({ staffList, onClose }: { staffList: Staff[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    staff_id: staffList[0]?.id ?? 0,
    date: "",
    shift_code: "AL",
    note: "",
  });

  const mut = useMutation({
    mutationFn: () => createLeave({
      staff_id: form.staff_id,
      date: form.date,
      shift_code: form.shift_code,
      note: form.note || null,
    }),
    onSuccess: () => {
      toast("Leave added", "success");
      qc.invalidateQueries({ queryKey: ["leaves"] });
      onClose();
    },
    onError: (e) => toast(errorMessage(e, "Add failed"), "error"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    mut.mutate();
  }

  return (
    <Modal open onClose={onClose} title="Add Leave" size="md">
      <form onSubmit={onSubmit} className="stack">
        <div className="field">
          <label className="label">Staff</label>
          <select
            className="select"
            value={form.staff_id}
            onChange={(e) => setForm({ ...form, staff_id: Number(e.target.value) })}
            required
          >
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </select>
        </div>
        <div className="grid-2">
          <div className="field">
            <label className="label">Date</label>
            <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </div>
          <div className="field">
            <label className="label">Shift code</label>
            <input className="input mono" value={form.shift_code} onChange={(e) => setForm({ ...form, shift_code: e.target.value })} required />
            <span className="field-hint">Default <span className="mono">AL</span> (Annual Leave). Must match a non-work shift.</span>
          </div>
        </div>
        <div className="field">
          <label className="label">Note</label>
          <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Optional" />
        </div>
        <div className="row-end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={mut.isPending}>
            {mut.isPending ? "Adding…" : "Add Leave"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
