import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RosterResult } from "../api/rosters";
import { listShiftGroups } from "../api/shifts";
import { groupColour, groupColourFor } from "../lib/colours";

const WD = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

function addDays(iso: string, n: number): Date {
  const [y, m, d] = iso.split("-").map(Number);
  const out = new Date(y, m - 1, d);
  out.setDate(out.getDate() + n);
  return out;
}

export default function RosterGrid({ result }: { result: RosterResult }) {
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
                return (
                  <td
                    key={i}
                    title={info ? `${s.fullname} · ${code} · ${info.name}` : undefined}
                    className="mono"
                    style={{
                      padding: "6px 4px",
                      borderBottom: "1px solid var(--border)",
                      textAlign: "center",
                      background: c ? c + "1A" : isWeekend ? "var(--hover)" : "transparent",
                      color: c ?? "var(--muted)",
                      fontWeight: 500,
                      fontSize: 11,
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
    </div>
  );
}
