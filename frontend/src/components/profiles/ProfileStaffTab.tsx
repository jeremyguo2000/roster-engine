import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Profile,
  addProfileStaff,
  addProfileStaffGroup,
  listProfileStaff,
  removeProfileStaff,
  updateProfileStaff,
} from "../../api/profiles";
import { listStaff, listStaffGroups } from "../../api/staff";
import { errorMessage } from "../../api/client";
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
          <div key={g.id} className="card" style={{ padding: 16 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontWeight: 500 }}>{g.name}</span>
              <button
                className="btn btn-sm"
                onClick={() => addGroup.mutate(g.id)}
                disabled={allIn || addGroup.isPending}
                title={allIn ? "All staff already included" : "Bulk-add every staff in this group"}
              >
                + Bulk add
              </button>
            </div>
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
                {inGroup.map((s) => {
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
                            onClick={() => add.mutate(s.id)}
                            disabled={add.isPending}
                          >
                            Add
                          </button>
                        ) : (
                          <>
                            <button
                              className="btn btn-sm"
                              onClick={() =>
                                toggleExcluded.mutate({
                                  staff_id: s.id,
                                  excluded: !sel.excluded,
                                })
                              }
                              disabled={toggleExcluded.isPending}
                            >
                              {sel.excluded ? "Re-include" : "Exclude"}
                            </button>
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => remove.mutate(s.id)}
                              disabled={remove.isPending}
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
        );
      })}
    </div>
  );
}
