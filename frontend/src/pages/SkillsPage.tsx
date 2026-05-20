import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addSkillValue,
  createSkillType,
  deleteSkillType,
  deleteSkillValue,
  listSkillTypes,
  updateSkillType,
} from "../api/skills";
import { errorMessage } from "../api/client";
import Modal from "../components/Modal";
import { useToast } from "../components/Toast";

export default function SkillsPage() {
  const [addOpen, setAddOpen] = useState(false);
  const typesQ = useQuery({ queryKey: ["skills", "types"], queryFn: listSkillTypes });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Skills</h1>
          <p className="page-sub">Skill types and the values they accept.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
          + Add Skill Type
        </button>
      </div>

      {typesQ.isLoading && <div className="empty-state">Loading…</div>}
      {typesQ.isError && (
        <div className="empty-state" style={{ color: "var(--accent-ink)" }}>
          {errorMessage(typesQ.error)}
        </div>
      )}
      {typesQ.data && typesQ.data.length === 0 && (
        <div className="empty-state">No skill types yet. Add one to get started.</div>
      )}

      <div className="stack">
        {typesQ.data?.map((t) => (
          <SkillTypeRow key={t.id} typeId={t.id} name={t.name} description={t.description} values={t.values} />
        ))}
      </div>

      <AddSkillTypeModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

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
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const [editDescription, setEditDescription] = useState(description ?? "");

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
  const renameType = useMutation({
    mutationFn: () =>
      updateSkillType(typeId, {
        name: editName.trim(),
        description: editDescription.trim() || null,
      }),
    onSuccess: () => {
      toast("Skill type updated", "success");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["skills", "types"] });
    },
    onError: (e) => toast(errorMessage(e, "Save failed"), "error"),
  });

  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
        {editing ? (
          <div className="row" style={{ flex: 1, gap: 8, flexWrap: "wrap" }}>
            <input
              className="input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Name"
              style={{ flex: "1 1 180px" }}
              autoFocus
            />
            <input
              className="input"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Description (optional)"
              style={{ flex: "2 1 240px" }}
            />
          </div>
        ) : (
          <div>
            <span style={{ fontWeight: 500 }}>{name}</span>
            {description && <span className="muted" style={{ marginLeft: 8, fontSize: "var(--fs-sm)" }}>— {description}</span>}
          </div>
        )}
        <div className="row-end">
          {editing ? (
            <>
              <button
                className="btn btn-sm"
                onClick={() => {
                  setEditing(false);
                  setEditName(name);
                  setEditDescription(description ?? "");
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => renameType.mutate()}
                disabled={!editName.trim() || renameType.isPending}
              >
                Save
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-sm" onClick={() => setEditing(true)}>Edit</button>
              <button
                className="btn btn-sm btn-danger"
                onClick={() => confirm(`Delete type "${name}" and its values?`) && delType.mutate()}
              >
                Delete
              </button>
            </>
          )}
        </div>
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
          Add
        </button>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function AddSkillTypeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", description: "" });

  const mut = useMutation({
    mutationFn: () =>
      createSkillType({
        name: form.name.trim(),
        description: form.description.trim() || null,
      }),
    onSuccess: () => {
      toast(`Skill type ${form.name} added`, "success");
      qc.invalidateQueries({ queryKey: ["skills", "types"] });
      setForm({ name: "", description: "" });
      onClose();
    },
    onError: (e) => toast(errorMessage(e, "Create failed"), "error"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    mut.mutate();
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Skill Type" size="md">
      <form onSubmit={onSubmit} className="stack">
        <div className="field">
          <label className="label">Name</label>
          <input
            className="input"
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Certification"
            required
          />
        </div>
        <div className="field">
          <label className="label">Description</label>
          <input
            className="input"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Optional"
          />
        </div>
        <div className="row-end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!form.name.trim() || mut.isPending}>
            {mut.isPending ? "Adding…" : "Add Skill Type"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
