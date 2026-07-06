import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Staff,
  addStaffSkill,
  getStaffSkills,
  removeStaffSkill,
} from "../../api/staff";
import { listSkillTypes } from "../../api/skills";
import { errorMessage } from "../../api/client";
import Modal from "../Modal";
import { useToast } from "../Toast";

export default function StaffSkillsModal({
  staff,
  onClose,
}: {
  staff: Staff;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const skillsQ = useQuery({
    queryKey: ["staff", staff.id, "skills"],
    queryFn: () => getStaffSkills(staff.id),
  });
  const typesQ = useQuery({ queryKey: ["skills", "types"], queryFn: listSkillTypes });

  const add = useMutation({
    mutationFn: (skill_value_id: number) => addStaffSkill(staff.id, skill_value_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff", staff.id, "skills"] });
    },
    onError: (e) => toast(errorMessage(e, "Add failed"), "error"),
  });
  const remove = useMutation({
    mutationFn: (skill_value_id: number) => removeStaffSkill(staff.id, skill_value_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff", staff.id, "skills"] });
    },
    onError: (e) => toast(errorMessage(e, "Remove failed"), "error"),
  });

  const have = new Set((skillsQ.data ?? []).map((s) => s.skill_value_id));

  return (
    <Modal open onClose={onClose} title={`Skills — ${staff.full_name}`} size="wide-md">
      <p className="muted" style={{ marginBottom: 16, fontSize: "var(--fs-sm)" }}>
        Skills assigned to this staff member. Click a value to add or remove.
      </p>
      {(skillsQ.data?.length ?? 0) > 0 && (
        <div className="card" style={{ background: "var(--bg)", marginBottom: 16 }}>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {skillsQ.data!.map((s) => (
              <span key={s.skill_value_id} className="badge badge-approved" style={{ padding: "4px 10px" }}>
                {s.skill_type}: {s.value}
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ marginLeft: 6, padding: "0 4px", height: 18 }}
                  onClick={() => remove.mutate(s.skill_value_id)}
                  aria-label="Remove skill"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {typesQ.data?.length === 0 && (
        <div className="empty-state">
          No skill types defined yet. Create one in the Skill Types section.
        </div>
      )}

      <div className="stack">
        {typesQ.data?.map((t) => (
          <div key={t.id} className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>
              {t.name}
              {t.description && (
                <span className="muted" style={{ fontSize: "var(--fs-sm)", marginLeft: 8 }}>
                  — {t.description}
                </span>
              )}
            </div>
            <div className="row" style={{ flexWrap: "wrap" }}>
              {t.values.length === 0 ? (
                <span className="muted" style={{ fontSize: "var(--fs-sm)" }}>No values defined.</span>
              ) : (
                t.values.map((v) => {
                  const has = have.has(v.id);
                  return (
                    <button
                      key={v.id}
                      className={`btn btn-sm ${has ? "btn-primary" : ""}`}
                      disabled={add.isPending || remove.isPending}
                      onClick={() => (has ? remove.mutate(v.id) : add.mutate(v.id))}
                    >
                      {v.value}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="row-end" style={{ marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}
