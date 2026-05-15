import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Profile, ProfileConfig, updateProfile } from "../../api/profiles";
import { errorMessage } from "../../api/client";
import { useToast } from "../Toast";

interface WeightForm {
  weight_overstaff: string;
  weight_consec: string;
  weight_burden: string;
  weight_night: string;
  weight_weekend: string;
  time_limit: string;
}

function toForm(cfg: ProfileConfig): WeightForm {
  return {
    weight_overstaff: String(cfg.weight_overstaff ?? 20),
    weight_consec: String(cfg.weight_consec ?? 100),
    weight_burden: String(cfg.weight_burden ?? 10),
    weight_night: String(cfg.weight_night ?? 2),
    weight_weekend: String(cfg.weight_weekend ?? 1),
    time_limit: String(cfg.time_limit ?? 600),
  };
}

export default function ProfileSolverTab({ profile }: { profile: Profile }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<WeightForm>(() => toForm(profile.config));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setForm(toForm(profile.config));
    setDirty(false);
  }, [profile.id, profile.config]);

  const mut = useMutation({
    mutationFn: () => {
      const next: ProfileConfig = {
        ...profile.config,
        weight_overstaff: numOrZero(form.weight_overstaff),
        weight_consec: numOrZero(form.weight_consec),
        weight_burden: numOrZero(form.weight_burden),
        weight_night: numOrZero(form.weight_night),
        weight_weekend: numOrZero(form.weight_weekend),
        time_limit: numOrZero(form.time_limit),
      };
      return updateProfile(profile.id, { config: next });
    },
    onSuccess: () => {
      toast("Solver config saved", "success");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["profiles"] });
    },
    onError: (e) => toast(errorMessage(e, "Save failed"), "error"),
  });

  function field(key: keyof WeightForm, label: string, hint?: string) {
    return (
      <div className="field">
        <label className="label">{label}</label>
        <input
          className="input mono"
          type="number"
          value={form[key]}
          onChange={(e) => {
            setForm({ ...form, [key]: e.target.value });
            setDirty(true);
          }}
        />
        {hint && <span className="field-hint">{hint}</span>}
      </div>
    );
  }

  return (
    <div className="stack">
      <p className="muted" style={{ fontSize: "var(--fs-sm)" }}>
        Weights in the solver objective. Higher = more aggressive optimisation against that signal.
      </p>
      <div className="grid-3">
        {field("weight_overstaff", "Overstaff weight", "Penalty per surplus headcount per slot")}
        {field("weight_consec", "Consecutive-days weight", "Penalty on max consecutive working days")}
        {field("weight_burden", "Burden weight", "Combines night + weekend per-staff burden")}
      </div>
      <div className="grid-3">
        {field("weight_night", "Night sub-weight", "Inside the burden score")}
        {field("weight_weekend", "Weekend sub-weight", "Inside the burden score")}
        {field("time_limit", "Time limit (s)", "CP-SAT wall-clock cap")}
      </div>
      <div className="row-end" style={{ marginTop: 16 }}>
        <button
          className="btn btn-primary"
          onClick={() => mut.mutate()}
          disabled={!dirty || mut.isPending}
        >
          {mut.isPending ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </button>
      </div>
    </div>
  );
}

function numOrZero(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
