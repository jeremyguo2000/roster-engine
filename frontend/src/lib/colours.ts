/**
 * Group colour map for roster data (cells, Gantt bars). Kept distinct from the
 * chrome palette in src/styles/global.css.
 */
export const GROUP_COLOURS: Record<string, string> = {
  DSG: "#2B6CB0",
  ESG: "#6B46C1",
  NSG: "#C84B31",
  Off: "#4A5568",
  Leaves: "#2D6A4F",
};

export function groupColour(group: string): string {
  return GROUP_COLOURS[group] ?? "#8A8378";
}
