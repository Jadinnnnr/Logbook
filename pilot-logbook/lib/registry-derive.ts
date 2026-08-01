/**
 * Pure shaping of an FAA registry row into form values. Separated from
 * lib/registry.ts (which is server-only and opens SQLite) so the rules can be
 * tested directly.
 */

export interface RegistryAircraft {
  tailNumber: string;
  makeModel: string;
  typeCode: string;
  categoryClass: string;
  horsepower: number | null;
  highPerformance: boolean;
  year: number | null;
}

export interface RegistryRow {
  make?: string | null;
  model?: string | null;
  cc?: string | null;
  hp?: number | null;
  year?: number | null;
}

/** 61.31(f): more than 200 horsepower. */
export const HIGH_PERFORMANCE_HP = 200;

/**
 * Best-effort ICAO-style type designator. The registry stores a manufacturer
 * and model but no type code, so this covers the common GA manufacturers and
 * returns "" rather than guessing when the shape isn't recognised — a blank
 * field is better than a wrong one the pilot doesn't notice.
 */
export function deriveTypeCode(make: string, model: string): string {
  const m = make.toUpperCase().trim();
  const mdl = model.toUpperCase().replace(/\s+/g, "");
  const grab = (re: RegExp) => mdl.match(re)?.[1] ?? "";

  if (m.startsWith("CESSNA")) {
    const d = grab(/^(\d{3})/);
    return d ? `C${d}` : "";
  }
  if (m.startsWith("PIPER")) {
    const d = grab(/^PA-?(\d{2})/);
    return d ? `PA${d}` : "";
  }
  if (m.startsWith("BEECH") || m.startsWith("RAYTHEON") || m.startsWith("HAWKER")) {
    const d = grab(/^(\d{2})/);
    return d ? `BE${d}` : "";
  }
  if (m.startsWith("MOONEY")) return mdl.startsWith("M20") ? "M20" : "";
  if (m.startsWith("CIRRUS")) {
    const d = grab(/^SR(\d{2})/);
    return d ? `SR${d}` : "";
  }
  if (m.startsWith("DIAMOND")) {
    const d = grab(/^DA-?(\d{2})/);
    return d ? `DA${d}` : "";
  }
  return "";
}

/** Normalise a typed tail number to the registry's form (no leading N). */
export function normalizeTail(rawTail: string): string | null {
  const tail = rawTail.trim().toUpperCase().replace(/^N/, "");
  return /^[0-9][0-9A-Z]{0,5}$/.test(tail) ? tail : null;
}

export function shapeRegistryRow(tail: string, row: RegistryRow): RegistryAircraft {
  const make = (row.make ?? "").trim();
  const model = (row.model ?? "").trim();
  const hp = typeof row.hp === "number" && row.hp > 0 ? row.hp : null;
  return {
    tailNumber: `N${tail}`,
    makeModel: [make, model].filter(Boolean).join(" "),
    typeCode: deriveTypeCode(make, model),
    categoryClass: row.cc ?? "",
    horsepower: hp,
    highPerformance: hp !== null && hp > HIGH_PERFORMANCE_HP,
    year: row.year ?? null,
  };
}
