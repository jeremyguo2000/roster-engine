import { useMemo, useState } from "react";

import { Roster } from "../api/rosters";
import { buildDayStatusMap, monthMatrix } from "../lib/calendar";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Props {
  rosters: Roster[];
  /** When user has confirmed a single-date selection, this fires with that date. */
  onSelectDay?: (date: string) => void;
  /** When user has confirmed a range selection, this fires with {from, to}. */
  onSelectRange?: (from: string, to: string) => void;
  /** "rostered" (default) only allows clicking approved/draft days; "all" allows any day. */
  selectableDays?: "rostered" | "all";
  /** Action button label when one day is selected. */
  dayActionLabel?: string;
  /** Action button label when a range is selected. */
  rangeActionLabel?: string;
  /** Override the hint text under the header. */
  hint?: string;
}

const DEFAULT_HINT =
  "Click an approved or draft date to start a selection. Click a second date to extend it. Click a third to reset.";

export default function Calendar({
  rosters,
  onSelectDay,
  onSelectRange,
  selectableDays = "rostered",
  dayActionLabel = "View day timetable",
  rangeActionLabel = "View range timetable",
  hint = DEFAULT_HINT,
}: Props) {
  const today = new Date();
  const latestApproved = useMemo(
    () =>
      [...rosters]
        .filter((r) => r.status === "approved")
        .sort((a, b) => b.roster_start.localeCompare(a.roster_start))[0],
    [rosters],
  );
  const initial = latestApproved
    ? (() => {
        const [y, m] = latestApproved.roster_start.split("-").map(Number);
        return { year: y, month: m };
      })()
    : { year: today.getFullYear(), month: today.getMonth() + 1 };

  const [{ year, month }, setMonth] = useState(initial);
  const [selStart, setSelStart] = useState<string | null>(null);
  const [selEnd, setSelEnd] = useState<string | null>(null);

  const dayStatus = useMemo(() => buildDayStatusMap(rosters), [rosters]);
  const cells = useMemo(() => monthMatrix(year, month), [year, month]);

  const changeMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m > 12) { m = 1; y++; }
    if (m < 1)  { m = 12; y--; }
    setMonth({ year: y, month: m });
  };

  function handleClick(ds: string) {
    if (!selStart) {
      setSelStart(ds);
      setSelEnd(null);
    } else if (selStart && !selEnd) {
      if (ds === selStart) {
        // Re-clicking the start without a range: clear
        setSelStart(null);
      } else {
        setSelEnd(ds);
      }
    } else {
      // Third click — reset to the new date
      setSelStart(ds);
      setSelEnd(null);
    }
  }

  function clearSelection() {
    setSelStart(null);
    setSelEnd(null);
  }

  function isInSelection(ds: string): boolean {
    if (!selStart) return false;
    const a = selStart;
    const b = selEnd ?? selStart;
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    return ds >= lo && ds <= hi;
  }

  const [from, to] = selStart
    ? (() => {
        const a = selStart;
        const b = selEnd ?? selStart;
        return a <= b ? [a, b] : [b, a];
      })()
    : [null, null];

  return (
    <div className="card">
      <div className="card-header-row" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 12 }}>
          <button className="icon-btn" onClick={() => changeMonth(-1)} aria-label="Previous month">‹</button>
          <span style={{ fontSize: "var(--fs-lg)", fontWeight: 500, minWidth: 130, textAlign: "center" }}>
            {MONTHS[month - 1]} {year}
          </span>
          <button className="icon-btn" onClick={() => changeMonth(1)} aria-label="Next month">›</button>
        </div>
        <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
          <Legend dot="approved" label="Approved" />
          <Legend dot="draft" label="Draft" />
          <Legend dot="none" label="No roster" />
          {selStart && (
            <div className="row" style={{ gap: 8 }}>
              <span className="muted" style={{ fontSize: "var(--fs-sm)" }}>
                {selEnd && selStart !== selEnd ? `${from} → ${to}` : `Selected ${from}`}
              </span>
              {selEnd && from && to && from !== to ? (
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => {
                    onSelectRange?.(from, to);
                    clearSelection();
                  }}
                >
                  {rangeActionLabel}
                </button>
              ) : (
                from && (
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => {
                      onSelectDay?.(from);
                      clearSelection();
                    }}
                  >
                    {dayActionLabel}
                  </button>
                )
              )}
              <button className="btn btn-sm" onClick={clearSelection}>✕ Clear</button>
            </div>
          )}
        </div>
      </div>

      <p className="muted" style={{ fontSize: "var(--fs-xs)", marginBottom: 12 }}>
        {hint}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 4,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            style={{
              padding: "6px 8px",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--muted)",
              fontWeight: 500,
              textAlign: "center",
            }}
          >
            {d}
          </div>
        ))}
        {cells.map((ds, i) =>
          ds === null ? (
            <div key={`pad-${i}`} />
          ) : (
            <CalCell
              key={ds}
              ds={ds}
              status={dayStatus.get(ds)?.status ?? "none"}
              count={dayStatus.get(ds)?.rosters.length ?? 0}
              selectable={selectableDays === "all" || (dayStatus.get(ds)?.status ?? "none") !== "none"}
              selected={isInSelection(ds)}
              isEndpoint={ds === selStart || ds === selEnd}
              onClick={() => {
                const status = dayStatus.get(ds)?.status ?? "none";
                if (selectableDays === "rostered" && status === "none") return;
                handleClick(ds);
              }}
            />
          ),
        )}
      </div>
    </div>
  );
}

function CalCell({
  ds,
  status,
  count,
  selectable,
  selected,
  isEndpoint,
  onClick,
}: {
  ds: string;
  status: "approved" | "draft" | "none";
  count: number;
  selectable: boolean;
  selected: boolean;
  isEndpoint: boolean;
  onClick: () => void;
}) {
  const day = Number(ds.slice(8));

  const bg =
    status === "approved" ? "var(--status-approved-bg)"
    : status === "draft" ? "var(--status-draft-bg)"
    : "var(--surface)";
  const ink =
    status === "approved" ? "var(--status-approved-ink)"
    : status === "draft" ? "var(--status-draft-ink)"
    : "var(--muted)";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!selectable}
      title={count > 1 ? `${count} rosters cover ${ds}` : ds}
      style={{
        minHeight: 56,
        padding: "8px 6px",
        background: bg,
        color: ink,
        border: isEndpoint
          ? `2px solid var(--primary)`
          : selected
          ? `1px solid var(--primary)`
          : `1px solid var(--border)`,
        borderRadius: 6,
        cursor: selectable ? "pointer" : "default",
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        outline: selected && !isEndpoint ? `2px solid var(--primary-soft)` : "none",
      }}
    >
      <span className="mono" style={{ fontWeight: 600 }}>{String(day).padStart(2, "0")}</span>
      {count > 1 && (
        <span style={{ fontSize: 10, opacity: 0.85 }}>×{count}</span>
      )}
    </button>
  );
}

function Legend({ dot, label }: { dot: "approved" | "draft" | "none"; label: string }) {
  const bg =
    dot === "approved" ? "var(--status-approved-bg)" :
    dot === "draft" ? "var(--status-draft-bg)" :
    "var(--surface)";
  const border = dot === "none" ? "var(--border-strong)" : "transparent";
  return (
    <div className="row" style={{ gap: 6 }}>
      <span
        style={{
          display: "inline-block",
          width: 14,
          height: 14,
          background: bg,
          border: `1px solid ${border}`,
          borderRadius: 3,
        }}
      />
      <span style={{ fontSize: "var(--fs-sm)" }}>{label}</span>
    </div>
  );
}
