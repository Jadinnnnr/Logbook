// Tests for the cruise tables, held to the numbers printed in figures 5-21,
// 5-23 and 5-25.
// Run with: node scripts/test-cruise.mts
import {
  CRUISE_TABLES, readCruise, deviationsAt, deviationLabel, legFor, ceilingFor, bracket, isaTempC,
} from "../lib/cruise.ts";

let failures = 0;
function near(name: string, actual: number, expected: number, tol = 0.0001) {
  if (Math.abs(actual - expected) <= tol) console.log(`ok   ${name} (${actual})`);
  else { failures++; console.error(`FAIL ${name}\n  expected ${expected} ±${tol}\n  actual   ${actual}`); }
}
function must(name: string, cond: boolean, detail = "") {
  if (cond) console.log(`ok   ${name}`);
  else { failures++; console.error(`FAIL ${name} ${detail}`); }
}
const ok = (p: number, a: number, d: number) => {
  const r = readCruise(p, a, d);
  if (!r.ok) throw new Error(`${p}% ${a}ft ISA${d}: ${r.reason}`);
  return r.reading;
};

// --- the tables came out of the PDF intact ---
must("all three figures are present",
  CRUISE_TABLES.map((t) => t.figure).join(",") === "5-21,5-23,5-25");
for (const t of CRUISE_TABLES) {
  must(`figure ${t.figure}: seven altitude blocks`, t.altitudes.length === 7);
  must(`figure ${t.figure}: every row has an RPM`,
    t.altitudes.every((a) => a.rows.every((r) => r.rpm > 1500 && r.rpm < 2800)));
  must(`figure ${t.figure}: every block prints TAS at both ends`,
    t.altitudes.every((a) => a.rows[0].ktas !== null && a.rows[a.rows.length - 1].ktas !== null));
  must(`figure ${t.figure}: °F agrees with °C throughout`,
    t.altitudes.every((a) => a.rows.every((r) => Math.abs(r.oatC * 9 / 5 + 32 - r.oatF) <= 0.6)));
  must(`figure ${t.figure}: the stated ISA deviation matches the lapse rate`,
    t.altitudes.every((a) => a.rows.every((r) => Math.abs(isaTempC(a.alt) + r.isaDev - r.oatC) <= 1.1)));
}

// --- on a published altitude, nothing is invented ---
//
// Interpolating altitude must not disturb the rows the book actually prints:
// landing exactly on one has to give back that row's RPM to the revolution.
let walked = 0, printedTas = 0;
for (const t of CRUISE_TABLES) {
  for (const block of t.altitudes) {
    for (const row of block.rows) {
      const r = ok(t.power, block.alt, row.isaDev);
      walked++;
      if (r.rpm !== row.rpm) {
        failures++;
        console.error(`FAIL ${t.figure} ${block.alt}ft ISA${row.isaDev}: RPM ${r.rpm} ≠ printed ${row.rpm}`);
      }
      if (r.between !== undefined) {
        failures++;
        console.error(`FAIL ${t.figure} ${block.alt}ft: a published altitude was read between two others`);
      }
      if (row.ktas !== null) {
        printedTas++;
        if (r.ktas !== row.ktas || !r.exact) {
          failures++;
          console.error(`FAIL ${t.figure} ${block.alt}ft ISA${row.isaDev}: TAS ${r.ktas} (exact=${r.exact}) ≠ printed ${row.ktas}`);
        }
      } else if (r.exact || !r.tasBetweenRows) {
        failures++;
        console.error(`FAIL ${t.figure} ${block.alt}ft ISA${row.isaDev}: unprinted TAS not marked`);
      }
    }
  }
}
must(`every published row still reads back exactly (${walked} of them)`, walked === 90, `${walked}`);
must(`the 42 printed TAS values come back as printed`, printedTas === 42, `${printedTas}`);

// --- entered altitudes, which is the point ---
const mid = ok(65, 7500, 0);
must("7,500 ft at 65% is read between 6,000 and 8,000",
  String(mid.between) === "6000,8000", String(mid.between));
must("...and is not claimed to be exact", !mid.exact);
const lo65 = ok(65, 6000, 0), hi65 = ok(65, 8000, 0);
must("...with an RPM between the two rows", mid.rpm > lo65.rpm && mid.rpm < hi65.rpm,
  `${lo65.rpm} < ${mid.rpm} < ${hi65.rpm}`);
must("...and a TAS between the two rows", mid.ktas > lo65.ktas && mid.ktas < hi65.ktas,
  `${lo65.ktas} < ${mid.ktas} < ${hi65.ktas}`);
near("...three quarters along, because 7,500 is three quarters of 6,000–8,000", mid.rpm,
  Math.round(lo65.rpm + (hi65.rpm - lo65.rpm) * 0.75), 0.51);

