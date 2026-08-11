import { printed, sub } from "./geom.mjs";
import { deskewed, measureSkew, plotBox } from "./deskew.mjs";
import { cleaned } from "./clean.mjs";
import { followAll, rowRuns } from "./follow.mjs";

/**
 * Figures 5-17 (time, fuel, distance to climb) and 5-37 (to descend), from the
 * PA-28-181 POH, Piper VB-2960.
 *
 * Both are nomograms and both are read the same way, which is the way the chart
 * itself draws it: enter at the outside air temperature, go up to the pressure
 * altitude curve, then straight across to each of the three panel curves, and
 * drop down to read time, fuel and distance. The horizontal leg is a line of
 * constant PY, so PY is the coordinate the carpet and the panels share and the
 * only thing that has to be carried between them.
 *
 * Calibration below is read off the plot's own minor rules after de-skewing and
 * cross-checked against the printed axis labels. `rules` lists the heavy
 * full-height lines that must never be mistaken for a panel curve.
 */
export const CHARTS = {
  163: {
    figure: "5-17", phase: "climb", altStep: 1000,
    box: { top: 1247.5, bottom: 3000 },
    carpet: { x0: 950, x1: 2110, topAlt: 12000, count: 12 },
    oat: { at: -25, zero: 953.5, per: 15.4 },
    rules: [2108.5, 2828, 3400, 4062],
    panels: [
      { key: "timeMin", x0: 2115, x1: 2800, zero: 2188, per: 8.0143 },
      { key: "fuelGal", x0: 2800, x1: 3370, zero: 2828, per: 27.3611 },
      { key: "distanceNm", x0: 3380, x1: 4060, zero: 3400, per: 5.51667 },
    ],
  },
  174: {
    figure: "5-37", phase: "descent", altStep: 1000, stripRules: true,
    box: { top: 1202.5, bottom: 2793.5 },
    carpet: { x0: 935, x1: 2215, topAlt: 10000, count: 10 },
    oat: { at: -20, zero: 940.5, per: 16.9786 },
    rules: [2213.5, 2230.5, 2826.5, 3396.5, 4079],
    panels: [
      { key: "timeMin", x0: 2235, x1: 2835, zero: 2230.5, per: 20.0 },
      { key: "fuelGal", x0: 2835, x1: 3395, zero: 2826.5, per: 95.0 },
      { key: "distanceNm", x0: 3402, x1: 4085, zero: 3396.5, per: 11.375 },
    ],
  },
};

const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

/**
 * Centred moving average.
 *
 * The drawn curves are smooth; what is not smooth is where the centre of a
 * stroke falls on a pixel grid. Left in, that quantisation is worth a couple of
 * hundredths of a gallon, which is enough to make a reading go the wrong way
 * between one altitude and the next.
 */
function smooth(vals, win = 21) {
  const h = win >> 1;
  return vals.map((_, i) => {
    let sum = 0, n = 0;
    for (let k = Math.max(0, i - h); k <= Math.min(vals.length - 1, i + h); k++) { sum += vals[k]; n++; }
    return sum / n;
  });
}

export function interp(xs, ys, x) {
  const n = xs.length;
  if (x <= xs[0]) return ys[0] + (ys[1] - ys[0]) * (x - xs[0]) / (xs[1] - xs[0]);
  if (x >= xs[n - 1]) {
    return ys[n - 1] + (ys[n - 1] - ys[n - 2]) * (x - xs[n - 1]) / (xs[n - 1] - xs[n - 2]);
  }
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
  const t = (x - xs[lo]) / (xs[hi] - xs[lo]);
  return ys[lo] + t * (ys[hi] - ys[lo]);
}

