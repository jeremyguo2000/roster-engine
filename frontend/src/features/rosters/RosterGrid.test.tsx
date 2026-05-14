import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { RosterGrid } from "./RosterGrid";
import type { RosterResult } from "./rosterResult";

const RESULT: RosterResult = {
  roster_start: "2026-05-18", // Monday
  num_days: 3,
  staff: [
    { employee_id: "E1", fullname: "Alice Anderson" },
    { employee_id: "E2", fullname: "Bob Brown" },
  ],
  shifts: {
    D: {
      name: "Day",
      group: "DAY",
      is_work_shift: true,
      is_night_shift: false,
      start_time: 420,
      end_time: 900,
      work_time: 480,
    },
    N: {
      name: "Night",
      group: "NIGHT",
      is_work_shift: true,
      is_night_shift: true,
      start_time: 1140,
      end_time: 420,
      work_time: 480,
    },
    AL: {
      name: "Annual leave",
      group: "AL",
      is_work_shift: false,
      is_night_shift: false,
      start_time: 0,
      end_time: 0,
      work_time: 0,
    },
  },
  assignments: {
    E1: { "0": "D", "1": "N", "2": "AL" },
    E2: { "0": "D" /* day 1 + 2 are rest days */ },
  },
  staff_max_consec: { E1: 7, E2: 1 },
  consec_days: {},
};

describe("RosterGrid", () => {
  it("renders staff rows with employee IDs and names", () => {
    render(<RosterGrid result={RESULT} />);
    expect(screen.getByText("Alice Anderson")).toBeInTheDocument();
    expect(screen.getByText("E1")).toBeInTheDocument();
    expect(screen.getByText("Bob Brown")).toBeInTheDocument();
  });

  it("renders one column per day in the window", () => {
    render(<RosterGrid result={RESULT} />);
    // 3 days → 3 date cells in the header (the staff col is the 4th, max-consec is the 5th).
    expect(screen.getAllByText("May 18")).toHaveLength(1);
    expect(screen.getAllByText("May 19")).toHaveLength(1);
    expect(screen.getAllByText("May 20")).toHaveLength(1);
  });

  it("paints assigned shift codes and shows '—' for rest days", () => {
    render(<RosterGrid result={RESULT} />);
    expect(screen.getAllByText("D").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("N")).toBeInTheDocument();
    expect(screen.getByText("AL")).toBeInTheDocument();
    // Bob's day 1 + 2 are rest — there should be em-dashes in those cells.
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("renders the per-row max-consec badge with destructive styling above threshold", () => {
    render(<RosterGrid result={RESULT} maxConsecWarnAt={6} />);
    // Alice: 7 (over threshold) → destructive variant
    const seven = screen.getByText("7");
    expect(seven.className).toMatch(/destructive/);
    // Bob: 1 (under threshold) → muted variant
    const one = screen.getByText("1");
    expect(one.className).toMatch(/muted/);
  });

  it("shows the headcount footer when demands are passed", () => {
    render(
      <RosterGrid
        result={RESULT}
        demands={[
          {
            id: 1,
            date: "2026-05-18",
            start_min: 420,
            end_min: 900,
            headcount: 3,
            skill_value_id: null,
          },
        ]}
      />,
    );
    expect(screen.getByText(/headcount \/ demand/i)).toBeInTheDocument();
    // Day 0 has 2 work assignments and a demand of 3 → "2" headcount and "/ 3"
    expect(screen.getByText("/ 3")).toBeInTheDocument();
  });

  it("includes the moon icon for night-shift cells", () => {
    const { container } = render(<RosterGrid result={RESULT} />);
    // The Moon icon is rendered as an svg with aria-label="Night shift".
    // Tooltips wrap each cell; the icon lives inside the trigger.
    const moonNodes = within(container as HTMLElement).getAllByLabelText(/night shift/i);
    expect(moonNodes.length).toBeGreaterThanOrEqual(1);
  });
});
