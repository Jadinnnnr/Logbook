// Tests for the climb and descent readings, held to the worked examples printed
// on figures 5-17 and 5-37.
// Run with: node scripts/test-climbdescent.mts
import {
  computeClimbDescent, readChart, solve, zeroReading, lapsed,
  CLIMB_CHART, DESCENT_CHART, CHARTS,
} from "../lib/climbdescent.ts";

let failures = 0;
function near(name: string, actual: number, expected: number, tol = 0.0001) {
  if (Math.abs(actual - expected) <= tol) console.log(`ok   ${name} (${actual})`);
  else { failures++; console.error(`FAIL ${name}\n  expected ${expected} ±${tol}\n  actual   ${actual}`); }
}
function must(name: string, cond: boolean, detail = "") {
  if (cond) console.log(`ok   ${name}`);
  else { failures++; console.error(`FAIL ${name} ${detail}`); }
}

// --- reading the charts ---
//
// Piper printed their own readings rounded to whole units, so the tolerance
// here is the rounding, not the digitisation. Where the chart also draws the
// construction line for its example, the traced curves agree with it far more
// closely than this: on 5-17 the cruise time and fuel land on Piper's drop lines
// exactly, and the entry point within half a pixel of the line they drew.
for (const chart of CHARTS) {
  const { field, cruise, printed, answer } = chart.example;
  const got = solve(chart, field, cruise);

  near(`figure ${chart.figure}: cruise time`, got.cruise.timeMin, printed.cruise.timeMin, 0.7);
  near(`figure ${chart.figure}: cruise fuel`, got.cruise.fuelGal, printed.cruise.fuelGal, 0.35);
  near(`figure ${chart.figure}: cruise distance`, got.cruise.distanceNm, printed.cruise.distanceNm, 1.1);
  near(`figure ${chart.figure}: airport time`, got.field.timeMin, printed.field.timeMin, 0.7);
  near(`figure ${chart.figure}: airport fuel`, got.field.fuelGal, printed.field.fuelGal, 0.35);
  near(`figure ${chart.figure}: airport distance`, got.field.distanceNm, printed.field.distanceNm, 1.1);

  near(`figure ${chart.figure}: time to ${chart.phase}`, got.result.timeMin, answer.timeMin, 1.3);
  near(`figure ${chart.figure}: fuel to ${chart.phase}`, got.result.fuelGal, answer.fuelGal, 0.4);
  near(`figure ${chart.figure}: distance to ${chart.phase}`, got.result.distanceNm, answer.distanceNm, 1.3);

  must(`figure ${chart.figure}: the example reads cleanly`,
    got.result.warnings.every((w) => w.includes("start, taxi")),
    got.result.warnings.join(" | "));
}

// Every reading must grow with altitude at a fixed temperature. An altitude
// curve traced out of order — the failure this digitisation is most exposed to,
// since the curves are unlabelled once the text is stripped — would show up here
// as a fold in the family and nowhere else.
for (const chart of CHARTS) {
  let bad = "";
  let prev = readChart(chart.data, { pressureAlt: 0, oatC: 15 });
  for (let alt = 500; alt <= chart.data.altitudes.at(-1)!.alt; alt += 500) {
    const here = readChart(chart.data, { pressureAlt: alt, oatC: 15 });
    if (here.timeMin <= prev.timeMin || here.fuelGal <= prev.fuelGal ||
        here.distanceNm <= prev.distanceNm) { bad = `at ${alt} ft`; break; }
    prev = here;
  }
  must(`figure ${chart.figure}: readings increase all the way up the chart`, !bad, bad);
}

// The two charts lean opposite ways, and this is drawn into them: on 5-17 the
// altitude curves rise to the right, on 5-37 they fall. Warm air costs climb
// performance, but at a fixed RPM and airspeed it steepens the descent, so a
// warm day is a longer climb and a shorter descent.
const climbCold = readChart(CLIMB_CHART.data, { pressureAlt: 6000, oatC: -5 });
const climbWarm = readChart(CLIMB_CHART.data, { pressureAlt: 6000, oatC: 25 });
must("a warm day is a longer climb", climbWarm.timeMin > climbCold.timeMin);
must("...and a further one", climbWarm.distanceNm > climbCold.distanceNm);

