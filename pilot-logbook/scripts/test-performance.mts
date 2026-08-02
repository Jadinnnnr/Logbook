// Tests for the standard-atmosphere maths and the AFM/POH interpolation.
// Run with: node scripts/test-performance.mts
import {
  pressureAltitude,
  isaTempC,
  densityAltitude,
  windComponents,
  runwayHeadingFromIdent,
  interpolatePoh,
  applyCorrections,
} from "../lib/performance.ts";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.error(`FAIL ${name}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok   ${name}`);
  }
}
function near(name: string, actual: number, expected: number, tol: number) {
  const ok = Math.abs(actual - expected) <= tol;
  if (!ok) {
    failures++;
    console.error(`FAIL ${name}\n  expected ${expected} ±${tol}\n  actual   ${actual}`);
  } else {
    console.log(`ok   ${name} (${Math.round(actual * 10) / 10})`);
  }
}

// --- Pressure altitude ---
near("standard setting leaves elevation alone", pressureAltitude(1000, 29.92126), 1000, 0.5);
// The taught rule of thumb: about 1,000 ft per inch of mercury near sea level.
near("low setting raises PA ~1000 ft per inch", pressureAltitude(0, 28.92), 935, 25);
near("high setting lowers PA", pressureAltitude(0, 30.92), -905, 25);
near("KMLB-ish field, 30.02", pressureAltitude(33, 30.02), -58, 20);

// --- ISA ---
near("ISA at sea level", isaTempC(0), 15, 0.01);
near("ISA at 5,000 ft", isaTempC(5000), 5.1, 0.01);

// --- Density altitude ---
near("standard day DA equals PA", densityAltitude(0, 15), 0, 15);
near("standard day at 5,000 ft", densityAltitude(5000, 5.1), 5000, 40);
// The classic worked example: 6,000 ft PA at 30 °C is roughly 9,000 ft DA.
near("hot and high", densityAltitude(6000, 30), 9000, 200);
near("cold day is below field", densityAltitude(0, -10), -2900, 250);

// --- Wind components ---
check("straight down the runway", windComponents(90, 90, 20), {
  headwind: 20, crosswind: 0, from: "none", angle: 0,
});
const tail = windComponents(90, 270, 15);
near("direct tailwind is negative headwind", tail.headwind, -15, 0.001);
check("direct tailwind has no crosswind side", tail.from, "none");
const right = windComponents(360, 90, 10);
near("90 off the right is all crosswind", right.crosswind, 10, 0.001);
near("...and no headwind", right.headwind, 0, 0.001);
check("...from the right", right.from, "right");
check("270 wind on runway 36 comes from the left", windComponents(360, 270, 10).from, "left");
// 30° off: the standard "half the wind is crosswind" mental model.
const thirty = windComponents(90, 120, 20);
near("30 degrees off gives half crosswind", thirty.crosswind, 10, 0.01);
near("30 degrees off keeps 87% headwind", thirty.headwind, 17.32, 0.01);
// Wrapping across north must not blow up the angle.
check("wrap across north", windComponents(10, 350, 12).angle, 20);
check("wrap across north comes from the left", windComponents(10, 350, 12).from, "left");

// --- Runway numbers ---
check("runway 9", runwayHeadingFromIdent("9"), 90);
check("runway 27L", runwayHeadingFromIdent("27L"), 270);
check("runway 36", runwayHeadingFromIdent("36"), 360);
check("water lane is not a heading", runwayHeadingFromIdent("W1"), null);
check("runway 41 is not real", runwayHeadingFromIdent("41"), null);

// --- POH interpolation ---
const corners = {
  paLow: 2000, paHigh: 4000, tempLow: 10, tempHigh: 30,
  lowLow: 1000, lowHigh: 1200, highLow: 1400, highHigh: 1800,
};
const mid = interpolatePoh(corners, 3000, 20);
check("midpoint of all four corners", mid.ok && Math.round(mid.distance), 1350);
const corner = interpolatePoh(corners, 2000, 10);
check("exact corner returns that corner", corner.ok && corner.distance, 1000);
const edge = interpolatePoh(corners, 4000, 20);
check("along the upper altitude row", edge.ok && edge.distance, 1600);
check(
  "outside the altitude bracket is refused, not extrapolated",
  interpolatePoh(corners, 6000, 20).ok,
  false
);
check("outside the temperature bracket is refused", interpolatePoh(corners, 3000, 40).ok, false);
check(
  "identical altitudes are refused",
  interpolatePoh({ ...corners, paHigh: 2000 }, 2000, 20).ok,
  false
);
check(
  "a blank cell is refused",
  interpolatePoh({ ...corners, highHigh: NaN }, 3000, 20).ok,
  false
);

// --- Corrections compound, in the order the AFM lists them ---
near("two corrections compound", applyCorrections(1000, [15, 10]), 1265, 0.001);
near("no corrections leaves it alone", applyCorrections(1000, []), 1000, 0.001);
near("a negative correction shortens it", applyCorrections(1000, [-10]), 900, 0.001);

console.log(failures ? `\n${failures} FAILURE(S)` : "\nAll performance tests passed");
if (failures) process.exit(1);
