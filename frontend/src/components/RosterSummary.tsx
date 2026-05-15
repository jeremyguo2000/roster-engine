import { RosterResult } from "../api/rosters";

function addDays(iso: string, n: number): Date {
  const [y, m, d] = iso.split("-").map(Number);
  const out = new Date(y, m - 1, d);
  out.setDate(out.getDate() + n);
  return out;
}

interface StaffStats {
  fullname: string;
  employee_id: string;
  workHours: number;
  weekendDays: number;
  nightShifts: number;
  maxConsec: number;
}

export default function RosterSummary({ result }: { result: RosterResult }) {
  const { roster_start, num_days, staff, shifts, assignments, staff_max_consec } = result;

  const rows: StaffStats[] = staff.map((s) => {
    let workMin = 0;
    let weekendDays = 0;
    let nightShifts = 0;

    for (let i = 0; i < num_days; i++) {
      const code = assignments[s.employee_id]?.[String(i)];
      if (!code) continue;
      const info = shifts[code];
      if (!info || info.work_time === 0) continue;

      workMin += info.work_time;
      const d = addDays(roster_start, i);
      if (d.getDay() === 0 || d.getDay() === 6) weekendDays++;
      if (info.group === "NSG") nightShifts++;
    }

    return {
      fullname: s.fullname,
      employee_id: s.employee_id,
      workHours: workMin / 60,
      weekendDays,
      nightShifts,
      maxConsec: staff_max_consec?.[s.employee_id] ?? 0,
    };
  });

  return (
    <table className="data-table" style={{ marginTop: 16 }}>
      <thead>
        <tr>
          <th>Staff</th>
          <th>Work (hrs)</th>
          <th>Weekend days</th>
          <th>Night shifts</th>
          <th>Max consec days</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.employee_id}>
            <td>
              {r.fullname}
              <span className="mono muted" style={{ marginLeft: 8, fontSize: "var(--fs-xs)" }}>
                {r.employee_id}
              </span>
            </td>
            <td className="mono">{r.workHours.toFixed(1)}</td>
            <td className="mono">{r.weekendDays}</td>
            <td className="mono">{r.nightShifts}</td>
            <td className="mono">{r.maxConsec}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
