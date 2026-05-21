import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ShiftGroup,
  Shift,
  ShiftInput,
  ShiftGroupInput,
  createShift,
  createShiftGroup,
  deleteShift,
  deleteShiftGroup,
  listShiftGroups,
  listShifts,
  updateShift,
  updateShiftGroup,
} from "../api/shifts";
import { errorMessage } from "../api/client";
import Modal from "../components/Modal";
import { useToast } from "../components/Toast";
import { CURATED_COLOURS } from "../lib/colours";
import { hhmmToMin, minToHHMM, durationMin } from "../lib/time";
import { useCollapsed } from "../lib/useCollapsed";

export default function ShiftsPage() {
  const groupsQ = useQuery({ queryKey: ["shifts", "groups"], queryFn: listShiftGroups });
  const shiftsQ = useQuery({ queryKey: ["shifts", "list"], queryFn: () => listShifts() });

  const [groupModal, setGroupModal] = useState<{ existing?: ShiftGroup } | null>(null);
  const [addShiftFor, setAddShiftFor] = useState<ShiftGroup | null>(null);
  const [editShift, setEditShift] = useState<Shift | null>(null);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Shifts</h1>
          <p className="page-sub">Shift groups and the shifts they contain.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setGroupModal({})}>
          + Add Group
        </button>
      </div>

      {groupsQ.isLoading && <div className="empty-state">Loading…</div>}
      {groupsQ.isError && (
        <div className="empty-state" style={{ color: "var(--accent-ink)" }}>
          {errorMessage(groupsQ.error)}
        </div>
      )}

      {groupsQ.data && groupsQ.data.length === 0 && (
        <div className="empty-state">No shift groups yet. Add one to get started.</div>
      )}

      <div className="stack">
        {groupsQ.data?.map((g) => (
          <GroupCard
            key={g.id}
            group={g}
            shifts={(shiftsQ.data ?? []).filter((s) => s.group_id === g.id)}
            onAddShift={() => setAddShiftFor(g)}
            onEditShift={setEditShift}
            onEditGroup={() => setGroupModal({ existing: g })}
          />
        ))}
      </div>

      {groupModal && (
        <GroupFormModal
          existing={groupModal.existing}
          onClose={() => setGroupModal(null)}
        />
      )}
      {addShiftFor && (
        <ShiftFormModal
          group={addShiftFor}
          onClose={() => setAddShiftFor(null)}
          mode="add"
        />
      )}
      {editShift && (
        <ShiftFormModal
          group={editShift.group}
          existing={editShift}
          onClose={() => setEditShift(null)}
          mode="edit"
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function GroupCard({
  group,
  shifts,
  onAddShift,
  onEditShift,
  onEditGroup,
}: {
  group: ShiftGroup;
  shifts: Shift[];
  onAddShift: () => void;
  onEditShift: (s: Shift) => void;
  onEditGroup: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [collapsed, setCollapsed] = useCollapsed(`roster-engine.collapsed.shift-group.${group.id}`);
  const bodyId = `shift-group-body-${group.id}`;
  const del = useMutation({
    mutationFn: () => deleteShiftGroup(group.id),
    onSuccess: () => {
      toast(`Group ${group.code} deleted`, "success");
      qc.invalidateQueries({ queryKey: ["shifts"] });
    },
    onError: (e) => toast(errorMessage(e, "Delete failed"), "error"),
  });
  const delShift = useMutation({
    mutationFn: (id: number) => deleteShift(id),
    onSuccess: () => {
      toast("Shift deleted", "success");
      qc.invalidateQueries({ queryKey: ["shifts"] });
    },
    onError: (e) => toast(errorMessage(e, "Delete failed"), "error"),
  });

  return (
    <div className="card">
      <div className="card-header-row">
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
            minWidth: 0,
          }}
        >
          <span style={{ fontSize: 14, width: 12, display: "inline-block" }}>
            {collapsed ? "▸" : "▾"}
          </span>
          <span className="mono" style={{ fontSize: 18, fontWeight: 600 }}>{group.code}</span>
          {group.is_work_shift && <GroupPill label="Work" color={group.color} />}
          {group.is_night_shift && <GroupPill label="Night" color={group.color} />}
          {!group.is_work_shift && <GroupPill label="Non-work" color={group.color} />}
          <span className="muted">({shifts.length} {shifts.length === 1 ? "shift" : "shifts"})</span>
        </button>
        <div className="row-end">
          <button className="btn btn-sm" onClick={onEditGroup}>Edit</button>
          <button className="btn btn-sm btn-primary" onClick={onAddShift}>+ Shift</button>
          {group.code !== "Leaves" && (
            <button
              className="btn btn-sm btn-danger"
              onClick={() => {
                if (confirm(`Delete group ${group.code}?`)) del.mutate();
              }}
              disabled={del.isPending}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div id={bodyId} role="region">
          {shifts.length === 0 ? (
            <div className="empty-state" style={{ marginTop: 16 }}>No shifts in this group yet.</div>
          ) : (
            <div style={{ marginTop: 16, overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Work</th>
                    <th>Break</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {shifts.map((s) => (
                    <tr key={s.id}>
                      <td className="mono">{s.code}</td>
                      <td>{s.name}</td>
                      <td className="mono">{minToHHMM(s.start_min)}</td>
                      <td className="mono">
                        {minToHHMM(s.end_min)}
                        {s.end_min <= s.start_min && (
                          <span className="muted" style={{ marginLeft: 6 }}>+1d</span>
                        )}
                      </td>
                      <td className="mono">{(s.work_min / 60).toFixed(2)}h</td>
                      <td className="mono">{s.break_min}m</td>
                      <td className="row-end">
                        <button
                          className="btn btn-sm"
                          aria-label="Edit"
                          title="Edit"
                          onClick={() => onEditShift(s)}
                        >
                          ✎
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => {
                            if (confirm(`Delete shift ${s.code}?`)) delShift.mutate(s.id);
                          }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
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

function GroupPill({ label, color }: { label: string; color: string }) {
  return (
    <span className="badge" style={{ background: color + "1A", color }}>
      {label}
    </span>
  );
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const isCurated = CURATED_COLOURS.some((c) => c.toLowerCase() === value.toLowerCase());
  return (
    <div className="field">
      <label className="label">Colour</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {CURATED_COLOURS.map((c) => {
          const selected = c.toLowerCase() === value.toLowerCase();
          return (
            <button
              key={c}
              type="button"
              aria-label={`Use colour ${c}`}
              onClick={() => onChange(c)}
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: c,
                border: selected ? "2px solid var(--ink)" : "2px solid transparent",
                boxShadow: selected ? "inset 0 0 0 2px var(--surface)" : "none",
                cursor: "pointer",
                padding: 0,
              }}
            />
          );
        })}
        <label
          aria-label="Pick a custom colour"
          title="Pick a custom colour"
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            cursor: "pointer",
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: isCurated ? "transparent" : value,
            border: isCurated ? "2px dashed var(--border)" : "2px solid var(--ink)",
            boxShadow: isCurated ? "none" : "inset 0 0 0 2px var(--surface)",
            color: "var(--muted)",
            fontSize: 16,
            lineHeight: 1,
          }}
        >
          {isCurated && <span aria-hidden="true">+</span>}
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              opacity: 0,
              cursor: "pointer",
              border: 0,
              padding: 0,
            }}
          />
        </label>
      </div>
    </div>
  );
}

function GroupFormModal({
  existing,
  onClose,
}: {
  existing?: ShiftGroup;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!existing;
  const colourOnly = !!existing && existing.code === "Leaves";
  const [form, setForm] = useState<ShiftGroupInput>(
    existing
      ? {
          code: existing.code,
          is_work_shift: existing.is_work_shift,
          is_night_shift: existing.is_night_shift,
          color: existing.color,
        }
      : { code: "", is_work_shift: true, is_night_shift: false, color: CURATED_COLOURS[0] },
  );

  const mut = useMutation({
    mutationFn: () =>
      isEdit ? updateShiftGroup(existing!.id, form) : createShiftGroup(form),
    onSuccess: () => {
      toast(isEdit ? `Group ${form.code} updated` : `Group ${form.code} added`, "success");
      qc.invalidateQueries({ queryKey: ["shifts"] });
      onClose();
    },
    onError: (e) => toast(errorMessage(e, isEdit ? "Update failed" : "Create failed"), "error"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.color || !HEX_RE.test(form.color)) {
      toast("Colour must be a #RRGGBB hex value", "error");
      return;
    }
    mut.mutate();
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? "Edit Shift Group" : "Add Shift Group"} size="md">
      <form onSubmit={onSubmit} className="stack">
        {!colourOnly && (
          <>
            <div className="field">
              <label className="label">Code</label>
              <input
                className="input mono"
                autoFocus
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="DSG / ESG / NSG / Off / Leaves …"
                required
              />
            </div>
            <div className="field">
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={form.is_work_shift ?? true}
                  onChange={(e) => setForm({ ...form, is_work_shift: e.target.checked })}
                />
                <span>Work Shifts</span>
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={form.is_night_shift ?? false}
                  onChange={(e) => setForm({ ...form, is_night_shift: e.target.checked })}
                />
                <span>Night Shifts</span>
              </label>
            </div>
          </>
        )}
        <ColorPicker
          value={form.color ?? CURATED_COLOURS[0]}
          onChange={(c) => setForm({ ...form, color: c })}
        />
        <div className="row-end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={mut.isPending}>
            {mut.isPending ? "Saving…" : isEdit ? "Save Changes" : "Add Group"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface ShiftFormState {
  code: string;
  name: string;
  start: string;
  end: string;
  work_hours: string;
  break_min: string;
}

function toFormState(s?: Shift): ShiftFormState {
  if (!s) return { code: "", name: "", start: "09:00", end: "17:00", work_hours: "8", break_min: "0" };
  return {
    code: s.code,
    name: s.name,
    start: minToHHMM(s.start_min),
    end: minToHHMM(s.end_min),
    work_hours: (s.work_min / 60).toString(),
    break_min: s.break_min.toString(),
  };
}

function ShiftFormModal({
  group,
  existing,
  onClose,
  mode,
}: {
  group: ShiftGroup;
  existing?: Shift;
  onClose: () => void;
  mode: "add" | "edit";
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<ShiftFormState>(toFormState(existing));
  const [error, setError] = useState<string | null>(null);

  const start_min_preview = safe(() => hhmmToMin(form.start));
  const end_min_preview = safe(() => hhmmToMin(form.end));
  const dur =
    start_min_preview !== null && end_min_preview !== null
      ? durationMin(start_min_preview, end_min_preview)
      : null;

  const mut = useMutation({
    mutationFn: async () => {
      const start_min = hhmmToMin(form.start);
      const end_min = hhmmToMin(form.end);
      const work_hours = parseFloat(form.work_hours);
      const break_min = parseInt(form.break_min || "0", 10);
      if (!Number.isFinite(work_hours) || work_hours < 0) throw new Error("Work hours must be a positive number");
      if (!Number.isFinite(break_min) || break_min < 0) throw new Error("Break must be a positive integer");
      const body: ShiftInput = {
        group_id: group.id,
        code: form.code.trim(),
        name: form.name.trim(),
        start_min,
        end_min,
        work_min: Math.round(work_hours * 60),
        break_min,
      };
      if (mode === "add") return createShift(body);
      if (!existing) throw new Error("Missing shift to edit");
      return updateShift(existing.id, body);
    },
    onSuccess: () => {
      toast(mode === "add" ? `Shift ${form.code} added` : `Shift ${form.code} updated`, "success");
      qc.invalidateQueries({ queryKey: ["shifts"] });
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    mut.mutate();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "add" ? `Add Shift to ${group.code}` : `Edit Shift — ${existing?.code}`}
      size="wide-md"
    >
      <form onSubmit={onSubmit} className="stack">
        <div className="grid-2">
          <div className="field">
            <label className="label">Code</label>
            <input
              className="input mono"
              autoFocus
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label className="label">Name</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
        </div>
        <div className="grid-3">
          <div className="field">
            <label className="label">Start (HH:MM)</label>
            <input
              className="input mono"
              value={form.start}
              onChange={(e) => setForm({ ...form, start: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label className="label">End (HH:MM)</label>
            <input
              className="input mono"
              value={form.end}
              onChange={(e) => setForm({ ...form, end: e.target.value })}
              required
            />
            {start_min_preview !== null && end_min_preview !== null && end_min_preview <= start_min_preview && (
              <span className="field-hint">Overnight shift (rolls into next day).</span>
            )}
          </div>
          <div className="field">
            <label className="label">Work hours</label>
            <input
              className="input mono"
              value={form.work_hours}
              onChange={(e) => setForm({ ...form, work_hours: e.target.value })}
              required
            />
            {dur !== null && (
              <span className="field-hint">Wall duration {(dur / 60).toFixed(2)}h.</span>
            )}
          </div>
        </div>
        <div className="field">
          <label className="label">Break (minutes)</label>
          <input
            className="input mono"
            style={{ maxWidth: 120 }}
            value={form.break_min}
            onChange={(e) => setForm({ ...form, break_min: e.target.value })}
            required
          />
        </div>
        {error && <div className="field-error">{error}</div>}
        <div className="row-end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={mut.isPending}>
            {mut.isPending ? "Saving…" : mode === "add" ? "Add Shift" : "Save Changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function safe<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}
