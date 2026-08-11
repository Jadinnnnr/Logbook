import data from "./pa28-181-charts.ts";

/**
 * The PA-28-181 takeoff and landing charts, digitised from the aircraft's own
 * POH (Piper report VB-2960, issued 16 November 2020, Section 5 — figures 5-7,
 * 5-11, 5-41 and 5-43).
 *
 * The charts in that book are graphical nomograms: three stacked panels that
 * you walk through with a pencil — pressure altitude against temperature, then
 * weight, then wind. `lib/pa28-181-charts.json` holds the curve families traced
 * off those figures, and the functions here walk them the same way, so a result
 * should land where a careful pencil lands. It is a transcription of the
 * manufacturer's data, not a performance model: nothing here is extrapolated
 * past the printed envelope, and out-of-range inputs are refused rather than
 * guessed at.
 *
 * Each chart's own worked example is reproduced to within about 2% — see
 * scripts/test-pohcharts.mts.
 */

export interface PohChart {
  id: string;
  title: string;
  flaps: string;
  page: number;
  figure: string;
  oats: number[];
  paCurves: { pa: number; minOat: number; maxOat: number; d: number[] }[];
  weights: number[];
  weightGuides: number[][];
  winds: number[];
  windGuides: number[][];
  refWeight: number;
  example: { pa: number; oat: number; weight: number; wind: number; expect: number };
}

const CHARTS = data as unknown as Record<string, PohChart>;

export const AIRCRAFT_LABEL = "PA-28-181 (Piper Archer)";
export const SOURCE_LABEL =
  "PA-28-181 POH, Piper report VB-2960, issued 16 Nov 2020 — Section 5, figures 5-7, 5-11, 5-41 and 5-43";

export type ChartId = "takeoff-roll" | "takeoff-50ft" | "landing-roll" | "landing-50ft";

export const CHART_ORDER: ChartId[] = [
  "takeoff-roll",
  "takeoff-50ft",
  "landing-roll",
  "landing-50ft",
];

export function chart(id: ChartId): PohChart {
  return CHARTS[id];
}

/** Linear interpolation on a sorted x table, clamped at both ends. */
function interp(xs: number[], ys: number[], x: number): number {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  let i = 0;
  while (i < xs.length - 2 && xs[i + 1] < x) i++;
  const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
  return ys[i] + t * (ys[i + 1] - ys[i]);
}

/**
 * Walk a guide family: enter at `dIn` on the family's reference line, come out
 * at `target` on the value axis. Between guides the position is held
 * proportional, which is what following the printed curve by eye does.
 */
function followGuides(guides: number[][], axisVals: number[], dIn: number, fromIdx: number, target: number): number {
  const entry = guides.map(g => g[fromIdx]);
  if (entry.length < 2) return dIn;
  let i = 0;
  while (i < entry.length - 2 && entry[i + 1] < dIn) i++;
  const span = entry[i + 1] - entry[i];
  const t = span === 0 ? 0 : (dIn - entry[i]) / span;
  const a = interp(axisVals, guides[i], target);
  const b = interp(axisVals, guides[i + 1], target);
  return a + t * (b - a);
}

export interface PohInput {
  pressureAltFt: number;
  oatC: number;
  weightLb: number;
  /** Headwind component in knots. Tailwind is not supported — see `refusal`. */
  headwindKt: number;
}

export type PohResult =
  | { ok: true; distance: number; refDistance: number; afterWeight: number; notes: string[] }
  | { ok: false; reason: string };

/** Standard-atmosphere temperature, for the ISA-deviation envelope. */
function isaAt(pressureAltFt: number): number {
  return 15 - 1.98 * (pressureAltFt / 1000);
}

export function evaluateChart(id: ChartId, input: PohInput): PohResult {
  const c = chart(id);
  const { pressureAltFt: pa, oatC: oat, weightLb: weight, headwindKt: wind } = input;

  if (![pa, oat, weight, wind].every(Number.isFinite)) {
    return { ok: false, reason: "Fill in pressure altitude, temperature, weight, and wind." };
  }
  if (wind < 0) {
    return {
      ok: false,
      reason:
        "The chart's tailwind curves are dashed and too sparse to trace reliably, so they aren't included. Read figure " +
        c.figure + " in the POH for a tailwind.",
    };
  }

  const levels = c.paCurves.map(p => p.pa);
  const paMin = levels[0], paMax = levels[levels.length - 1];
  if (pa < paMin - 1 || pa > paMax + 1) {
    return {
      ok: false,
      reason: `Figure ${c.figure} covers ${paMin.toLocaleString()}–${paMax.toLocaleString()} ft pressure altitude; ${Math.round(pa).toLocaleString()} ft is off the chart.`,
    };
  }
  const wMin = c.weights[0], wMax = c.weights[c.weights.length - 1];
  if (weight < wMin - 1 || weight > wMax + 1) {
    return {
      ok: false,
      reason: `Figure ${c.figure} covers ${wMin.toLocaleString()}–${wMax.toLocaleString()} lb; ${Math.round(weight).toLocaleString()} lb is off the chart.`,
    };
  }
  const windMax = c.winds[c.winds.length - 1];
  if (wind > windMax) {
    return { ok: false, reason: `Figure ${c.figure} stops at ${windMax} kt of headwind.` };
  }

  // The printed envelope runs from ISA-15 to ISA+35 (ISA+30 on the landing
  // ground roll). Outside it the book gives no answer, so neither do we.
  const isa = isaAt(pa);
  const devLo = c.paCurves[0].minOat - isaAt(c.paCurves[0].pa);
  const devHi = c.paCurves[0].maxOat - isaAt(c.paCurves[0].pa);
  if (oat < isa + devLo - 0.5 || oat > isa + devHi + 0.5) {
    return {
      ok: false,
      reason: `At ${Math.round(pa).toLocaleString()} ft the chart runs from ${Math.round(isa + devLo)} °C to ${Math.round(isa + devHi)} °C (ISA${devLo} to ISA+${devHi}); ${Math.round(oat)} °C is outside it.`,
    };
  }

  // Panel 1 — pressure altitude against temperature, at max weight and no wind.
  const perLevel = c.paCurves.map(p => interp(c.oats, p.d, oat));
  const refDistance = interp(levels, perLevel, pa);

  // Panel 2 — weight, entered on the max-weight reference line.
  const afterWeight = followGuides(c.weightGuides, c.weights, refDistance, c.weights.length - 1, weight);

  // Panel 3 — headwind, entered on the zero-wind reference line.
  const distance = followGuides(c.windGuides, c.winds, afterWeight, 0, wind);

  const notes: string[] = [];
  if (id.startsWith("takeoff")) notes.push("Flaps up, full throttle before brake release, paved level dry runway.");
  else notes.push("Power-off approach, 40° flaps, 66 KIAS, full-stall touchdown, maximum braking, paved level dry runway.");

  return { ok: true, distance, refDistance, afterWeight, notes };
}
