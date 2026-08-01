import "server-only";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

/**
 * Airport reference data for the contiguous US, built into data/airports.db by
 * scripts/build-airportdata.mjs. Optional: without the file the dashboard
 * explains how to build it instead of erroring.
 */

export interface AirportSummary {
  ident: string;
  name: string;
  city: string;
  region: string;
  type: string;
}

export interface Runway {
  le_ident: string;
  he_ident: string;
  length_ft: number | null;
  width_ft: number | null;
  surface: string;
  lighted: number;
  le_heading: number | null;
  he_heading: number | null;
}

export interface Frequency {
  type: string;
  description: string;
  mhz: string;
}

export interface Chart {
  code: string;
  name: string;
  url: string;
}

export interface AirportDetail extends AirportSummary {
  cs_volume: string | null;
  csUrl: string | null;
  lat: number;
  lon: number;
  elev_ft: number | null;
  fuel: string | null;
  airframe_repair: string | null;
  powerplant_repair: string | null;
  runways: Runway[];
  frequencies: Frequency[];
  approaches: Chart[];
  diagram: Chart | null;
}

let cached: Database.Database | null | undefined;

function airportDb(): Database.Database | null {
  if (cached !== undefined) return cached;
  const file = path.join(process.cwd(), "data", "airports.db");
  cached = fs.existsSync(file) ? new Database(file, { readonly: true, fileMustExist: true }) : null;
  return cached;
}

export function airportDataAvailable(): boolean {
  return airportDb() !== null;
}

export function airportCount(): number {
  const db = airportDb();
  if (!db) return 0;
  return (db.prepare("SELECT COUNT(*) AS c FROM airports").get() as { c: number }).c;
}

/** Identifier, name, or city — so "palo alto" and "KPAO" both work. */
export function searchAirports(query: string, limit = 12): AirportSummary[] {
  const db = airportDb();
  const q = query.trim();
  if (!db || q.length < 2) return [];
  const like = `%${q}%`;
  const upper = q.toUpperCase();
  return db
    .prepare(
      `SELECT ident, name, city, region, type FROM airports
        WHERE ident = ? OR local_code = ? OR ident LIKE ? OR local_code LIKE ?
              OR name LIKE ? OR city LIKE ?
        ORDER BY
          CASE WHEN ident = ? OR local_code = ? THEN 0
               WHEN ident LIKE ? OR local_code LIKE ? THEN 1 ELSE 2 END,
          CASE type WHEN 'large_airport' THEN 0 WHEN 'medium_airport' THEN 1
                    WHEN 'small_airport' THEN 2 ELSE 3 END,
          name
        LIMIT ?`
    )
    .all(upper, upper, `${upper}%`, `${upper}%`, like, like, upper, upper, `${upper}%`, `${upper}%`, limit) as AirportSummary[];
}

export function airportDetail(ident: string): AirportDetail | null {
  const db = airportDb();
  if (!db) return null;
  const key = ident.trim().toUpperCase();
  const row = db
    .prepare(
      `SELECT ident, name, city, region, type, lat, lon, elev_ft,
              fuel, airframe_repair, powerplant_repair, cs_volume
         FROM airports WHERE ident = ? OR local_code = ? LIMIT 1`
    )
    .get(key, key) as
      | Omit<AirportDetail, "runways" | "frequencies" | "approaches" | "diagram" | "csUrl">
      | undefined;
  if (!row) return null;

  const runways = db
    .prepare("SELECT * FROM runways WHERE ident = ? ORDER BY length_ft DESC")
    .all(row.ident) as Runway[];
  const frequencies = db
    .prepare("SELECT type, description, mhz FROM freqs WHERE ident = ? ORDER BY type")
    .all(row.ident) as Frequency[];
  const charts = db
    .prepare("SELECT code, name, url FROM charts WHERE ident = ? ORDER BY name")
    .all(row.ident) as Chart[];

  return {
    ...row,
    csUrl: chartSupplementUrl(row.cs_volume),
    runways,
    frequencies,
    approaches: charts.filter((c) => c.code === "IAP"),
    diagram: charts.find((c) => c.code === "APD") ?? null,
  };
}

/** Metadata written by the build script (chart cycle, CS edition, build time). */
function meta(key: string): string | null {
  const db = airportDb();
  if (!db) return null;
  try {
    const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * The FAA publishes the Chart Supplement as one PDF per volume per 56-day
 * edition, so an airport links to the volume that covers it.
 */
export function chartSupplementUrl(volume: string | null): string | null {
  const edition = meta("cs_effective");
  if (!volume || !edition) return null;
  return `https://aeronav.faa.gov/Upload_313-d/supplements/CS_${volume}_${edition}.pdf`;
}

export function chartSupplementEdition(): string | null {
  const raw = meta("cs_effective");
  if (!raw || raw.length !== 8) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

/** Fuel codes in NASR are terse; spell out the common ones. */
export function fuelLabel(code: string): string {
  const map: Record<string, string> = {
    "100": "100 octane",
    "100LL": "100LL",
    A: "Jet A",
    A1: "Jet A-1",
    "A1+": "Jet A-1+",
    "A+": "Jet A+",
    MOGAS: "MOGAS",
    UL94: "UL94",
    "115": "115 octane",
    B: "Jet B",
    J8: "JP-8",
  };
  return map[code.toUpperCase()] ?? code;
}
