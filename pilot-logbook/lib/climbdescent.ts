/**
 * Time, fuel, and distance to climb and to descend — PA-28-181, figures 5-17
 * and 5-37.
 *
 * Both charts are nomograms and both are read the same way. Enter at the
 * outside air temperature, go up to the pressure altitude curve, then straight
 * across to each of the three panel curves, and drop down to read time, fuel and
 * distance. That horizontal leg is what links the four scales together, so a
 * single shared coordinate carries the reading from the carpet into each panel;
 * `lib/pa28-181-climbdescent.ts` holds the traced curves in those terms.
 *
 * You do that twice — once at cruise altitude, once at the airport — and
 * subtract. The worked example printed on each figure does exactly that, and
 * those examples are what the tests hold this to.
 */

import {
  CLIMB_DATA, DESCENT_DATA, type ChartData,
} from "./pa28-181-climbdescent.ts";

/** One reading off a chart, at one pressure altitude and temperature. */
export interface Reading {
  timeMin: number;
  fuelGal: number;
  distanceNm: number;
}

/** Where you are entering the chart. */
export interface Entry {
  pressureAlt: number;
  oatC: number;
}

export interface ChartReading extends Reading {
  warnings: string[];
}

export interface ClimbDescentResult {
  timeMin: number;
  fuelGal: number;
  distanceNm: number;
  /** Anything that makes the answer suspect. */
  warnings: string[];
}

export type Phase = "climb" | "descent";

export const zeroReading = (): Reading => ({ timeMin: 0, fuelGal: 0, distanceNm: 0 });

const round = (v: number, places: number) => {
  const f = 10 ** places;
  return Math.round(v * f) / f;
};

/** Linear interpolation along a polyline, extrapolating off either end. */
function along(pts: [number, number][], x: number): number {
  const n = pts.length;
  if (x <= pts[0][0]) {
    const [x0, y0] = pts[0], [x1, y1] = pts[1];
    return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  if (x >= pts[n - 1][0]) {
    const [x0, y0] = pts[n - 2], [x1, y1] = pts[n - 1];
    return y1 + (y1 - y0) * (x - x1) / (x1 - x0);
  }
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (pts[m][0] <= x) lo = m; else hi = m;
  }
  const [x0, y0] = pts[lo], [x1, y1] = pts[hi];
  return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
}

/**
 * Read one chart at one entry point.
 *
 * Sea level is not a separate line on either figure — it is drawn along the
 * plot's bottom rule — so below the lowest drawn curve the family is extended
 * one step using the gradient of the two lowest. Everything else off the edge of
 * the printed area is clamped and flagged rather than extrapolated, because the
 * curves bend and running them on past their ends invents performance.
 */