/** One panel curve, as PY -> PX. */
function tracePanel(P, spec, p) {
  const Y0 = Math.round(spec.box.top), Y1 = Math.round(spec.box.bottom) + 1;
  const img = cleaned(sub(P, p.x0, Y0, p.x1, Y1), { stripRules: spec.stripRules });

  // The panel zero lines are drawn as heavily as the curves; blank them.
  for (const r of spec.rules) {
    for (let dx = -14; dx <= 14; dx++) {
      const x = Math.round(r + dx) - p.x0;
      if (x < 0 || x >= img.w) continue;
      for (let y = 0; y < img.h; y++) img.bin[y * img.w + x] = 0;
    }
  }

  const rows = [];
  for (let y = 0; y < img.h; y++) rows.push(rowRuns(img, y));

  // Seed high in the panel, where the curve is the right-most ink there is.
  let seed = -1, seedC = 0;
  for (let y = 100; y < img.h - 200; y++) {
    if (!rows[y].length) continue;
    const right = rows[y].reduce((a, b) => (b.c > a.c ? b : a));
    if (right.c > img.w * 0.5) { seed = y; seedC = right.c; break; }
  }
  if (seed < 0) throw new Error(`${spec.figure} ${p.key}: no seed row`);

  const hit = new Array(img.h).fill(null);
  hit[seed] = rows[seed].reduce((a, b) => (b.c > a.c ? b : a));
  const go = (dir) => {
    let y = seed, prev = hit[seed].c, slope = 0, miss = 0;
    while (true) {
      y += dir;
      if (y < 0 || y >= img.h) break;
      const pred = prev + slope * dir;
      let best = null, bd = 18 + miss * 2;
      for (const r of rows[y]) {
        const d = Math.abs(r.c - pred);
        if (d < bd) { bd = d; best = r; }
      }
      if (!best) { if (++miss > 60) break; continue; }
      const ns = (best.c - prev) / (miss + 1) * dir;
      slope = slope === 0 ? ns : 0.7 * slope + 0.3 * ns;
      slope = Math.max(-30, Math.min(30, slope));
      prev = best.c; hit[y] = best; miss = 0;
    }
  };
  go(1); go(-1);

  // Read the curve off the right-hand edge of each run, not its middle.
  //
  // Both figures draw their worked example over the top of the curves, and the
  // arrowhead where a construction line meets a panel curve is a solid blob
  // several times the width of the line. Those arrows always come in from the
  // left, so the run's right edge is clean while its centre is dragged left —
  // on figure 5-37 by 1.3 n.m., right at the reading the example is checked
  // against. The half-width to step back is taken from the neighbouring rows,
  // which the blob does not reach.
  const idx = [];
  hit.forEach((r, i) => { if (r) idx.push(i); });
  const widths = idx.map(i => hit[i].len);
  const ys = [], vals = [];
  for (let k = 0; k < idx.length; k++) {
    const lo = Math.max(0, k - 30), hi = Math.min(widths.length - 1, k + 30);
    const half = median(widths.slice(lo, hi + 1)) / 2;
    const x = hit[idx[k]].b - half;
    ys.push(idx[k] + Y0);
    vals.push((x + p.x0 - p.zero) / p.per);
  }

  // A panel curve falls as the shared coordinate rises — lower down the chart is
  // less time, less fuel, less distance — so a trace that turns back up at the
  // very bottom has caught the panel's own zero rule. Cut that hook off rather
  // than carry it into the data, where extrapolating past it sends fuel back
  // downhill as the field gets lower.
  //
  // Only the trailing run, and only a little of it: near the top of the panel
  // the curve is almost flat, so a general monotonicity rule fires on ordinary
  // pixel noise and takes the whole trace with it.
  const floor = Math.floor(vals.length * 0.95);
  let end = vals.length;
  while (end > floor && vals[end - 1] >= vals[end - 2]) end--;
  if (end < vals.length) {
    console.warn(`  ${spec.figure} ${p.key}: trimmed ${vals.length - end} rows off the foot of the panel`);
  }
  return { key: p.key, ys: ys.slice(0, end), vals: smooth(vals.slice(0, end)) };
}

export function buildChart(pageNo) {
  const spec = CHARTS[pageNo];
  const raw = printed(pageNo);
  const P = deskewed(raw, measureSkew(raw));
  const Y0 = Math.round(spec.box.top), Y1 = Math.round(spec.box.bottom) + 1;

  const img = cleaned(sub(P, spec.carpet.x0, Y0, spec.carpet.x1, Y1), { stripRules: spec.stripRules });
  const all = followAll(img, 700, { minLen: 300 })
    .filter(c => Math.abs(c.pts.at(-1).y - c.pts[0].y) > 12); // leftover rules are flat

  // A curve broken in two leaves a stub that would otherwise be counted as its
  // own altitude and shift every label below it. Real curves run most of the
  // carpet's width.
  const spanCut = 0.45 * median(all.map(c => c.x1 - c.x0));
  const traced = all.filter(c => c.x1 - c.x0 >= spanCut).map(c => ({
    oats: c.pts.map(p => (p.x + spec.carpet.x0 - spec.oat.zero) / spec.oat.per + spec.oat.at),
    pys: smooth(c.pts.map(p => p.y + Y0)),
  }));

  // Order by height at a column they all reach — not by where each happens to
  // start, since they begin and end at different temperatures.
  const ref = median(traced.map(c => (c.oats[0] + c.oats.at(-1)) / 2));
  traced.sort((a, b) => interp(a.oats, a.pys, ref) - interp(b.oats, b.pys, ref));
  if (traced.length !== spec.carpet.count) {
    throw new Error(`${spec.figure}: traced ${traced.length} altitude curves, expected ${spec.carpet.count}`);
  }

  const fam = traced.map((c, i) => ({ alt: spec.carpet.topAlt - i * spec.altStep, ...c }));
  const panels = spec.panels.map(p => tracePanel(P, spec, p));
  return { spec, fam, panels, page: P };
}

/** Evenly spaced samples of a polyline, for export. */
export function resample(xs, ys, n) {
  const lo = xs[0], hi = xs.at(-1);
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = lo + (hi - lo) * (i / (n - 1));
    out.push([x, interp(xs, ys, x)]);
  }
  return out;
}
