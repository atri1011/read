import type { CSSProperties } from "react";

/** Low-saturation warm/cool accents for paper cards (light + dark friendly). */
export const SHELF_ACCENTS = [
  "oklch(0.55 0.08 40)",
  "oklch(0.52 0.07 70)",
  "oklch(0.50 0.07 140)",
  "oklch(0.50 0.07 200)",
  "oklch(0.52 0.07 250)",
  "oklch(0.52 0.07 300)",
  "oklch(0.50 0.06 20)",
  "oklch(0.48 0.06 180)",
] as const;

export const SHELF_ACCENT_COUNT = SHELF_ACCENTS.length;

/** FNV-1a 32-bit style hash → palette index. */
export function titleAccentIndex(title: string): number {
  let h = 2166136261;
  for (let i = 0; i < title.length; i++) {
    h ^= title.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % SHELF_ACCENT_COUNT;
}

export type TitleAccentStyle = CSSProperties & {
  ["--shelf-accent"]: string;
};

export function titleAccentStyle(title: string): TitleAccentStyle {
  return {
    ["--shelf-accent"]: SHELF_ACCENTS[titleAccentIndex(title)],
  };
}
