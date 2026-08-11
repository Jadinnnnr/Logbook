/**
 * Aircraft constants. Kept out of lib/db.ts so client components can import
 * them without pulling in better-sqlite3.
 */

/** FAA category/class options for aircraft profiles. */
export const CATEGORY_CLASSES: [string, string][] = [
  ["ASEL", "Airplane single-engine land"],
  ["AMEL", "Airplane multi-engine land"],
  ["ASES", "Airplane single-engine sea"],
  ["AMES", "Airplane multi-engine sea"],
  ["RH", "Rotorcraft — helicopter"],
  ["RG", "Rotorcraft — gyroplane"],
  ["GL", "Glider"],
  ["PL", "Powered-lift"],
  ["LTA", "Lighter-than-air"],
];

export function categoryClassLabel(code: string): string {
  return CATEGORY_CLASSES.find(([c]) => c === code)?.[1] ?? code;
}

/** Characteristic flags: column, label, help text. */
export const AIRCRAFT_FLAGS: [string, string, string][] = [
  ["is_complex", "Complex", "Retractable gear, flaps, controllable prop (61.31(e))"],
  ["is_high_performance", "High Performance", "Engine over 200 hp (61.31(f))"],
  ["is_taa", "TAA", "Technically advanced: PFD/MFD + autopilot (61.129(j))"],
  ["is_tailwheel", "Tailwheel", "Conventional gear (61.31(i))"],
];
