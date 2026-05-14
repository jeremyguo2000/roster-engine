import { describe, expect, it } from "vitest";
import { groupColor } from "./groupColors";

describe("groupColor", () => {
  it("is deterministic for the same group code", () => {
    const a = groupColor("DAY");
    const b = groupColor("DAY");
    expect(a).toEqual(b);
  });

  it("differs across distinct codes (palette is large enough for these)", () => {
    const day = groupColor("DAY");
    const night = groupColor("NIGHT");
    expect(day.bg).not.toEqual(night.bg);
  });

  it("returns a different palette in dark mode", () => {
    const light = groupColor("DAY", false);
    const dark = groupColor("DAY", true);
    expect(light.bg).not.toEqual(dark.bg);
    expect(light.fg).not.toEqual(dark.fg);
  });

  it("emits well-formed HSL colour strings", () => {
    const { bg, fg, border } = groupColor("ICU");
    for (const colour of [bg, fg, border]) {
      expect(colour).toMatch(/^hsl\(\d+ \d+% \d+%\)$/);
    }
  });
});
