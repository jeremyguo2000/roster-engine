import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import RosterViolations from "./RosterViolations";

/**
 * The three states are the whole point of this component, and only one of them
 * ("audited and clean") is reachable from a healthy solve — a real roster that
 * breaks its own rules is hard to produce on demand. So they're pinned here.
 */
describe("RosterViolations", () => {
  it("renders nothing when the roster predates the validator", () => {
    // undefined is not the same as "clean": these rosters were never audited, so
    // showing a pass would claim something the data can't support.
    const { container } = render(<RosterViolations violations={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("confirms a pass when audited with no violations", () => {
    render(<RosterViolations violations={[]} />);
    expect(screen.getByText(/rule check passed/i)).toBeInTheDocument();
  });

  it("warns and lists each violation when the solver broke its own rules", () => {
    render(
      <RosterViolations
        violations={[
          { rule: "C4", message: "E001 works 2640 min, target is 2200 min" },
          { rule: "C1", message: "E002 has 2 work shifts on day 3: AM,PM" },
        ]}
      />,
    );
    expect(screen.getByText(/2 rule violations found/i)).toBeInTheDocument();
    expect(screen.getByText(/E001 works 2640 min/)).toBeInTheDocument();
    expect(screen.getByText(/E002 has 2 work shifts/)).toBeInTheDocument();
  });

  it("singularises the count for a lone violation", () => {
    render(<RosterViolations violations={[{ rule: "C7", message: "x" }]} />);
    expect(screen.getByText(/1 rule violation found/i)).toBeInTheDocument();
  });

  it("groups repeats of the same rule under one heading", () => {
    render(
      <RosterViolations
        violations={[
          { rule: "C4", message: "E001 off target" },
          { rule: "C4", message: "E002 off target" },
          { rule: "C1", message: "E003 double-booked" },
        ]}
      />,
    );
    // Two rule groups, not three rows — a systemic breach should read as one problem.
    expect(screen.getAllByText(/^C4$/)).toHaveLength(1);
    expect(screen.getAllByText(/^C1$/)).toHaveLength(1);
    expect(screen.getByText(/2 issues/)).toBeInTheDocument();
    expect(screen.getByText(/1 issue$/)).toBeInTheDocument();
  });

  it("can be collapsed so it doesn't dominate the page", async () => {
    render(<RosterViolations violations={[{ rule: "C4", message: "E001 off target" }]} />);
    expect(screen.getByText(/E001 off target/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { expanded: true }));
    expect(screen.queryByText(/E001 off target/)).not.toBeInTheDocument();
  });
});
