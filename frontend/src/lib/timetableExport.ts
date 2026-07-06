import {
  DAY_WIN_DUR,
  DAY_WIN_START,
  TimetableBar,
  staffOrderFromBars,
} from "./timetable";

const BORDER_ARGB = "FFE7E2D9";
const BORDER_STRONG_ARGB = "FFB8B0A0";
const MUTED_ARGB = "FF8A8378";
const WEEKEND_FILL_ARGB = "FFF5F1EB";

const SLOT_MIN = 30;
const NUM_SLOTS = DAY_WIN_DUR / SLOT_MIN; // 78

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

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|[\]]/g, "_").trim() || "timetable";
}

function isoWeekend(iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = new Date(y, m - 1, d).getDay();
  return wd === 0 || wd === 6;
}

export async function exportTimetableToXlsx(
  filename: string,
  days: { date: string; bars: TimetableBar[] }[],
  resolveColour: (groupCode: string) => string,
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();

  for (const { date, bars } of days) {
    const ws = wb.addWorksheet(sanitize(date).slice(0, 31));

    ws.columns = [
      { width: 22 },
      ...Array.from({ length: NUM_SLOTS }, () => ({ width: 3.2 })),
    ];

    // Header row: hour labels, one merged cell per pair of half-hour slots.
    const headerCells: string[] = ["Staff"];
    for (let s = 0; s < NUM_SLOTS; s++) {
      const absMin = DAY_WIN_START + s * SLOT_MIN;
      if (absMin % 60 === 0) {
        const hr = Math.floor((absMin % 1440) / 60);
        headerCells.push(`${String(hr).padStart(2, "0")}:00`);
      } else {
        headerCells.push("");
      }
    }
    const header = ws.addRow(headerCells);
    header.height = 18;
    header.eachCell((cell, col) => {
      cell.alignment = {
        vertical: "middle",
        horizontal: col === 1 ? "left" : "center",
      };
      cell.border = { bottom: { style: "thin", color: { argb: BORDER_ARGB } } };
      if (col === 1) {
        cell.font = { size: 10, color: { argb: MUTED_ARGB }, bold: true };
        return;
      }
      const slotIdx = col - 2;
      const absMin = DAY_WIN_START + slotIdx * SLOT_MIN;
      const hr = Math.floor((absMin % 1440) / 60);
      const onHour = absMin % 60 === 0;
      const bold = onHour && (hr === 0 || hr === 12);
      cell.font = {
        size: 9,
        color: { argb: MUTED_ARGB },
        bold: bold || onHour,
        name: "Menlo",
      };
    });
    // Merge each pair of half-hour cells so the hour label spans both.
    for (let s = 0; s < NUM_SLOTS; s += 2) {
      ws.mergeCells(1, 2 + s, 1, 3 + s);
    }

    // Weekend tint on the focal day's columns (slot indices 12..59 cover 00:00–24:00).
    if (isoWeekend(date)) {
      for (let s = 12; s < 60; s++) {
        const cell = ws.getCell(1, 2 + s);
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: WEEKEND_FILL_ARGB },
        };
      }
    }

    // Body rows: one per staff in stable order.
    const order = staffOrderFromBars(bars);
    for (const s of order) {
      const row = ws.addRow([
        `${s.name}\n${s.id}`,
        ...Array.from({ length: NUM_SLOTS }, () => ""),
      ]);
      row.height = 26;
      const rowNum = row.number;

      row.getCell(1).alignment = {
        vertical: "middle",
        horizontal: "left",
        wrapText: true,
      };
      row.getCell(1).font = { size: 11, bold: true };
      row.getCell(1).border = {
        bottom: { style: "thin", color: { argb: BORDER_ARGB } },
      };

      for (const b of bars.filter((b) => b.staff_id === s.id)) {
        let c1 = 2 + Math.floor((b.start - DAY_WIN_START) / SLOT_MIN);
        let c2 = 2 + Math.ceil((b.end - DAY_WIN_START) / SLOT_MIN) - 1;
        if (c1 < 2) c1 = 2;
        if (c2 > 1 + NUM_SLOTS) c2 = 1 + NUM_SLOTS;
        if (c2 < c1) continue;

        ws.mergeCells(rowNum, c1, rowNum, c2);
        const cell = ws.getCell(rowNum, c1);
        const colour = resolveColour(b.shift_info.group);
        cell.value = b.shift_code;
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: toARGB(colour) },
        };
        cell.font = {
          name: "Menlo",
          size: 10,
          bold: true,
          color: { argb: "FFFFFFFF" },
        };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.border = {
          top: { style: "thin", color: { argb: BORDER_ARGB } },
          bottom: { style: "thin", color: { argb: BORDER_ARGB } },
          left: { style: "thin", color: { argb: BORDER_ARGB } },
          right: { style: "thin", color: { argb: BORDER_ARGB } },
        };
      }

      // Day-boundary dividers: thicker right border on the slot column whose
      // right edge falls at focal-day midnight and next-day midnight.
      // 1440 - DAY_WIN_START = 360 minutes into window → slot 12 right-edge = end of slot 11.
      // 2880 - DAY_WIN_START = 1800 minutes → end of slot 59.
      for (const boundarySlotIdx of [11, 59]) {
        const cell = ws.getCell(rowNum, 2 + boundarySlotIdx);
        const existing = cell.border ?? {};
        cell.border = {
          ...existing,
          right: { style: "medium", color: { argb: BORDER_STRONG_ARGB } },
        };
      }
    }

    ws.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
