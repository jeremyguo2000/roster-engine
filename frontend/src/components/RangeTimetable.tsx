import { useMemo } from "react";

import { Roster } from "../api/rosters";
import { groupColour } from "../lib/colours";
import {
  DAY_WIN_START,
  fmtMin,
  rangeTimetableBars,
  rangeWindowDuration,
  staffOrderFromBars,
} from "../lib/timetable";
import { dateRange } from "../lib/calendar";

const WD = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export default function RangeTimetable({
  from,
  to,
  rosters,
}: {
  from: string;
  to: string;
  rosters: Roster[];
}) {
  const dates = useMemo(() => dateRange(from, to), [from, to]);
  const bars = useMemo(() => rangeTimetableBars(rosters, dates), [rosters, dates]);
  const order = useMemo(() => staffOrderFromBars(bars), [bars]);
  const winDur = rangeWindowDuration(dates.length);

  // Separators + labels at midnight of each day in the window.
  const separators = useMemo(() => {
    const out: { pct: number; label: string; weekend: boolean }[] = [];
    for (let dayIdx = 0; dayIdx <= dates.length + 1; dayIdx++) {
      const abs = dayIdx * 1440;
      if (abs < DAY_WIN_START || abs > DAY_WIN_START + winDur) continue;
      const pct = ((abs - DAY_WIN_START) / winDur) * 100;
      const ds =
        dayIdx === 0
          ? prevIso(dates[0])
          : dayIdx === dates.length + 1
          ? nextIso(dates[dates.length - 1])
          : dates[dayIdx - 1];
      const [y, m, d] = ds.split("-").map(Number);
      const wd = new Date(y, m - 1, d).getDay();
      out.push({
        pct,
        label: `${WD[wd]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`,
        weekend: wd === 0 || wd === 6,
      });
    }
    return out;
  }, [dates, winDur]);

  return (
    <div>
      <div className="muted" style={{ fontSize: "var(--fs-sm)", marginBottom: 8 }}>
        {from} → {to} · {dates.length} day{dates.length === 1 ? "" : "s"}. NSG shifts on the boundary days spill in.
      </div>

      {/* Ruler row */}
      <div style={{ display: "flex", gap: 12, marginBottom: 4 }}>
        <div style={{ width: NAME_WIDTH }} />
        <div style={{ position: "relative", flex: 1, height: 28 }}>
          {separators.map((s, i) => (
            <div
              key={`s-${i}`}
              style={{
                position: "absolute",
                left: `${s.pct}%`,
                top: 0,
                bottom: 0,
                width: 1,
                background: s.weekend ? "var(--border-strong)" : "var(--border)",
              }}
            />
          ))}
          {separators.map((s, i) =>
            i < separators.length - 1 ? (
              <div
                key={`t-${i}`}
                className="mono"
                style={{
                  position: "absolute",
                  left: `${s.pct}%`,
                  top: 6,
                  paddingLeft: 4,
                  fontSize: 10,
                  color: s.weekend ? "var(--ink)" : "var(--muted)",
                  fontWeight: s.weekend ? 600 : 400,
                }}
              >
                {s.label}
              </div>
            ) : null,
          )}
        </div>
      </div>

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
                  height: 22,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                {separators.map((sep, i) => (
                  <div
                    key={`row-sep-${i}`}
                    style={{
                      position: "absolute",
                      left: `${sep.pct}%`,
                      top: 0,
                      bottom: 0,
                      width: 1,
                      background: sep.weekend ? "var(--border-strong)" : "var(--border)",
                    }}
                  />
                ))}
                {myBars.map((b, i) => {
                  const left = ((b.start - DAY_WIN_START) / winDur) * 100;
                  const width = ((b.end - b.start) / winDur) * 100;
                  return (
                    <div
                      key={i}
                      title={`${b.shift_code} · ${fmtMin(b.rawStart)} – ${fmtMin(b.rawEnd)}`}
                      style={{
                        position: "absolute",
                        left: `${left}%`,
                        width: `${width}%`,
                        top: 2,
                        bottom: 2,
                        background: groupColour(b.shift_info.group),
                        borderRadius: 2,
                      }}
                    />
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

function fmtLocalIso(d: Date): string {
  // Avoid toISOString() — it converts to UTC and shifts dates in non-UTC TZs.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function prevIso(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const out = new Date(y, m - 1, d);
  out.setDate(out.getDate() - 1);
  return fmtLocalIso(out);
}

function nextIso(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const out = new Date(y, m - 1, d);
  out.setDate(out.getDate() + 1);
  return fmtLocalIso(out);
}
