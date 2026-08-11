import { page, stripLines } from "./lib.mjs";
import { familyMask, bestSeedRow, followCurves } from "./follow.mjs";
import { polyfit } from "./trace.mjs";
import { CHARTS, axis } from "./charts.mjs";

/**
 * Trace one family of guide curves.
 *
 * Row-following alone loses a curve wherever the grid-stripping left a long
 * gap, so it is used only to find how many curves there are and roughly where.
 * Every fragment is then assigned to its nearest curve and the curve refitted,
 * which recovers the full extent and repairs stubs.
 */
function traceFamily(st, region, sign, deg = 2, minCount = 4, exact = 0, seedWindow = null, sortAt = null) {
  const { mask, frags } = familyMask(st, region, sign);
  const seed = bestSeedRow(mask, region, minCount, exact, seedWindow);
  if (!seed) throw new Error("no seed row");
  const followed = followCurves(mask, region, seed.y, seed.c).filter(c => c.pts.length > 20);
  let fits = followed.map(c => polyfit(c.pts, deg));

  // Half the gap between neighbouring curves: a fragment further off than this
  // belongs to some other curve (or to nothing).
  const mid = (region.y0 + region.y1) / 2;
  const xs = fits.map(f => f(mid)).sort((a, b) => a - b);
  const gaps = xs.slice(1).map((x, i) => x - xs[i]);
  const cap = Math.max(18, Math.min(...gaps) * 0.45);

  let groups = [];
  for (let it = 0; it < 5; it++) {
    groups = fits.map(() => []);
    for (const f of frags) {
      let best = -1, bd = Infinity;
      fits.forEach((fit, i) => {
        let s = 0;
        for (const [x, y] of f.pts) s += Math.abs(x - fit(y));
        s /= f.pts.length;
        if (s < bd) { bd = s; best = i; }
      });
      if (bd <= cap) groups[best].push(f);
    }
    const ok = groups.map((g, i) => ({ g, i })).filter(o => o.g.length > 0);
    fits = ok.map(o => polyfit(o.g.flatMap(f => f.pts), o.g.length > 1 ? deg : 1));
    groups = ok.map(o => o.g);
  }

  const span = region.y1 - region.y0;
  return groups
    .map((g, i) => {
      const ys = g.flatMap(f => f.pts.map(p => p[1]));
      return { fit: fits[i], yMin: Math.min(...ys), yMax: Math.max(...ys), n: g.length };
    })
    // A curve covering only a sliver of the panel is a stray mark or a piece of
    // the worked example, and its extrapolation is worthless.
    .filter(c => c.yMax - c.yMin > span * 0.5)
    .sort((a, b) => a.fit(sortAt ?? mid) - b.fit(sortAt ?? mid));
}

/** Sample a family at a given y, returning the x of each curve that is valid there. */
function sampleAt(curves, y, pad = 40) {
  return curves
    .filter(c => y >= c.yMin - pad && y <= c.yMax + pad)
    .map(c => c.fit(y));
}

/** Follow the guide family from (xIn, yIn) to yOut, interpolating between the
 *  two curves that bracket the entry point — exactly how the chart is read. */
function followGuides(curves, xIn, yIn, yOut) {
  const at = (y) => curves.map(c => c.fit(y));
  const a = at(yIn), b = at(yOut);
  if (a.length < 2) return xIn;
  let i = 0;
  while (i < a.length - 2 && a[i + 1] < xIn) i++;
  const t = (xIn - a[i]) / (a[i + 1] - a[i]);
  return b[i] + t * (b[i + 1] - b[i]);
}

export function buildChart(pageNo) {
  const C = CHARTS[pageNo];
  const img = page(pageNo);
  const st = stripLines(img, 34);
  const pa = traceFamily(st, C.oat.region, +1, 2, 4, C.paLevels.length);
  // The weight and wind guides all start on their reference line, so that is
  // where they are cleanly separated and all present.
  const wt = traceFamily(st, C.wt.region, -1, 2, 4, 0, [C.wt.ref - 150, C.wt.ref - 8], C.wt.ref);
  const hw = traceFamily(st, C.wind.region, -1, 2, 4, 0, [C.wind.ref - 150, C.wind.ref - 8], C.wind.ref);
  return { C, pa, wt, hw };
}

export function evaluate(ch, { pa: paFt, oat, weight, wind }) {
  const { C } = ch;
  const dist = axis(C.dist), oatA = axis(C.oat), wtA = axis(C.wt), windA = axis(C.wind);

  // Panel 1 — pressure altitude curve at this temperature.
  const y1 = oatA.toPx(oat);
  const xs = ch.pa.map(c => c.fit(y1));            // sea level .. 8,000 ft, left to right is 8000..SL
  const ordered = [...xs].reverse();               // index 0 = sea level
  const lv = C.paLevels;
  let k = 0;
  while (k < lv.length - 2 && lv[k + 1] < paFt) k++;
  const f = (paFt - lv[k]) / (lv[k + 1] - lv[k]);
  const x1 = ordered[k] + f * (ordered[k + 1] - ordered[k]);

  // Panel 2 — weight.
  const x2 = followGuides(ch.wt, x1, C.wt.ref, wtA.toPx(weight));

  // Panel 3 — headwind (the solid family).
  const x3 = followGuides(ch.hw, x2, C.wind.ref, windA.toPx(Math.max(0, wind)));

  return {
    refDistance: dist.toVal(x1),
    afterWeight: dist.toVal(x2),
    distance: dist.toVal(x3),
  };
}
