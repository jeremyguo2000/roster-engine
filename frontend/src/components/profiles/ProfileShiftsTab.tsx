import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Profile,
  addProfileShift,
  addProfileShiftGroup,
  listProfileShifts,
  removeProfileShift,
  removeProfileShiftGroup,
} from "../../api/profiles";
import { Shift, ShiftGroup, listShiftGroups, listShifts } from "../../api/shifts";
import { errorMessage } from "../../api/client";
import { useCollapsed } from "../../lib/useCollapsed";
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
  const removeGroup = useMutation({
    mutationFn: (group_id: number) => removeProfileShiftGroup(profile.id, group_id),
    onSuccess: (res) => {
      toast(`Removed ${res.removed} shift${res.removed === 1 ? "" : "s"}`, "success");
      qc.invalidateQueries({ queryKey: ["profile", profile.id, "shifts"] });
    },
    onError: (e) => toast(errorMessage(e, "Remove group failed"), "error"),
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
          <ShiftGroupRow
            key={g.id}
            profileId={profile.id}
            group={g}
            groupShifts={groupShifts}
            selected={selected}
            groupAllIn={groupAllIn}
            onAddGroup={() => addGroup.mutate(g.id)}
            onRemoveGroup={() => {
              if (confirm(`Remove all shifts in ${g.code} from this profile?`)) {
                removeGroup.mutate(g.id);
              }
            }}
            onAddOne={(id) => addOne.mutate(id)}
            onRemoveOne={(id) => removeOne.mutate(id)}
            addGroupPending={addGroup.isPending}
            removeGroupPending={removeGroup.isPending}
            mutatingOne={addOne.isPending || removeOne.isPending}
          />
        );
      })}
    </div>
  );
}

function ShiftGroupRow({
  profileId,
  group,
  groupShifts,
  selected,
  groupAllIn,
  onAddGroup,
  onRemoveGroup,
  onAddOne,
  onRemoveOne,
  addGroupPending,
  removeGroupPending,
  mutatingOne,
}: {
  profileId: number;
  group: ShiftGroup;
  groupShifts: Shift[];
  selected: Set<number>;
  groupAllIn: boolean;
  onAddGroup: () => void;
  onRemoveGroup: () => void;
  onAddOne: (id: number) => void;
  onRemoveOne: (id: number) => void;
  addGroupPending: boolean;
  removeGroupPending: boolean;
  mutatingOne: boolean;
}) {
  const [collapsed, setCollapsed] = useCollapsed(
    `roster-engine.collapsed.profile-shifts.${profileId}.${group.id}`,
  );
  const bodyId = `profile-shifts-body-${profileId}-${group.id}`;
  const selectedCount = groupShifts.filter((s) => selected.has(s.id)).length;

  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: collapsed ? 0 : 8 }}>
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
          <span className="mono" style={{ fontWeight: 600 }}>{group.code}</span>
          <span className="muted" style={{ fontSize: "var(--fs-sm)" }}>
            ({selectedCount}/{groupShifts.length})
          </span>
        </button>
        <div className="row" style={{ gap: 4 }}>
          <button
            className="btn btn-sm btn-primary"
            onClick={onAddGroup}
            disabled={groupAllIn || addGroupPending}
            title={groupAllIn ? "All shifts already included" : "Bulk-add every shift in this group"}
          >
            + Bulk add
          </button>
          <button
            className="btn btn-sm btn-danger"
            onClick={onRemoveGroup}
            disabled={selectedCount === 0 || removeGroupPending}
            title={
              selectedCount === 0
                ? "No shifts from this group in the profile"
                : "Bulk-remove every shift in this group"
            }
          >
            {removeGroupPending ? "Removing…" : "Bulk remove"}
          </button>
        </div>
      </div>
      {!collapsed && (
        <div id={bodyId} role="region" className="row" style={{ flexWrap: "wrap" }}>
          {groupShifts.map((s) => {
            const has = selected.has(s.id);
            return (
              <button
                key={s.id}
                className={`btn btn-sm ${has ? "btn-primary" : ""}`}
                onClick={() => (has ? onRemoveOne(s.id) : onAddOne(s.id))}
                disabled={mutatingOne}
              >
                <span className="mono">{s.code}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
