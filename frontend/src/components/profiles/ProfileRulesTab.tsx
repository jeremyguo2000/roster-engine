import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ConditionalConstraint, Profile, updateProfile } from "../../api/profiles";
import { listShiftGroups } from "../../api/shifts";
import { errorMessage } from "../../api/client";
import { useToast } from "../Toast";

const STAR = "*";

export default function ProfileRulesTab({ profile }: { profile: Profile }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const groupsQ = useQuery({ queryKey: ["shifts", "groups"], queryFn: listShiftGroups });

  const [rules, setRules] = useState<ConditionalConstraint[]>(
    () => profile.config.conditional_constraints ?? [],
  );
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setRules(profile.config.conditional_constraints ?? []);
    setDirty(false);
  }, [profile.id, profile.config]);

  function update(i: number, patch: Partial<ConditionalConstraint>) {
    setRules((cur) => cur.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setDirty(true);
  }
  function remove(i: number) {
    setRules((cur) => cur.filter((_, idx) => idx !== i));
    setDirty(true);
  }
  function add() {
    setRules((cur) => [
      ...cur,
      { trigger: groupsQ.data?.[0]?.code ?? "", trigger_val: 1, offset: 1, enforce: STAR, enforce_val: 0 },
    ]);
    setDirty(true);
  }

  const save = useMutation({
    mutationFn: () =>
      updateProfile(profile.id, {
        config: { ...profile.config, conditional_constraints: rules },
      }),
    onSuccess: () => {
      toast("Rules saved", "success");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["profiles"] });
    },
    onError: (e) => toast(errorMessage(e, "Save failed"), "error"),
  });

  const groupOptions = (groupsQ.data ?? []).map((g) => g.code);

  return (
    <div className="stack">
      <p className="muted" style={{ fontSize: "var(--fs-sm)" }}>
        Conditional constraints. Read as: <em>if staff did <strong>trigger</strong> = trigger_val on day D, then on day D + offset, <strong>enforce</strong> must equal enforce_val</em>. Use <span className="mono">*</span> as a wildcard.
      </p>
      <p className="muted" style={{ fontSize: "var(--fs-xs)" }}>
        Example: <span className="mono">{`{trigger: "NSG", trigger_val: 1, offset: 1, enforce: "*", enforce_val: 0}`}</span> = no shift the day after a night shift.
      </p>

      {rules.length === 0 && <div className="empty-state">No rules yet.</div>}

      {rules.map((r, i) => (
        <div key={i} className="card" style={{ padding: 16 }}>
          <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div className="field" style={{ minWidth: 120 }}>
              <label className="label">Trigger</label>
              <select className="select" value={r.trigger} onChange={(e) => update(i, { trigger: e.target.value })}>
                <option value={STAR}>{STAR} (any)</option>
                {groupOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ width: 90 }}>
              <label className="label">= value</label>
              <input
                className="input mono"
                type="number"
                value={r.trigger_val}
                onChange={(e) => update(i, { trigger_val: parseInt(e.target.value || "0", 10) })}
              />
            </div>
            <div className="field" style={{ width: 90 }}>
              <label className="label">Offset</label>
              <input
                className="input mono"
                type="number"
                value={r.offset}
                onChange={(e) => update(i, { offset: parseInt(e.target.value || "0", 10) })}
              />
            </div>
            <div className="field" style={{ minWidth: 120 }}>
              <label className="label">Enforce</label>
              <select className="select" value={r.enforce} onChange={(e) => update(i, { enforce: e.target.value })}>
                <option value={STAR}>{STAR} (any)</option>
                {groupOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ width: 90 }}>
              <label className="label">= value</label>
              <input
                className="input mono"
                type="number"
                value={r.enforce_val}
                onChange={(e) => update(i, { enforce_val: parseInt(e.target.value || "0", 10) })}
              />
            </div>
            <button className="btn btn-sm btn-danger" onClick={() => remove(i)}>✕</button>
          </div>
        </div>
      ))}

      <div className="row-end" style={{ gap: 8 }}>
        <button className="btn btn-primary" onClick={add}>+ Add Rule</button>
        <button className="btn btn-primary" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
          {save.isPending ? "Saving…" : dirty ? "Save rules" : "Saved"}
        </button>
      </div>
    </div>
  );
}