export function readChart(data: ChartData, entry: Entry): ChartReading {
  const warnings: string[] = [];
  const alts = data.altitudes;
  const lowest = alts[0].alt;
  const highest = alts[alts.length - 1].alt;

  let alt = entry.pressureAlt;
  if (alt > highest) {
    warnings.push(
      `Figure ${data.figure} stops at ${highest.toLocaleString()} ft; ` +
        `${Math.round(alt).toLocaleString()} ft is off the chart and has been read at ${highest.toLocaleString()} ft.`
    );
    alt = highest;
  }
  if (alt < 0) alt = 0;

  const covers = (i: number) => {
    const c = alts[i].curve;
    return entry.oatC >= c[0][0] - 0.5 && entry.oatC <= c[c.length - 1][0] + 0.5;
  };

  /**
   * Where the curve for `alts[i]` sits at this temperature.
   *
   * Not every curve traces across the chart's full width — a label or an ISA
   * line can interrupt one badly enough that part of it is lost, and figure
   * 5-17's 7,000 ft line is only recovered from +5 °C up. Clamping to the end of
   * a stump would read a cold day at +5 °C and quietly return a long climb, so
   * instead the missing part is carried over from the nearest altitude that does
   * reach this temperature: adjacent curves run near enough parallel that their
   * separation, measured where both exist, holds across the gap.
   */
  const coordAt = (i: number): number => {
    const c = alts[i].curve;
    if (covers(i)) return along(c, entry.oatC);

    for (let d = 1; d < alts.length; d++) {
      for (const j of [i - d, i + d]) {
        if (j < 0 || j >= alts.length || !covers(j)) continue;
        const donor = alts[j].curve;
        const lo = Math.max(c[0][0], donor[0][0]);
        const hi = Math.min(c[c.length - 1][0], donor[donor.length - 1][0]);
        if (hi <= lo) continue;
        const offset = along(c, (lo + hi) / 2) - along(donor, (lo + hi) / 2);
        return along(donor, entry.oatC) + offset;
      }
    }

    // Nothing on the chart reaches this temperature.
    const lo = c[0][0], hi = c[c.length - 1][0];
    const msg =
      `${entry.oatC} °C is outside the temperatures figure ${data.figure} covers ` +
      `(about ${Math.round(lo)} °C to ${Math.round(hi)} °C at this altitude); ` +
      `the reading has been taken at the nearest edge.`;
    if (!warnings.includes(msg)) warnings.push(msg);
    return along(c, Math.min(hi, Math.max(lo, entry.oatC)));
  };

  let coord: number;
  if (alt <= lowest) {
    // Between the sea-level line and the lowest drawn curve.
    const a0 = coordAt(0);
    coord = data.seaLevel + (a0 - data.seaLevel) * (alt / lowest);
  } else {
    let i = 0;
    while (i < alts.length - 2 && alts[i + 1].alt < alt) i++;
    const t = (alt - alts[i].alt) / (alts[i + 1].alt - alts[i].alt);
    coord = coordAt(i) + t * (coordAt(i + 1) - coordAt(i));
  }

  // The panel curves are traced from the top of the plot down to wherever they
  // run into the panel's own zero rule. Past the top they are clamped — they
  // bend hard there and extrapolating would invent performance — but past the
  // bottom they are near enough straight to carry on, which is what the lowest
  // few hundred feet need.
  //
  // That last stretch is carried on from a run of samples rather than from the
  // final pair: the tail of a trace is its noisiest part, and off two points the
  // wobble is enough to send fuel back downhill as the field gets lower.
  const TAIL = 8;
  const panel = (pts: [number, number][]) => {
    const n = pts.length;
    const top = Math.min(pts[0][0], pts[n - 1][0]);
    const bottom = Math.max(pts[0][0], pts[n - 1][0]);
    if (coord <= top) return pts[pts[0][0] === top ? 0 : n - 1][1];
    if (coord <= bottom) return along(pts, coord);
    const end = pts[0][0] === top ? n - 1 : 0;
    const back = pts[0][0] === top ? n - 1 - TAIL : TAIL;
    const slope = (pts[end][1] - pts[back][1]) / (pts[end][0] - pts[back][0]);
    return pts[end][1] + slope * (coord - pts[end][0]);
  };

  return {
    timeMin: Math.max(0, round(panel(data.panels.timeMin), 2)),
    fuelGal: Math.max(0, round(panel(data.panels.fuelGal), 3)),
    distanceNm: Math.max(0, round(panel(data.panels.distanceNm), 2)),
    warnings,
  };
}

/**
 * Cruise reading less field reading.
 *
 * Always that way round, for both charts. On the descent chart the cruise
 * altitude is the higher one too — you are descending *from* it — so the
 * subtraction does not flip, which is the mistake worth guarding against.
 */
