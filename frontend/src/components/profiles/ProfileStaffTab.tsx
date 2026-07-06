import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Profile,
  ProfileStaffEntry,
  addProfileStaff,
  addProfileStaffGroup,
  listProfileStaff,
  removeProfileStaff,
  removeProfileStaffGroup,
  updateProfileStaff,
} from "../../api/profiles";
import { Staff, StaffGroup, listStaff, listStaffGroups } from "../../api/staff";
import { errorMessage } from "../../api/client";
import { useCollapsed } from "../../lib/useCollapsed";
import { useToast } from "../Toast";

export default function ProfileStaffTab({ profile }: { profile: Profile }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const selectedQ = useQuery({
    queryKey: ["profile", profile.id, "staff"],
    queryFn: () => listProfileStaff(profile.id),
  });
  const allStaffQ = useQuery({
    queryKey: ["staff", "list", { include_deleted: false }],
    queryFn: () => listStaff(),
  });
  const groupsQ = useQuery({ queryKey: ["staff", "groups"], queryFn: listStaffGroups });

  const selectedMap = new Map((selectedQ.data ?? []).map((s) => [s.staff_id, s]));

  const add = useMutation({
    mutationFn: (staff_id: number) => addProfileStaff(profile.id, staff_id, false),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile", profile.id, "staff"] }),
    onError: (e) => toast(errorMessage(e, "Add failed"), "error"),
  });
  const remove = useMutation({
    mutationFn: (staff_id: number) => removeProfileStaff(profile.id, staff_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile", profile.id, "staff"] }),
    onError: (e) => toast(errorMessage(e, "Remove failed"), "error"),
  });
  const toggleExcluded = useMutation({
    mutationFn: ({ staff_id, excluded }: { staff_id: number; excluded: boolean }) =>
      updateProfileStaff(profile.id, staff_id, excluded),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile", profile.id, "staff"] }),
    onError: (e) => toast(errorMessage(e, "Update failed"), "error"),
  });
  const addGroup = useMutation({
    mutationFn: (group_id: number) => addProfileStaffGroup(profile.id, group_id),
    onSuccess: () => {
      toast("Group added", "success");
      qc.invalidateQueries({ queryKey: ["profile", profile.id, "staff"] });
    },
    onError: (e) => toast(errorMessage(e, "Add group failed"), "error"),
  });
  const removeGroup = useMutation({
    mutationFn: (group_id: number) => removeProfileStaffGroup(profile.id, group_id),
    onSuccess: (res) => {
      toast(`Removed ${res.removed} staff`, "success");
      qc.invalidateQueries({ queryKey: ["profile", profile.id, "staff"] });
    },
    onError: (e) => toast(errorMessage(e, "Remove group failed"), "error"),
  });

  return (
    <div className="stack">
      <p className="muted" style={{ fontSize: "var(--fs-sm)" }}>
        Staff eligible for this profile. Use <strong>Bulk add</strong> for a whole group, or toggle individuals.
        Excluded staff stay attached but are skipped by the solver — useful for temporary leave.
      </p>

      {(groupsQ.data ?? []).map((g) => {
        const inGroup = (allStaffQ.data ?? []).filter((s) => s.staff_group_id === g.id);
        if (inGroup.length === 0) return null;
        const allIn = inGroup.every((s) => selectedMap.has(s.id));
        return (
          <StaffGroupRow
            key={g.id}
            profileId={profile.id}
            group={g}
            staff={inGroup}
            selectedMap={selectedMap}
            allIn={allIn}
            onAddGroup={() => addGroup.mutate(g.id)}
            onRemoveGroup={() => {
              if (confirm(`Remove all staff in ${g.name} from this profile?`)) {
                removeGroup.mutate(g.id);
              }
            }}
            onAdd={(id) => add.mutate(id)}
            onRemove={(id) => remove.mutate(id)}
            onToggleExcluded={(staff_id, excluded) =>
              toggleExcluded.mutate({ staff_id, excluded })
            }
            addPending={add.isPending}
            removePending={remove.isPending}
            togglePending={toggleExcluded.isPending}
            addGroupPending={addGroup.isPending}
            removeGroupPending={removeGroup.isPending}
          />
        );
      })}
    </div>
  );
}

function StaffGroupRow({
  profileId,
  group,
  staff,
  selectedMap,
  allIn,
  onAddGroup,
  onRemoveGroup,
  onAdd,
  onRemove,
  onToggleExcluded,
  addPending,
  removePending,
  togglePending,
  addGroupPending,
  removeGroupPending,
}: {
  profileId: number;
  group: StaffGroup;
  staff: Staff[];
  selectedMap: Map<number, ProfileStaffEntry>;
  allIn: boolean;
  onAddGroup: () => void;
  onRemoveGroup: () => void;
  onAdd: (id: number) => void;
  onRemove: (id: number) => void;
  onToggleExcluded: (staff_id: number, excluded: boolean) => void;
  addPending: boolean;
  removePending: boolean;
  togglePending: boolean;
  addGroupPending: boolean;
  removeGroupPending: boolean;
}) {
  const [collapsed, setCollapsed] = useCollapsed(
    `roster-engine.collapsed.profile-staff.${profileId}.${group.id}`,
  );
  const bodyId = `profile-staff-body-${profileId}-${group.id}`;
  const activeCount = staff.filter((s) => {
    const sel = selectedMap.get(s.id);
    return sel && !sel.excluded;
  }).length;
  const inProfileCount = staff.filter((s) => selectedMap.has(s.id)).length;

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
          <span style={{ fontWeight: 500 }}>{group.name}</span>
          <span className="muted" style={{ fontSize: "var(--fs-sm)" }}>
            ({activeCount}/{staff.length})
          </span>
        </button>
        <div className="row" style={{ gap: 4 }}>
          <button
            className="btn btn-sm btn-primary"
            onClick={onAddGroup}
            disabled={allIn || addGroupPending}
            title={allIn ? "All staff already included" : "Bulk-add every staff in this group"}
          >
            + Bulk add
          </button>
          <button
            className="btn btn-sm btn-danger"
            onClick={onRemoveGroup}
            disabled={inProfileCount === 0 || removeGroupPending}
            title={
              inProfileCount === 0
                ? "No staff from this group in the profile"
                : "Bulk-remove every staff in this group"
            }
          >
            {removeGroupPending ? "Removing…" : "Bulk remove"}
          </button>
        </div>
      </div>
      {!collapsed && (
        <div id={bodyId} role="region">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Name</th>
                <th>State</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => {
                const sel = selectedMap.get(s.id);
                return (
                  <tr key={s.id}>
                    <td className="mono">{s.employee_id}</td>
                    <td>{s.full_name}</td>
                    <td>
                      {!sel && <span className="badge badge-draft">Not in profile</span>}
                      {sel?.excluded && <span className="badge badge-failed">Excluded</span>}
                      {sel && !sel.excluded && <span className="badge badge-approved">Active</span>}
                    </td>
                    <td className="row-end">
                      {!sel ? (
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => onAdd(s.id)}
                          disabled={addPending}
                        >
                          Add
                        </button>
                      ) : (
                        <>
                          <button
                            className="btn btn-sm"
                            onClick={() => onToggleExcluded(s.id, !sel.excluded)}
                            disabled={togglePending}
                          >
                            {sel.excluded ? "Re-include" : "Exclude"}
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => onRemove(s.id)}
                            disabled={removePending}
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
