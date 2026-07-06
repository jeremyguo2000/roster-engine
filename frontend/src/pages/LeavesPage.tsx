import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Leave,
  Staff,
  createLeave,
  deleteLeave,
  listLeaves,
  listStaff,
} from "../api/staff";
import { Shift, listShifts } from "../api/shifts";
import { errorMessage } from "../api/client";
import Modal from "../components/Modal";
import { useToast } from "../components/Toast";
import { dateRange } from "../lib/calendar";

export default function LeavesPage() {
  const [from_date, setFromDate] = useState("");
  const [to_date, setToDate] = useState("");
  const [staffFilter, setStaffFilter] = useState<number | "all">("all");
  const [addOpen, setAddOpen] = useState(false);

  const staffQ = useQuery({
    queryKey: ["staff", "list", { include_deleted: false }],
    queryFn: () => listStaff({ include_deleted: false }),
  });
  const staffList = staffQ.data ?? [];

  const shiftsQ = useQuery({ queryKey: ["shifts", "list"], queryFn: () => listShifts() });
  const leaveShifts = useMemo(
    () => (shiftsQ.data ?? []).filter((s) => s.group.code === "Leaves"),
    [shiftsQ.data],
  );

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
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Leaves</h1>
          <p className="page-sub">Approved leave by staff and date.</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setAddOpen(true)}
          disabled={staffList.length === 0 || leaveShifts.length === 0}
          title={
            staffList.length === 0
              ? "Add a staff member first"
              : leaveShifts.length === 0
              ? "Add at least one shift to the 'Leaves' shift group first"
              : ""
          }
        >
          + Add Leave
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
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
                <LeaveRow
                  key={leave.id}
                  leave={leave}
                  staffName={staffMap.get(leave.staff_id)?.full_name ?? `#${leave.staff_id}`}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && (
        <AddLeaveModal
          staffList={staffList}
          leaveShifts={leaveShifts}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────

function AddLeaveModal({
  staffList,
  leaveShifts,
  onClose,
}: {
  staffList: Staff[];
  leaveShifts: Shift[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    staff_id: staffList[0]?.id ?? 0,
    from_date: "",
    to_date: "",
    shift_code: leaveShifts[0]?.code ?? "",
    note: "",
  });

  const rangeInvalid =
    form.from_date !== "" && form.to_date !== "" && form.from_date > form.to_date;

  const mut = useMutation({
    mutationFn: async () => {
      const dates = dateRange(form.from_date, form.to_date);
      if (dates.length === 0) throw new Error("Invalid date range");
      await Promise.all(
        dates.map((d) =>
          createLeave({
            staff_id: form.staff_id,
            date: d,
            shift_code: form.shift_code,
            note: form.note || null,
          }),
        ),
      );
      return dates.length;
    },
    onSuccess: (n) => {
      toast(n === 1 ? "Leave added" : `${n} leaves added`, "success");
      qc.invalidateQueries({ queryKey: ["leaves"] });
      onClose();
    },
    onError: (e) => toast(errorMessage(e, "Add failed"), "error"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (rangeInvalid) return;
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
            <label className="label">From</label>
            <input
              type="date"
              className="input"
              style={{ width: "100%" }}
              value={form.from_date}
              onChange={(e) =>
                setForm({
                  ...form,
                  from_date: e.target.value,
                  to_date: form.to_date === "" ? e.target.value : form.to_date,
                })
              }
              required
            />
          </div>
          <div className="field">
            <label className="label">To</label>
            <input
              type="date"
              className="input"
              style={{ width: "100%" }}
              value={form.to_date}
              min={form.from_date || undefined}
              onChange={(e) => setForm({ ...form, to_date: e.target.value })}
              required
            />
            {rangeInvalid && <span className="field-error">End date must be on or after start date.</span>}
          </div>
        </div>
        <div className="field">
          <label className="label">Type of leave</label>
          <select
            className="select"
            value={form.shift_code}
            onChange={(e) => setForm({ ...form, shift_code: e.target.value })}
            required
          >
            {leaveShifts.map((s) => (
              <option key={s.id} value={s.code}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">Note</label>
          <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Optional" />
        </div>
        <div className="row-end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={mut.isPending || rangeInvalid || !form.shift_code}
          >
            {mut.isPending ? "Adding…" : "Add Leave"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
