import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Staff,
  addPermittedShift,
  getPermittedShifts,
  removePermittedShift,
} from "../../api/staff";
import { listShiftGroups, listShifts } from "../../api/shifts";
import { errorMessage } from "../../api/client";
import Modal from "../Modal";
import { useToast } from "../Toast";

export default function PermittedShiftsModal({
  staff,
  onClose,
}: {
  staff: Staff;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const permQ = useQuery({
    queryKey: ["staff", staff.id, "permitted-shifts"],
    queryFn: () => getPermittedShifts(staff.id),
  });
  const groupsQ = useQuery({ queryKey: ["shifts", "groups"], queryFn: listShiftGroups });
  const shiftsQ = useQuery({ queryKey: ["shifts", "list"], queryFn: () => listShifts() });

  const permitted = useMemo(
    () => new Set((permQ.data?.permitted_shifts ?? []).map((p) => p.shift_id)),
    [permQ.data],
  );

  // If no restrictions exist, all shifts are implicitly permitted (per backend semantics).
  // Adding the first permitted shift converts the staff to restricted mode.
  const restricted = (permQ.data?.permitted_shifts.length ?? 0) > 0;

  const add = useMutation({
    mutationFn: (shift_id: number) => addPermittedShift(staff.id, shift_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff", staff.id, "permitted-shifts"] }),
    onError: (e) => toast(errorMessage(e, "Add failed"), "error"),
  });
  const remove = useMutation({
    mutationFn: (shift_id: number) => removePermittedShift(staff.id, shift_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff", staff.id, "permitted-shifts"] }),
    onError: (e) => toast(errorMessage(e, "Remove failed"), "error"),
  });

  function toggleShift(id: number) {
    if (permitted.has(id)) remove.mutate(id);
    else add.mutate(id);
  }

  async function toggleGroup(group_id: number, want: boolean) {
    const groupShifts = (shiftsQ.data ?? []).filter((s) => s.group_id === group_id);
    for (const s of groupShifts) {
      const has = permitted.has(s.id);
      if (want && !has) await addPermittedShift(staff.id, s.id);
      else if (!want && has) await removePermittedShift(staff.id, s.id);
    }
    qc.invalidateQueries({ queryKey: ["staff", staff.id, "permitted-shifts"] });
  }

  async function toggleAll(want: boolean) {
    const allShifts = shiftsQ.data ?? [];
    for (const s of allShifts) {
      const has = permitted.has(s.id);
      if (want && !has) await addPermittedShift(staff.id, s.id);
      else if (!want && has) await removePermittedShift(staff.id, s.id);
    }
    qc.invalidateQueries({ queryKey: ["staff", staff.id, "permitted-shifts"] });
  }

  return (
    <Modal open onClose={onClose} title={`Permitted Shifts — ${staff.full_name}`} size="wide-md">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <span className="muted" style={{ fontSize: "var(--fs-sm)" }}>
          {restricted
            ? "Restricted — only ticked shifts are permitted."
            : "No restrictions — all shifts are permitted. Tick any to switch to restricted mode."}
        </span>
        <div className="row-end">
          <button className="btn btn-sm" onClick={() => toggleAll(true)}>Select all</button>
          <button className="btn btn-sm" onClick={() => toggleAll(false)}>Clear all</button>
        </div>
      </div>

      <div className="stack">
        {groupsQ.data?.map((g) => {
          const groupShifts = (shiftsQ.data ?? []).filter((s) => s.group_id === g.id);
          if (groupShifts.length === 0) return null;
          return (
            <div key={g.id} className="card" style={{ padding: 16 }}>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                <span className="mono" style={{ fontWeight: 600 }}>{g.code}</span>
                <div className="row-end">
                  <button className="btn btn-sm" onClick={() => toggleGroup(g.id, true)}>All</button>
                  <button className="btn btn-sm" onClick={() => toggleGroup(g.id, false)}>None</button>
                </div>
              </div>
              <div className="row" style={{ flexWrap: "wrap" }}>
                {groupShifts.map((s) => {
                  const has = permitted.has(s.id);
                  return (
                    <label
                      key={s.id}
                      className={`btn btn-sm ${has ? "btn-primary" : ""}`}
                      style={{ gap: 6, cursor: "pointer" }}
                    >
                      <input
                        type="checkbox"
                        checked={has}
                        onChange={() => toggleShift(s.id)}
                        style={{ accentColor: "var(--primary)" }}
                      />
                      <span className="mono">{s.code}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="row-end" style={{ marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}
