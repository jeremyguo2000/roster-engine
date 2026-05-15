import { RosterResult } from "../api/rosters";
import { groupColour } from "../lib/colours";

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

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: "var(--fs-sm)" }}>
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
                const c = info ? groupColour(info.group) : undefined;
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
  );
}
