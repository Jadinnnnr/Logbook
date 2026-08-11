/**
 * Appearance options. Kept out of lib/db.ts so client components can import
 * them without pulling in better-sqlite3.
 */

export const THEMES: [string, string][] = [
  ["system", "Match system"],
  ["light", "Light"],
  ["dark", "Dark"],
];

export const CUSTOM_ACCENT = "custom";
export const DEFAULT_CUSTOM_HEX = "#7c3aed";

/** Accent swatch shown in the picker uses the light-mode fill. */
export const ACCENTS: [string, string, string][] = [
  ["blue", "Blue", "#1c5cab"],
  ["teal", "Teal", "#12805a"],
  ["violet", "Violet", "#4a3aa7"],
  ["orange", "Orange", "#b8471c"],
  ["green", "Green", "#006300"],
  ["pink", "Pink", "#b33465"],
];
