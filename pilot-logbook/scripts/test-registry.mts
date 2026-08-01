// Tests the FAA registry autofill: tail normalisation, type-code derivation,
// the 61.31(f) horsepower threshold, and a live query against the built
// database when it exists. Run with: node scripts/test-registry.mts
import fs from "fs";
import { createRequire } from "module";
import {
  deriveTypeCode,
  normalizeTail,
  shapeRegistryRow,
} from "../lib/registry-derive.ts";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures++;
    console.error(`FAIL ${name}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

// --- Tail normalisation: the registry stores N-numbers without the N. ---
check("strips the leading N", normalizeTail("N738GB"), "738GB");
check("accepts lowercase", normalizeTail("n738gb"), "738GB");
check("accepts a bare number", normalizeTail("4521B"), "4521B");
check("rejects a non-US style callsign", normalizeTail("G-ABCD"), null);
check("rejects empty", normalizeTail(""), null);

// --- Type codes: recognised makes only, blank rather than a wrong guess. ---
check("Cessna 172N", deriveTypeCode("CESSNA", "172N"), "C172");
check("Cessna 182T", deriveTypeCode("CESSNA", "182T"), "C182");
check("Piper PA-28-181", deriveTypeCode("PIPER", "PA-28-181"), "PA28");
check("Piper PA-18-150", deriveTypeCode("PIPER", "PA-18-150"), "PA18");
check("Beech 58", deriveTypeCode("BEECH", "58"), "BE58");
check("Cirrus SR22", deriveTypeCode("CIRRUS DESIGN CORP", "SR22"), "SR22");
check("Diamond DA40", deriveTypeCode("DIAMOND AIRCRAFT IND INC", "DA40 F"), "DA40");
check("Mooney M20J", deriveTypeCode("MOONEY", "M20J"), "M20");
check("unknown make yields blank", deriveTypeCode("VANS", "RV-7"), "");
check("unrecognised Cessna model yields blank", deriveTypeCode("CESSNA", "LC41-550FG"), "");

// --- The 61.31(f) threshold is "more than 200 hp", so 200 itself is not. ---
const shape = (hp: number | null) =>
  shapeRegistryRow("738GB", { make: "CESSNA", model: "172N", cc: "ASEL", hp, year: 1977 });
check("180 hp is not high performance", shape(180).highPerformance, false);
check("exactly 200 hp is not high performance", shape(200).highPerformance, false);
check("201 hp is high performance", shape(201).highPerformance, true);
check("unknown hp is not high performance", shape(null).highPerformance, false);
check("hp of 0 reads as unknown", shape(0).horsepower, null);
check("tail number is returned with its N", shape(180).tailNumber, "N738GB");

// --- Live check against the built database, when present. ---
const dbPath = "data/faa-registry.db";
if (!fs.existsSync(dbPath)) {
  console.log("\n(skipping live registry checks — data/faa-registry.db not built)");
} else {
  const require = createRequire(import.meta.url);
  const Database = require("better-sqlite3");
  const db = new Database(dbPath, { readonly: true });
  const stmt = db.prepare(
    `SELECT a.make AS make, a.model AS model, a.category_class AS cc,
            e.horsepower AS hp, r.year AS year
       FROM registry r
       LEFT JOIN acftref a ON a.code = r.mdl_code
       LEFT JOIN engine e ON e.code = r.eng_code
      WHERE r.n_number = ?`
  );
  const live = (tail: string) => {
    const t = normalizeTail(tail)!;
    const row = stmt.get(t);
    return row ? shapeRegistryRow(t, row) : null;
  };

  const c172 = live("N738GB")!;
  check("live N738GB make/model", c172.makeModel, "CESSNA 172N");
  check("live N738GB class", c172.categoryClass, "ASEL");
  check("live N738GB is not high performance", c172.highPerformance, false);

  const c180 = live("N4521B")!;
  check("live N4521B is high performance (230 hp)", c180.highPerformance, true);

  check("an unregistered tail returns null", live("N99999Z"), null);
  db.close();
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nAll registry tests passed");
if (failures) process.exit(1);
