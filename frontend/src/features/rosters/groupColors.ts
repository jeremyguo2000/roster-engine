/**
 * Deterministic shift-group → colour mapping. Same group code always
 * yields the same colour across reloads / browsers.
 *
 * The hash is a small 32-bit FNV-1a, mapped onto a curated hue palette
 * (avoiding the destructive red band reserved for delete/discard).
 */

const HUE_PALETTE = [210, 200, 180, 160, 140, 120, 95, 50, 35, 280, 260, 235];

function hashCode(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface GroupColor {
  /** background colour for the cell */
  bg: string;
  /** text colour with sufficient contrast on `bg` */
  fg: string;
  /** stronger border colour (used for hover / focus) */
  border: string;
}

/** Map a shift-group code to a stable HSL colour set. */
export function groupColor(groupCode: string, isDarkMode = false): GroupColor {
  const hue = HUE_PALETTE[hashCode(groupCode) % HUE_PALETTE.length];
  if (isDarkMode) {
    return {
      bg: `hsl(${hue} 55% 22%)`,
      fg: `hsl(${hue} 25% 92%)`,
      border: `hsl(${hue} 55% 35%)`,
    };
  }
  return {
    bg: `hsl(${hue} 70% 90%)`,
    fg: `hsl(${hue} 50% 22%)`,
    border: `hsl(${hue} 60% 70%)`,
  };
}