const descCold = readChart(DESCENT_CHART.data, { pressureAlt: 6000, oatC: -5 });
const descWarm = readChart(DESCENT_CHART.data, { pressureAlt: 6000, oatC: 25 });
must("a warm day is a shorter descent", descWarm.timeMin < descCold.timeMin);
must("...and a nearer one", descWarm.distanceNm < descCold.distanceNm);

// --- off the edge of the printed chart ---
const tooHigh = readChart(CLIMB_CHART.data, { pressureAlt: 15000, oatC: 0 });
must("above the top of the chart is flagged",
  tooHigh.warnings.some((w) => w.includes("off the chart")), tooHigh.warnings.join(" | "));
near("...and clamped to the top curve", tooHigh.timeMin,
  readChart(CLIMB_CHART.data, { pressureAlt: 12000, oatC: 0 }).timeMin);

const tooHot = readChart(CLIMB_CHART.data, { pressureAlt: 6000, oatC: 60 });
must("a temperature off the chart is flagged",
  tooHot.warnings.some((w) => w.includes("outside the temperatures")), tooHot.warnings.join(" | "));

must("sea level reads below the lowest drawn curve",
  readChart(CLIMB_CHART.data, { pressureAlt: 0, oatC: 15 }).timeMin <
  readChart(CLIMB_CHART.data, { pressureAlt: 1000, oatC: 15 }).timeMin);

// --- the two charts are genuinely different ---
must("the two examples are different flights",
  CLIMB_CHART.example.cruise.pressureAlt !== DESCENT_CHART.example.field.pressureAlt);
must("climb is the one with the start/taxi allowance",
  (CLIMB_CHART.note ?? "").includes("start, taxi") && DESCENT_CHART.note === undefined);
must("the descent chart tops out lower than the climb chart",
  DESCENT_CHART.data.altitudes.at(-1)!.alt < CLIMB_CHART.data.altitudes.at(-1)!.alt);

// --- the subtraction never flips ---
const descent = solve(DESCENT_CHART, DESCENT_CHART.example.field, DESCENT_CHART.example.cruise);
must("descending still reads cruise minus airport", descent.result.timeMin > 0);

// --- guards ---
const empty = computeClimbDescent(zeroReading(), zeroReading(), "climb");
near("nothing entered gives nothing", empty.timeMin, 0);
must("...and says nothing", empty.warnings.length === 0);

const swapped = computeClimbDescent(
  CLIMB_CHART.example.printed.field, CLIMB_CHART.example.printed.cruise, "climb");
must("readings entered the wrong way round are flagged",
  swapped.warnings.some((w) => w.includes("swapped")), swapped.warnings.join(" | "));
must("...and the answer really is negative", swapped.timeMin < 0);

must("the climb allowance is called out",
  computeClimbDescent(CLIMB_CHART.example.printed.cruise, CLIMB_CHART.example.printed.field, "climb")
    .warnings.some((w) => w.includes("start, taxi and takeoff")));
must("...but not on the descent",
  !computeClimbDescent(DESCENT_CHART.example.printed.cruise, DESCENT_CHART.example.printed.field, "descent")
    .warnings.some((w) => w.includes("start, taxi")));

// Fuel is a tenth-of-a-gallon quantity on these charts; rounding must not eat it.
near("a tenth of a gallon survives",
  computeClimbDescent({ timeMin: 0, fuelGal: 3.2, distanceNm: 0 },
                      { timeMin: 0, fuelGal: 1.3, distanceNm: 0 }, "descent").fuelGal, 1.9);

// --- standard lapse rate ---
near("2 °C per thousand feet, going up", lapsed(23, 2000, 6000), 15);
near("...and coming down", lapsed(15, 6000, 2000), 23);
near("staying put changes nothing", lapsed(15, 6000, 6000), 15);

console.log(failures === 0 ? "\nAll climb/descent tests passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
