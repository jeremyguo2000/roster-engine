import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { Roster } from "../api/rosters";
import { listShiftGroups } from "../api/shifts";
import { groupColour, groupColourFor } from "../lib/colours";
import {
  DAY_WIN_DUR,
  DAY_WIN_START,
  dayTimetableBars,
  fmtMin,
  staffOrderFromBars,
} from "../lib/timetable";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function DayTimetable({ date, rosters }: { date: string; rosters: Roster[] }) {
  const bars = useMemo(() => dayTimetableBars(rosters, date), [rosters, date]);
  const order = useMemo(() => staffOrderFromBars(bars), [bars]);
  const groupsQ = useQuery({ queryKey: ["shifts", "groups"], queryFn: listShiftGroups });
  const colourOf = (code: string) => {
    const g = groupsQ.data?.find((g) => g.code === code);
    return g ? groupColourFor(g) : groupColour(code);
  };

  // 39 hourly ticks (18:00 on day-1 → 09:00 on day+1 inclusive).
  const ticks = useMemo(() => {
    const out: { pct: number; label: string; bold: boolean }[] = [];
    for (let h = 0; h <= 39; h++) {
      const absMin = DAY_WIN_START + h * 60;
      const hhmm = absMin % 1440;
      const hr = Math.floor(hhmm / 60);
      const bold = hr === 0 || hr === 12;
      const pct = (h * 60 / DAY_WIN_DUR) * 100;
      out.push({ pct, label: `${String(hr).padStart(2, "0")}:00`, bold });
    }
    return out;
  }, []);

  const wd = (() => {
    const [y, m, d] = date.split("-").map(Number);
    return WD[new Date(y, m - 1, d).getDay()];
  })();

  return (
    <div>
      <div className="muted" style={{ fontSize: "var(--fs-sm)", marginBottom: 8 }}>
        {wd} {date} — 18:00 prev day to 09:00 next day. NSG shifts spill in from neighbours.
      </div>

      {/* Ruler */}
      <div style={{ display: "flex", gap: 12, marginBottom: 4 }}>
        <div style={{ width: NAME_WIDTH, fontSize: 10, color: "var(--muted)" }}>
          ← prev day&nbsp;&nbsp;|&nbsp;&nbsp;day&nbsp;&nbsp;|&nbsp;&nbsp;next day →
        </div>
        <div style={{ position: "relative", flex: 1, height: 24 }}>
          {ticks.map((t, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${t.pct}%`,
                top: 0,
                bottom: 0,
                width: 1,
                background: t.bold ? "var(--border-strong)" : "var(--border)",
              }}
            />
          ))}
          {ticks.map((t, i) =>
            i % 3 === 0 ? (
              <div
                key={`l-${i}`}
                className="mono"
                style={{
                  position: "absolute",
                  left: `${t.pct}%`,
                  top: 4,
                  transform: "translateX(-50%)",
                  fontSize: 10,
                  color: t.bold ? "var(--ink)" : "var(--muted)",
                  fontWeight: t.bold ? 600 : 400,
                }}
              >
                {t.label}
              </div>
            ) : null,
          )}
        </div>
      </div>

      {/* Rows */}
      {order.length === 0 ? (
        <div className="empty-state">No shifts in this window.</div>
      ) : (
        order.map((s) => {
          const myBars = bars.filter((b) => b.staff_id === s.id);
          return (
            <div key={s.id} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 6 }}>
              <div style={{ width: NAME_WIDTH, fontSize: "var(--fs-sm)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {s.name}
              </div>
              <div
                style={{
                  position: "relative",
                  flex: 1,
                  height: 28,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                {ticks.map((t, i) => (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      left: `${t.pct}%`,
                      top: 0,
                      bottom: 0,
                      width: 1,
                      background: t.bold ? "var(--border-strong)" : "var(--border)",
                    }}
                  />
                ))}
                {myBars.map((b, i) => {
                  const left = ((b.start - DAY_WIN_START) / DAY_WIN_DUR) * 100;
                  const width = ((b.end - b.start) / DAY_WIN_DUR) * 100;
                  return (
                    <div
                      key={i}
                      title={`${b.shift_code} · ${fmtMin(b.rawStart)} – ${fmtMin(b.rawEnd)}`}
                      style={{
                        position: "absolute",
                        left: `${left}%`,
                        width: `${width}%`,
                        top: 3,
                        bottom: 3,
                        background: colourOf(b.shift_info.group),
                        borderRadius: 3,
                        color: "#fff",
                        fontSize: 10,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 500,
                        overflow: "hidden",
                      }}
                    >
                      {b.shift_code}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

const NAME_WIDTH = 160;
