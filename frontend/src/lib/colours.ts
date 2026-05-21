/**
 * Group colour map for roster data (cells, Gantt bars). Kept distinct from the
 * chrome palette in src/styles/global.css.
 */

export const CURATED_COLOURS: string[] = [
  "#2B6CB0", // blue (DSG)
  "#2D6A4F", // green (ESG)
  "#6B46C1", // purple (NSG)
  "#C84B31", // red (Leaves)
];

export const GROUP_COLOURS: Record<string, string> = {
  DSG: "#2B6CB0",
  ESG: "#2D6A4F",
  NSG: "#6B46C1",
  Leaves: "#C84B31",
};

export function groupColour(group: string): string {
  return GROUP_COLOURS[group] ?? "#8A8378";
}

export function groupColourFor(g: { code: string; color?: string | null }): string {
  return g.color ?? groupColour(g.code);
}
