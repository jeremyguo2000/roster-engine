import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Profile, addProfileShift, addProfileShiftGroup, listProfileShifts, removeProfileShift } from "../../api/profiles";
import { listShiftGroups, listShifts } from "../../api/shifts";
import { errorMessage } from "../../api/client";
import { useToast } from "../Toast";

export default function ProfileShiftsTab({ profile }: { profile: Profile }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const selectedQ = useQuery({
    queryKey: ["profile", profile.id, "shifts"],
    queryFn: () => listProfileShifts(profile.id),
  });
  const groupsQ = useQuery({ queryKey: ["shifts", "groups"], queryFn: listShiftGroups });
  const shiftsQ = useQuery({ queryKey: ["shifts", "list"], queryFn: () => listShifts() });

  const selected = new Set((selectedQ.data ?? []).map((s) => s.shift_id));

  const addOne = useMutation({
    mutationFn: (shift_id: number) => addProfileShift(profile.id, shift_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile", profile.id, "shifts"] }),
    onError: (e) => toast(errorMessage(e, "Add failed"), "error"),
  });
  const removeOne = useMutation({
    mutationFn: (shift_id: number) => removeProfileShift(profile.id, shift_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile", profile.id, "shifts"] }),
    onError: (e) => toast(errorMessage(e, "Remove failed"), "error"),
  });
  const addGroup = useMutation({
    mutationFn: (group_id: number) => addProfileShiftGroup(profile.id, group_id),
    onSuccess: () => {
      toast("Group added", "success");
      qc.invalidateQueries({ queryKey: ["profile", profile.id, "shifts"] });
    },
    onError: (e) => toast(errorMessage(e, "Add group failed"), "error"),
  });

  return (
    <div className="stack">
      <p className="muted" style={{ fontSize: "var(--fs-sm)" }}>
        Shifts the solver can assign to staff. Add an entire group or pick individual shifts.
      </p>
      {groupsQ.data?.map((g) => {
        const groupShifts = (shiftsQ.data ?? []).filter((s) => s.group_id === g.id);
        if (groupShifts.length === 0) return null;
        const groupAllIn = groupShifts.every((s) => selected.has(s.id));
        return (
          <div key={g.id} className="card" style={{ padding: 16 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <span className="mono" style={{ fontWeight: 600 }}>{g.code}</span>
              <button
                className="btn btn-sm"
                onClick={() => addGroup.mutate(g.id)}
                disabled={groupAllIn || addGroup.isPending}
                title={groupAllIn ? "All shifts already included" : "Bulk-add every shift in this group"}
              >
                + Bulk add
              </button>
            </div>
            <div className="row" style={{ flexWrap: "wrap" }}>
              {groupShifts.map((s) => {
                const has = selected.has(s.id);
                return (
                  <button
                    key={s.id}
                    className={`btn btn-sm ${has ? "btn-primary" : ""}`}
                    onClick={() => (has ? removeOne.mutate(s.id) : addOne.mutate(s.id))}
                    disabled={addOne.isPending || removeOne.isPending}
                  >
                    <span className="mono">{s.code}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