export function computeClimbDescent(
  cruise: Reading,
  field: Reading,
  phase: Phase
): ClimbDescentResult {
  const warnings: string[] = [];
  const anyEntered =
    cruise.timeMin || cruise.fuelGal || cruise.distanceNm ||
    field.timeMin || field.fuelGal || field.distanceNm;

  if (anyEntered) {
    // The airport is always the lower altitude, so its readings are always the
    // smaller ones. A negative answer means the two were the wrong way round —
    // worth saying, because the number still looks like an answer.
    const swapped =
      field.timeMin > cruise.timeMin ||
      field.fuelGal > cruise.fuelGal ||
      field.distanceNm > cruise.distanceNm;
    if (swapped) {
      warnings.push(
        "The airport reading is larger than the cruise reading. The airport is the lower " +
          "altitude, so its numbers should be the smaller ones — check they aren't swapped."
      );
    }
  }

  if (phase === "climb" && anyEntered) {
    warnings.push(
      "Figure 5-17 already includes a fuel allowance for start, taxi and takeoff. Subtracting " +
        "the airport reading takes that allowance out again, so add it back when you total the " +
        "trip fuel."
    );
  }

  return {
    timeMin: round(cruise.timeMin - field.timeMin, 1),
    fuelGal: round(cruise.fuelGal - field.fuelGal, 2),
    distanceNm: round(cruise.distanceNm - field.distanceNm, 1),
    warnings,
  };
}

export interface ChartInfo {
  phase: Phase;
  figure: string;
  title: string;
  data: ChartData;
  /** The "associated conditions" block printed on the chart. */
  conditions: string[];
  /** What the two entry points are called on this chart. */
  labels: { field: string; cruise: string };
  /** Printed on the chart, and reproduced by the tests. */
  example: {
    field: Entry;
    cruise: Entry;
    /** Piper's own readings, rounded to whole units as printed. */
    printed: { field: Reading; cruise: Reading };
    answer: Reading;
  };
  note?: string;
}

export const CLIMB_CHART: ChartInfo = {
  phase: "climb",
  figure: "5-17",
  title: "Time, Distance and Fuel to Climb",
  data: CLIMB_DATA,
  conditions: ["Gross weight 2,550 lb", "Full throttle", "Flaps up", "76 KIAS"],
  labels: { field: "Departure airport", cruise: "Cruise altitude" },
  note: "This chart includes a fuel allowance for start, taxi and takeoff.",
  example: {
    field: { pressureAlt: 2000, oatC: 23 },
    cruise: { pressureAlt: 6000, oatC: 15 },
    printed: {
      field: { timeMin: 3, fuelGal: 2, distanceNm: 5 },
      cruise: { timeMin: 12, fuelGal: 4, distanceNm: 17 },
    },
    answer: { timeMin: 9, fuelGal: 2, distanceNm: 12 },
  },
};

export const DESCENT_CHART: ChartInfo = {
  phase: "descent",
  figure: "5-37",
  title: "Time, Distance and Fuel to Descend",
  data: DESCENT_DATA,
  conditions: ["Gross weight 2,550 lb", "2,500 RPM", "122 KIAS", "Flaps up"],
  labels: { field: "Destination airport", cruise: "Cruise altitude" },
  example: {
    field: { pressureAlt: 2500, oatC: 21 },
    cruise: { pressureAlt: 6000, oatC: 15 },
    printed: {
      field: { timeMin: 6, fuelGal: 1.3, distanceNm: 13 },
      cruise: { timeMin: 16, fuelGal: 3.2, distanceNm: 33 },
    },
    answer: { timeMin: 10, fuelGal: 1.9, distanceNm: 20 },
  },
};

export const CHARTS: ChartInfo[] = [CLIMB_CHART, DESCENT_CHART];

export interface Solution {
  field: ChartReading;
  cruise: ChartReading;
  result: ClimbDescentResult;
}

/** Both readings and the subtraction, from the two entry points. */
export function solve(chart: ChartInfo, field: Entry, cruise: Entry): Solution {
  const f = readChart(chart.data, field);
  const c = readChart(chart.data, cruise);
  const result = computeClimbDescent(c, f, chart.phase);
  result.warnings = [...new Set([...f.warnings, ...c.warnings, ...result.warnings])];
  return { field: f, cruise: c, result };
}

/**
 * Temperature aloft on a standard lapse rate, 2 °C per 1,000 ft.
 *
 * A convenience for the common case where the field temperature is known and
 * the cruise temperature is not. It is an estimate, not a forecast.
 */
export const lapsed = (oatC: number, fromAlt: number, toAlt: number) =>
  round(oatC - 2 * (toAlt - fromAlt) / 1000, 1);
