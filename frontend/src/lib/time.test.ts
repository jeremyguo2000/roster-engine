import { describe, it, expect } from "vitest";

import { durationMin, hhmmToMin, minToHHMM } from "./time";

describe("minToHHMM", () => {
  it("formats noon", () => {
    expect(minToHHMM(12 * 60)).toBe("12:00");
  });
  it("formats midnight", () => {
    expect(minToHHMM(0)).toBe("00:00");
  });
  it("formats 09:45", () => {
    expect(minToHHMM(9 * 60 + 45)).toBe("09:45");
  });
  it("wraps past 24h", () => {
    expect(minToHHMM(25 * 60)).toBe("01:00");
  });
  it("handles negative wrap", () => {
    expect(minToHHMM(-60)).toBe("23:00");
  });
});

describe("hhmmToMin", () => {
  it("parses 09:00", () => {
    expect(hhmmToMin("09:00")).toBe(540);
  });
  it("parses 23:59", () => {
    expect(hhmmToMin("23:59")).toBe(23 * 60 + 59);
  });
  it("rejects out-of-range hour", () => {
    expect(() => hhmmToMin("24:00")).toThrow();
  });
  it("rejects malformed input", () => {
    expect(() => hhmmToMin("9pm")).toThrow();
  });
});

describe("durationMin", () => {
  it("day shift", () => {
    expect(durationMin(540, 1020)).toBe(480);
  });
  it("overnight (end <= start)", () => {
    // 22:00 → 08:00 = 10 hours
    expect(durationMin(22 * 60, 8 * 60)).toBe(10 * 60);
  });
  it("midnight to midnight = full day", () => {
    expect(durationMin(0, 0)).toBe(1440);
  });
});
