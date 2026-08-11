import "server-only";
// Shape and progress maths live in a module the browser can also import.
export type { RefreshStep, RefreshStatus } from "./refreshshape.ts";
export { refreshFraction } from "./refreshshape.ts";
import type { RefreshStatus } from "./refreshshape.ts";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

/**
 * Freshness of the generated datasets, and the state of any refresh currently
 * running. Everything here degrades quietly when a file is missing.
 */

export interface DatasetStatus {
  key: string;
  label: string;
  present: boolean;
  builtAt: string | null;
  detail: string;
  /** Nominal shelf life; charts follow the 28-day cycle, the rest drift. */
  staleAfterDays: number;
  /**
   * Set when a dataset was built but is missing pieces — eCFR refusing a part,
   * say. A partial database is the dangerous case: it looks complete, and
   * searching it for something in the missing part returns nothing at all,
   * which reads exactly like the regulation not existing.
   */
  incomplete?: string;
}



function readMeta(file: string): Record<string, string> {
  const full = path.join(process.cwd(), "data", file);
  if (!fs.existsSync(full)) return {};
  try {
    const db = new Database(full, { readonly: true, fileMustExist: true });
    const rows = db.prepare("SELECT key, value FROM meta").all() as { key: string; value: string }[];
    db.close();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  } catch {
    // A database built before the meta table existed.
    return {};
  }
}

function exists(file: string): boolean {
  return fs.existsSync(path.join(process.cwd(), "data", file));
}

export function datasetStatuses(): DatasetStatus[] {
  const airports = readMeta("airports.db");
  const reference = readMeta("reference.db");
  const registry = readMeta("faa-registry.db");
  return [
    {
      key: "airports",
      label: "Airport data",
      present: exists("airports.db"),
      builtAt: airports.built_at ?? null,
      detail: [
        airports.airports && `${Number(airports.airports).toLocaleString()} airports`,
        airports.dtpp_cycle && `chart cycle ${airports.dtpp_cycle}`,
      ].filter(Boolean).join(" · "),
      staleAfterDays: 28,
    },
    {
      key: "reference",
      label: "FAR / AIM",
      present: exists("reference.db"),
      builtAt: reference.built_at ?? null,
      detail: [
        reference.far_sections && `${reference.far_sections} FAR sections`,
        reference.aim_entries && `${reference.aim_entries} AIM entries`,
        reference.cfr_date && `eCFR ${reference.cfr_date}`,
      ].filter(Boolean).join(" · "),
      staleAfterDays: 90,
      incomplete: reference.skipped_parts
        ? `14 CFR ${reference.skipped_parts.split(",").join(", ")} ` +
          `${reference.skipped_parts.includes(",") ? "are" : "is"} missing — eCFR wouldn't ` +
          `serve ${reference.skipped_parts.includes(",") ? "them" : "it"} when this was built. ` +
          `Searching those parts will find nothing. Refresh again to try for them.`
        : undefined,
    },
    {
      key: "registry",
      label: "Aircraft registry",
      present: exists("faa-registry.db"),
      builtAt: registry.built_at ?? null,
      detail: registry.registrations
        ? `${Number(registry.registrations).toLocaleString()} registrations`
        : "",
      staleAfterDays: 90,
    },
  ];
}

export function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function refreshStatus(): RefreshStatus | null {
  const file = path.join(process.cwd(), "data", "refresh-status.json");
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as RefreshStatus;
  } catch {
    return null;
  }
}

/** True while a refresh is in flight, so the button can be disabled. */
export function refreshRunning(): boolean {
  const status = refreshStatus();
  if (status?.state !== "running") return false;
  // A crashed run would otherwise wedge the button forever.
  const startedMinutesAgo = (Date.now() - new Date(status.startedAt).getTime()) / 60000;
  return startedMinutesAgo < 45;
}
