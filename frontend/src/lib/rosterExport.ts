import type { RosterResult } from "../api/rosters";

const WD = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

const WEEKEND_FILL_ARGB = "FFF5F1EB";
const BORDER_ARGB = "FFE7E2D9";
const MUTED_ARGB = "FF8A8378";

function addDays(iso: string, n: number): Date {
  const [y, m, d] = iso.split("-").map(Number);
  const out = new Date(y, m - 1, d);
  out.setDate(out.getDate() + n);
  return out;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function toHex2(n: number): string {
  return Math.round(n).toString(16).padStart(2, "0").toUpperCase();
}

function toARGB(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `FF${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
}

function blendOnWhite(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  const inv = 1 - alpha;
  return `FF${toHex2(inv * 255 + alpha * r)}${toHex2(inv * 255 + alpha * g)}${toHex2(inv * 255 + alpha * b)}`;
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|[\]]/g, "_").trim() || "roster";
}

export async function exportRosterToXlsx(
  roster: { id: number; name: string },
  result: RosterResult,
  resolveColour: (groupCode: string) => string,
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const sheetName = sanitize(roster.name).slice(0, 31) || "Roster";
  const ws = wb.addWorksheet(sheetName);

  const { roster_start, num_days, staff, shifts, assignments } = result;
  const days = Array.from({ length: num_days }, (_, i) => addDays(roster_start, i));

  ws.columns = [{ width: 26 }, ...days.map(() => ({ width: 8 }))];

  const header = ws.addRow([
    "Staff",
    ...days.map(
      (d) =>
        `${WD[d.getDay()]}\n${String(d.getDate()).padStart(2, "0")}/${String(
          d.getMonth() + 1,
        ).padStart(2, "0")}`,
    ),
  ]);
  header.height = 30;
  header.eachCell((cell, col) => {
    cell.font = { size: 10, color: { argb: MUTED_ARGB }, bold: true };
    cell.alignment = {
      vertical: "middle",
      horizontal: col === 1 ? "left" : "center",
      wrapText: true,
    };
    cell.border = { bottom: { style: "thin", color: { argb: BORDER_ARGB } } };
    if (col === 1) return;
    const d = days[col - 2];
    if (d && (d.getDay() === 0 || d.getDay() === 6)) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: WEEKEND_FILL_ARGB },
      };
    }
  });

  for (const s of staff) {
    const row = ws.addRow([
      `${s.fullname}\n${s.employee_id}`,
      ...days.map((_, i) => assignments[s.employee_id]?.[String(i)] ?? "—"),
    ]);
    row.height = 30;
    row.eachCell((cell, col) => {
      cell.border = { bottom: { style: "thin", color: { argb: BORDER_ARGB } } };
      if (col === 1) {
        cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
        cell.font = { size: 11, bold: true };
        return;
      }
      const dayIndex = col - 2;
      const d = days[dayIndex];
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      const code = assignments[s.employee_id]?.[String(dayIndex)];
      const info = code ? shifts[code] : undefined;
      const groupColour = info ? resolveColour(info.group) : undefined;

      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.font = {
        name: "Menlo",
        size: 10,
        bold: true,
        color: { argb: groupColour ? toARGB(groupColour) : MUTED_ARGB },
      };
      if (groupColour) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: blendOnWhite(groupColour, 0.1) },
        };
      } else if (isWeekend) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: WEEKEND_FILL_ARGB },
        };
      }
    });
  }

  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitize(roster.name)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
