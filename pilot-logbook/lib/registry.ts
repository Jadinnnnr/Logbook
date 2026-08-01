import "server-only";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { normalizeTail, shapeRegistryRow, RegistryAircraft, RegistryRow } from "./registry-derive.ts";

/**
 * Lookups against the FAA Aircraft Registration database, built into
 * data/faa-registry.db by scripts/build-registry.mjs. The file is optional:
 * without it every lookup returns null and the aircraft form simply behaves as
 * it did before, so a fresh clone works without the 73 MB download.
 */

export type { RegistryAircraft };

let cached: Database.Database | null | undefined;

function registryDb(): Database.Database | null {
  if (cached !== undefined) return cached;
  const file = path.join(process.cwd(), "data", "faa-registry.db");
  cached = fs.existsSync(file) ? new Database(file, { readonly: true, fileMustExist: true }) : null;
  return cached;
}

export function registryAvailable(): boolean {
  return registryDb() !== null;
}

export function lookupTailNumber(rawTail: string): RegistryAircraft | null {
  const db = registryDb();
  if (!db) return null;
  const tail = normalizeTail(rawTail);
  if (!tail) return null;

  const row = db
    .prepare(
      `SELECT a.make AS make, a.model AS model, a.category_class AS cc,
              e.horsepower AS hp, r.year AS year
         FROM registry r
         LEFT JOIN acftref a ON a.code = r.mdl_code
         LEFT JOIN engine e ON e.code = r.eng_code
        WHERE r.n_number = ?`
    )
    .get(tail) as RegistryRow | undefined;
  return row ? shapeRegistryRow(tail, row) : null;
}
