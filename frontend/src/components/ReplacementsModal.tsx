import { useQuery } from "@tanstack/react-query";

import { getReplacements, type ReplacementCandidate } from "../api/rosters";
import { errorMessage } from "../api/client";
import Modal from "./Modal";

/**
 * "Sarah just called in sick — now what?"
 *
 * Ranks the staff who could cover one absent shift. The answer comes from the
 * already-solved roster (backend/solver/swaps.py), so it arrives immediately
 * rather than re-running the solver and reshuffling a published schedule.
 *
 * Nothing here changes the roster: it tells the ward manager who to phone.
 */
export default function ReplacementsModal({
  rosterId,
  employeeId,
  fullname,
  date,
  onClose,
}: {
  rosterId: number;
  employeeId: string;
  fullname: string;
  date: string;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ["rosters", rosterId, "replacements", employeeId, date],
    queryFn: () => getReplacements(rosterId, employeeId, date),
  });

  const data = q.data;

  return (
    <Modal open onClose={onClose} size="wide-md" title={`Cover for ${fullname} — ${date}`}>
      {q.isLoading && <div className="empty-state">Finding cover…</div>}
      {q.isError && <div className="empty-state">{errorMessage(q.error)}</div>}

      {data && (
        <div className="cover">
          <p className="muted cover-intro">
            {data.shift ? (
              <>
                {fullname} is rostered <strong>{data.shift.code}</strong> ({data.shift.name}) on{" "}
                {data.date}. These are the staff who could take it — ranked by who it
                disrupts least. Nothing is changed until you act on it.
              </>
            ) : (
              data.message
            )}
          </p>

          {data.gaps.length > 0 && (
            <section className="cover-section">
              <h4 className="cover-heading">What goes short without cover</h4>
              <ul className="cover-gaps">
                {data.gaps.map((g, i) => (
                  <li key={i}>
                    {g.description}
                    {g.short_by > 1 && <span className="muted"> — short by {g.short_by}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.shift && data.gaps.length === 0 && (
            <p className="cover-ok">
              ✓ Coverage still holds without a replacement — every demand is still met.
            </p>
          )}

          {data.candidates.length > 0 && (
            <section className="cover-section">
              <h4 className="cover-heading">
                Who can cover <span className="muted">({data.candidates.length})</span>
              </h4>
              <ol className="cover-list">
                {data.candidates.map((c) => (
                  <CandidateRow key={c.employee_id} candidate={c} />
                ))}
              </ol>
            </section>
          )}

          {data.shift && data.candidates.length === 0 && (
            <p className="cover-none">{data.message ?? "No one is free to cover this shift."}</p>
          )}

          {Object.keys(data.excluded).length > 0 && (
            <p className="muted cover-excluded">
              Ruled out:{" "}
              {Object.entries(data.excluded)
                .map(([reason, n]) => `${n} ${reason}`)
                .join(" · ")}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

function CandidateRow({ candidate: c }: { candidate: ReplacementCandidate }) {
  return (
    <li className={c.covers_gaps ? "cover-cand" : "cover-cand cover-cand-partial"}>
      <div className="cover-cand-head">
        <span className="cover-cand-name">{c.fullname}</span>
        <span className="mono muted cover-cand-id">{c.employee_id}</span>
        {!c.covers_gaps && <span className="cover-tag cover-tag-warn">misses a skill</span>}
      </div>
      <div className="cover-cand-stats muted">
        {c.consec_run} consecutive day{c.consec_run === 1 ? "" : "s"} · {c.nights} night
        {c.nights === 1 ? "" : "s"} · {c.weekends} weekend{c.weekends === 1 ? "" : "s"} so far
      </div>
      {c.notes.length > 0 && (
        <ul className="cover-cand-notes">
          {c.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </li>
  );
}
