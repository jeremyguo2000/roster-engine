import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RosterResult, RosterShiftInfo } from "../api/rosters";
import { listShiftGroups } from "../api/shifts";
import { groupColour, groupColourFor } from "../lib/colours";
import { minToHHMM } from "../lib/time";

const WD = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

function addDays(iso: string, n: number): Date {
  const [y, m, d] = iso.split("-").map(Number);
  const out = new Date(y, m - 1, d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Local-date ISO string. toISOString() would shift the date in any timezone behind UTC. */
function isoDate(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * The shift codes this roster actually uses, ordered by group then start time.
 *
 * Read off the assignments rather than result.shifts: the latter is every shift
 * the profile permits, so it lists codes nobody was given. A legend of codes
 * that aren't on screen is noise.
 */
function shiftsInUse(result: RosterResult): [string, RosterShiftInfo][] {
  const used = new Set<string>();
  for (const byDay of Object.values(result.assignments)) {
    for (const code of Object.values(byDay)) used.add(code);
  }
  return [...used]
    .filter((code) => result.shifts[code])
    .map((code) => [code, result.shifts[code]] as [string, RosterShiftInfo])
    .sort(
      ([, a], [, b]) => a.group.localeCompare(b.group) || a.start_time - b.start_time,
    );
}

/**
 * What "D0811" means, without having to hover a cell.
 *
 * The per-cell title attribute already carries this, but a tooltip is no use
 * when the grid is on a projector or being read at a glance — the codes are
 * the whole content of the table and nothing on screen decodes them.
 */
function ShiftLegend({
  result,
  colourOf,
}: {
  result: RosterResult;
  colourOf: (group: string) => string;
}) {
  const entries = shiftsInUse(result);
  if (!entries.length) return null;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "8px 18px",
        marginTop: 14,
        paddingTop: 12,
        borderTop: "1px solid var(--border)",
        fontSize: 11,
      }}
    >
      <span
        style={{
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--muted)",
          fontWeight: 500,
        }}
      >
        Shifts
      </span>
      {entries.map(([code, info]) => {
        const colour = colourOf(info.group);
        // Leave codes carry no clock times (start == end); an "00:00–00:00"
        // would be worse than useless, so they show their name instead.
        const timed = info.start_time !== info.end_time;
        const overnight = timed && info.end_time < info.start_time;
        return (
          <span
            key={code}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            title={info.name}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: colour,
                flex: "0 0 auto",
              }}
            />
            <span className="mono" style={{ color: colour, fontWeight: 500 }}>
              {code}
            </span>
            <span style={{ color: "var(--muted)" }}>
              {timed
                ? `${minToHHMM(info.start_time)}–${minToHHMM(info.end_time)}`
                : info.name}
              {overnight && <span style={{ opacity: 0.7 }}> +1d</span>}
            </span>
          </span>
        );
      })}
    </div>
  );
}

export default function RosterGrid({
  result,
  onAbsence,
}: {
  result: RosterResult;
  /**
   * Called when a worked cell is clicked — the sick-call entry point. Only
   * work shifts are clickable: there is nothing to cover on a rest day, and
   * leave is already accounted for in the solve.
   */
  onAbsence?: (employeeId: string, fullname: string, date: string) => void;
}) {
  const { roster_start, num_days, staff, shifts, assignments } = result;
  const days = Array.from({ length: num_days }, (_, i) => addDays(roster_start, i));

  const groupsQ = useQuery({ queryKey: ["shifts", "groups"], queryFn: listShiftGroups });
  const colourOf = (code: string) => {
    const g = groupsQ.data?.find((g) => g.code === code);
    return g ? groupColourFor(g) : groupColour(code);
  };

  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [tableWidth, setTableWidth] = useState(0);

  useLayoutEffect(() => {
    const t = tableRef.current;
    if (!t) return;
    const update = () => setTableWidth(t.scrollWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(t);
    return () => ro.disconnect();
  }, [num_days, staff.length]);

  useEffect(() => {
    const top = topRef.current;
    const bottom = bottomRef.current;
    if (!top || !bottom) return;
    let syncing = false;
    const onTop = () => {
      if (syncing) return;
      syncing = true;
      bottom.scrollLeft = top.scrollLeft;
      syncing = false;
    };
    const onBottom = () => {
      if (syncing) return;
      syncing = true;
      top.scrollLeft = bottom.scrollLeft;
      syncing = false;
    };
    top.addEventListener("scroll", onTop);
    bottom.addEventListener("scroll", onBottom);
    return () => {
      top.removeEventListener("scroll", onTop);
      bottom.removeEventListener("scroll", onBottom);
    };
  }, []);

  return (
    <div>
      <div ref={topRef} style={{ overflowX: "auto", overflowY: "hidden", height: 14 }}>
        <div style={{ width: tableWidth, height: 1 }} />
      </div>
      <div ref={bottomRef} style={{ overflowX: "auto" }}>
      <table ref={tableRef} style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: "var(--fs-sm)", margin: "0 auto" }}>
        <thead>
          <tr>
            <th
              style={{
                position: "sticky",
                left: 0,
                background: "var(--surface)",
                textAlign: "left",
                padding: "8px 12px",
                borderBottom: "1px solid var(--border)",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--muted)",
                fontWeight: 500,
                minWidth: 200,
              }}
            >
              Staff
            </th>
            {days.map((d, i) => {
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <th
                  key={i}
                  style={{
                    padding: "6px 4px",
                    borderBottom: "1px solid var(--border)",
                    background: isWeekend ? "var(--hover)" : "transparent",
                    fontWeight: 500,
                    fontSize: 11,
                    textAlign: "center",
                    minWidth: 56,
                    color: "var(--muted)",
                  }}
                >
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {WD[d.getDay()]}
                  </div>
                  <div className="mono" style={{ color: "var(--ink)", fontSize: 11 }}>
                    {String(d.getDate()).padStart(2, "0")}/{String(d.getMonth() + 1).padStart(2, "0")}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.employee_id}>
              <td
                style={{
                  position: "sticky",
                  left: 0,
                  background: "var(--surface)",
                  padding: "6px 12px",
                  borderBottom: "1px solid var(--border)",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                }}
              >
                <div>{s.fullname}</div>
                <div className="mono muted" style={{ fontSize: 10 }}>{s.employee_id}</div>
              </td>
              {days.map((d, i) => {
                const code = assignments[s.employee_id]?.[String(i)];
                const info = code ? shifts[code] : undefined;
                const c = info ? colourOf(info.group) : undefined;
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const canReplace = Boolean(onAbsence && info?.is_work_shift);
                return (
                  <td
                    key={i}
                    title={
                      canReplace
                        ? `${s.fullname} · ${code} · ${info!.name} — click if they can't work it`
                        : info
                          ? `${s.fullname} · ${code} · ${info.name}`
                          : undefined
                    }
                    className="mono"
                    onClick={
                      canReplace
                        ? () => onAbsence!(s.employee_id, s.fullname, isoDate(d))
                        : undefined
                    }
                    style={{
                      padding: "6px 4px",
                      borderBottom: "1px solid var(--border)",
                      textAlign: "center",
                      background: c ? c + "1A" : isWeekend ? "var(--hover)" : "transparent",
                      color: c ?? "var(--muted)",
                      fontWeight: 500,
                      fontSize: 11,
                      cursor: canReplace ? "pointer" : undefined,
                    }}
                  >
                    {code ?? "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <ShiftLegend result={result} colourOf={colourOf} />
    </div>
  );
}
