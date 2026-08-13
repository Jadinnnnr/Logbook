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

/**
 * Accent swatch shown in the picker uses the light-mode fill.
 *
 * Steel leads because it is what the rest of the design is drawn around, but the
 * hues are all still here: the palette is a preference, not a house style.
 */
export const ACCENTS: [string, string, string][] = [
  ["steel", "Steel", "#5980a6"],
  ["blue", "Blue", "#1c5cab"],
  ["teal", "Teal", "#12805a"],
  ["violet", "Violet", "#4a3aa7"],
  ["orange", "Orange", "#b8471c"],
  ["green", "Green", "#006300"],
  ["pink", "Pink", "#b33465"],
];

/**
 * Type pairings.
 *
 * The condensed uppercase treatment is Industry's own voice, so it belongs to
 * the Industry option rather than to the app: pick another face and the
 * headings go back to sentence case, because uppercase condensed Inter is
 * nobody's idea of a good time.
 */
export const FONTS: [string, string, string][] = [
  ["industry", "Industry", "Condensed uppercase headings over Barlow"],
  ["grotesk", "Grotesk", "Inter throughout, sentence case"],
  ["system", "System", "Whatever your device uses for its own interface"],
];

export const DEFAULT_FONT = "industry";
