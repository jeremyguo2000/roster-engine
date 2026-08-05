import { useState } from "react";

import type { RosterViolation } from "../api/rosters";

/**
 * Result of the post-solve audit (backend/solver/validate.py), which re-checks a
 * solved roster against the rules the solver is meant to enforce.
 *
 * Three states, deliberately distinguished:
 *  - undefined — solved before the validator existed; we don't know either way,
 *                so claim nothing rather than imply a clean bill of health
 *  - []        — audited and clean
 *  - [..]      — audited and something is wrong. Worth surfacing loudly: it means
 *                the solver returned a roster that breaks its own rules.
 */
export default function RosterViolations({
  violations,
}: {
  violations?: RosterViolation[];
}) {
  const [open, setOpen] = useState(true);

  if (violations === undefined) return null;

  if (violations.length === 0) {
    return (
      <div className="violations-clean">
        ✓ Rule check passed — no violations found in this roster.
      </div>
    );
  }

  // Group by rule so a systemic breach reads as one problem, not N separate rows.
  const byRule = new Map<string, RosterViolation[]>();
  for (const v of violations) {
    const list = byRule.get(v.rule) ?? [];
    list.push(v);
    byRule.set(v.rule, list);
  }

  return (
    <div className="violations-panel">
      <button
        className="violations-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>
          ⚠ {violations.length} rule violation{violations.length === 1 ? "" : "s"} found
        </span>
        <span className="violations-chevron">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="violations-body">
          <p className="muted violations-intro">
            This roster was checked against the scheduling rules after solving and
            these breaches were found. Treat it as unsafe to approve until they are
            understood.
          </p>
          {[...byRule.entries()].map(([rule, items]) => (
            <div key={rule} className="violations-group">
              <div className="violations-rule">
                {rule}
                <span className="muted violations-count">
                  {items.length} issue{items.length === 1 ? "" : "s"}
                </span>
              </div>
              <ul className="violations-list">
                {items.map((v, i) => (
                  <li key={i}>{v.message}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