// Every VFR cruising altitude works at every power that reaches it.
for (const alt of [3500, 4500, 5500, 6500, 7500, 8500, 9500]) {
  for (const t of CRUISE_TABLES) {
    const r = readCruise(t.power, alt, 0);
    if (alt <= ceilingFor(t.power)) {
      must(`${t.power}% at ${alt.toLocaleString()} ft reads`, r.ok,
        r.ok ? "" : r.reason);
    } else {
      must(`${t.power}% at ${alt.toLocaleString()} ft is refused, not extrapolated`, !r.ok);
    }
  }
}

// A quarter of the way up should be a quarter of the way along.
const q = ok(55, 6500, 0), a6 = ok(55, 6000, 0), a8 = ok(55, 8000, 0);
near("6,500 ft sits a quarter between 6,000 and 8,000", q.rpm,
  Math.round(a6.rpm + (a8.rpm - a6.rpm) * 0.25), 0.51);

// --- what is on offer where ---
must("the deviations at a published altitude are that block's",
  deviationsAt(55, 0).join(",") === "-15,0,10,20,30", deviationsAt(55, 0).join(","));
must("7,000 ft at 75% offers exactly ISA-15, ISA and ISA+7.5",
  deviationsAt(75, 7000).join(",") === "-15,0,7.5", deviationsAt(75, 7000).join(","));
must("10,000 ft at 55% offers only ISA-15 and ISA",
  deviationsAt(55, 10000).join(",") === "-15,0");
// Between two altitudes, only what both print — 8,000 ft has no ISA+20, so
// 7,500 ft must not offer one either.
must("7,500 ft at 65% offers only what both 6,000 and 8,000 print",
  deviationsAt(65, 7500).join(",") === "-15,0,10", deviationsAt(65, 7500).join(","));
must("...and every one of them reads",
  deviationsAt(65, 7500).every((d) => readCruise(65, 7500, d).ok));
must("nothing is offered above a table's ceiling", deviationsAt(75, 9500).length === 0);

// --- refusals ---
const above = readCruise(75, 9500, 0);
must("above the ceiling is refused", !above.ok);
must("...and says why", !above.ok && above.reason.includes("only published to 7,000 ft"),
  above.ok ? "" : above.reason);
const offBand = readCruise(55, 10000, 30);
must("a deviation the block does not print is refused", !offBand.ok);
must("...and says the band narrows", !offBand.ok && offBand.reason.includes("narrows"));
must("an unpublished power is refused", !readCruise(70, 6000, 0).ok);
must("sea level brackets to itself", String(bracket(65, 0)?.map((b) => b.alt)) === "0,0");

// --- the worked example from the table ---
near("7,000 ft, 75%, ISA-15: TAS is printed", ok(75, 7000, -15).ktas, 123);
near("7,000 ft, 75%, ISA+7.5: TAS is printed", ok(75, 7000, 7.5).ktas, 125);
const seven = ok(75, 7000, 0);
must("7,000 ft, 75%, ISA: TAS is worked out along the block", seven.tasBetweenRows && !seven.exact);
must("...and lies between the printed ends", seven.ktas > 123 && seven.ktas < 125, `${seven.ktas}`);
near("...on the RPM the book prints", seven.rpm, 2625);

// --- labels and physics ---
must("a zero deviation is just ISA", deviationLabel(0) === "ISA");
must("a negative deviation uses a minus sign", deviationLabel(-15) === "ISA −15");
must("a fractional deviation keeps its half", deviationLabel(7.5) === "ISA +7.5");

for (const alt of [2500, 4500, 6500]) {
  const p55 = ok(55, alt, 0), p65 = ok(65, alt, 0);
  must(`at ${alt} ft: 65% is faster than 55%`, p65.ktas > p55.ktas);
  must(`at ${alt} ft: 65% turns faster`, p65.rpm > p55.rpm);
  must(`at ${alt} ft: 55% goes further on a gallon`, p55.nmPerGal > p65.nmPerGal);
}
for (const t of CRUISE_TABLES) {
  const low = ok(t.power, 0, 0), high = ok(t.power, ceilingFor(t.power), 0);
  must(`figure ${t.figure}: TAS rises with altitude at ISA`, high.ktas > low.ktas);
  must(`figure ${t.figure}: so does the RPM needed to hold the power`, high.rpm > low.rpm);
  must(`figure ${t.figure}: warm air needs more RPM`,
    ok(t.power, 2000, 20).rpm > ok(t.power, 2000, -15).rpm);
}
must("the temperature shown follows the entered altitude",
  Math.abs(ok(65, 7500, 10).oatC - (isaTempC(7500) + 10)) < 0.06,
  `${ok(65, 7500, 10).oatC}`);

// --- legs ---
const leg = legFor(ok(65, 6000, 0), 114);
near("114 nm at the 65% cruise speed takes about an hour", leg.hours, 1, 0.05);
near("...and burns about the hourly flow", leg.gallons, 9.5, 0.5);
near("a zero-length leg takes no fuel", legFor(ok(55, 0, 0), 0).gallons, 0);

console.log(failures === 0 ? "\nAll cruise tests passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
