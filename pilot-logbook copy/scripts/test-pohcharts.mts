// Tests for the PA-28-181 POH chart digitisation.
//
// The four figures each carry a worked example printed on the chart itself, so
// those are the primary oracle: if the traced curves are right, walking them
// with the example's inputs must land on the example's answer. Everything else
// checks that the surface behaves like the physics it represents.
//
// Run with: node scripts/test-pohcharts.mts
import { evaluateChart, chart, CHART_ORDER } from "../lib/pohcharts.ts";
import type { ChartId } from "../lib/pohcharts.ts";

let failures = 0;
function fail(name: string, detail: string) {
  failures++;
  console.error(`FAIL ${name}\n  ${detail}`);
}
function ok(name: string, extra = "") {
  console.log(`ok   ${name}${extra ? " (" + extra + ")" : ""}`);
}
function within(name: string, actual: number, expected: number, tolPct: number) {
  const err = ((actual - expected) / expected) * 100;
  if (Math.abs(err) > tolPct) fail(name, `expected ${expected} ±${tolPct}%, got ${Math.round(actual)} (${err.toFixed(1)}%)`);
  else ok(name, `${Math.round(actual)} vs ${expected}, ${err > 0 ? "+" : ""}${err.toFixed(1)}%`);
}
function must(name: string, cond: boolean, detail: string) {
  if (!cond) fail(name, detail); else ok(name);
}

const dist = (id: ChartId, pa: number, oat: number, weightLb: number, headwindKt: number) => {
  const r = evaluateChart(id, { pressureAltFt: pa, oatC: oat, weightLb, headwindKt });
  if (!r.ok) throw new Error(`${id} refused: ${r.reason}`);
  return r.distance;
};

// --- Each chart's own printed example ---
for (const id of CHART_ORDER) {
  const c = chart(id);
  const e = c.example;
  const r = evaluateChart(id, {
    pressureAltFt: e.pa, oatC: e.oat, weightLb: e.weight, headwindKt: e.wind,
  });
  if (!r.ok) fail(`${id} example`, r.reason);
  else within(`${id}: POH figure ${c.figure} worked example`, r.distance, e.expect, 3);
}

// --- Monotonicity: the surface has to slope the way the physics does ---
for (const id of CHART_ORDER) {
  const c = chart(id);
  const w = c.refWeight;
  const paMax = c.paCurves[c.paCurves.length - 1].pa;

  const byOat = [0, 10, 20, 30].map(t => dist(id, 0, t, w, 0));
  must(`${id}: hotter is longer`, byOat.every((v, i) => i === 0 || v > byOat[i - 1]), byOat.join(" "));

  const byPa = [0, 2000, 4000, paMax].map(a => dist(id, a, 15, w, 0));
  must(`${id}: higher is longer`, byPa.every((v, i) => i === 0 || v > byPa[i - 1]), byPa.join(" "));

  const byWt = [c.weights[0], (c.weights[0] + w) / 2, w].map(x => dist(id, 0, 15, x, 0));
  must(`${id}: heavier is longer`, byWt.every((v, i) => i === 0 || v > byWt[i - 1]), byWt.join(" "));

  const byWind = [0, 5, 10, 15].map(k => dist(id, 0, 15, w, k));
  must(`${id}: more headwind is shorter`, byWind.every((v, i) => i === 0 || v < byWind[i - 1]), byWind.join(" "));
}

// --- Ground roll must be shorter than the same case over a 50 ft barrier ---
for (const [roll, full] of [["takeoff-roll", "takeoff-50ft"], ["landing-roll", "landing-50ft"]] as [ChartId, ChartId][]) {
  for (const [pa, oat, w] of [[0, 15, 2550], [4000, 30, 2300], [2000, 0, 2400]] as [number, number, number][]) {
    const a = dist(roll, pa, oat, w, 0), b = dist(full, pa, oat, w, 0);
    must(`${roll} < ${full} at ${pa}ft/${oat}C/${w}lb`, a < b, `${Math.round(a)} vs ${Math.round(b)}`);
  }
}

// --- Refusals: the chart's edges are hard edges ---
const refuses = (name: string, id: ChartId, input: Parameters<typeof evaluateChart>[1], expect: RegExp) => {
  const r = evaluateChart(id, input);
  if (r.ok) fail(name, `expected a refusal, got ${Math.round(r.distance)} ft`);
  else if (!expect.test(r.reason)) fail(name, `reason did not match ${expect}: ${r.reason}`);
  else ok(name);
};
refuses("tailwind is refused, not guessed", "takeoff-roll",
  { pressureAltFt: 0, oatC: 15, weightLb: 2550, headwindKt: -5 }, /tailwind/i);
refuses("above the altitude range is refused", "takeoff-roll",
  { pressureAltFt: 12000, oatC: 15, weightLb: 2550, headwindKt: 0 }, /pressure altitude/i);
refuses("over gross is refused", "takeoff-roll",
  { pressureAltFt: 0, oatC: 15, weightLb: 2800, headwindKt: 0 }, /lb/);
refuses("beyond the wind axis is refused", "takeoff-roll",
  { pressureAltFt: 0, oatC: 15, weightLb: 2550, headwindKt: 25 }, /headwind/i);
refuses("hotter than ISA+35 is refused", "takeoff-roll",
  { pressureAltFt: 0, oatC: 55, weightLb: 2550, headwindKt: 0 }, /outside it/);
refuses("colder than ISA-15 is refused", "takeoff-roll",
  { pressureAltFt: 0, oatC: -10, weightLb: 2550, headwindKt: 0 }, /outside it/);

// The landing ground roll chart's envelope stops at ISA+30, not ISA+35.
refuses("landing roll stops at ISA+30", "landing-roll",
  { pressureAltFt: 0, oatC: 48, weightLb: 2550, headwindKt: 0 }, /outside it/);
must("landing roll accepts ISA+29", evaluateChart("landing-roll",
  { pressureAltFt: 0, oatC: 43, weightLb: 2550, headwindKt: 0 }).ok, "should be inside the envelope");

// --- Plausibility band: sea level, standard day, max gross, calm ---
// Not a POH figure to check against, just a guard against a gross mis-scaling.
const sl = (id: ChartId) => dist(id, 0, 15, chart(id).refWeight, 0);
must("takeoff ground roll is in a sane band", sl("takeoff-roll") > 700 && sl("takeoff-roll") < 1400, `${Math.round(sl("takeoff-roll"))} ft`);
must("takeoff over 50 ft is in a sane band", sl("takeoff-50ft") > 1400 && sl("takeoff-50ft") < 2600, `${Math.round(sl("takeoff-50ft"))} ft`);
must("landing ground roll is in a sane band", sl("landing-roll") > 550 && sl("landing-roll") < 1200, `${Math.round(sl("landing-roll"))} ft`);
must("landing over 50 ft is in a sane band", sl("landing-50ft") > 1100 && sl("landing-50ft") < 2000, `${Math.round(sl("landing-50ft"))} ft`);

console.log(failures ? `\n${failures} FAILURE(S)` : "\nAll POH chart tests passed");
if (failures) process.exit(1);
