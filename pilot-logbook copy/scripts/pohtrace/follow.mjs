import { familyFragments } from "./detect.mjs";

/** Render only the fragments of one line family into a fresh bitmap. */
export function familyMask(img, region, sign, opts = {}) {
  const fr = familyFragments(img, region, sign, opts.minPix ?? 60, opts.maxThick ?? 9);
  const out = { w: img.w, h: img.h, bin: new Uint8Array(img.w * img.h) };
  for (const f of fr) for (const [x, y] of f.pts) out.bin[y * img.w + x] = 1;
  return { mask: out, frags: fr };
}

export function rowClusters(mask, y, x0, x1, gap = 6) {
  const { w, bin } = mask;
  const runs = [];
  let s = -1;
  for (let x = x0; x <= x1; x++) {
    const on = x < x1 && bin[y * w + x];
    if (on && s < 0) s = x;
    else if (!on && s >= 0) { runs.push([s, x - 1]); s = -1; }
  }
  const m = [];
  for (const r of runs) {
    if (m.length && r[0] - m.at(-1)[1] <= gap) m.at(-1)[1] = r[1];
    else m.push([...r]);
  }
  return m.map(([a, b]) => (a + b) / 2);
}

/** Seed from the row whose clusters are the most evenly spaced — regular
 *  spacing means we are looking at the guide family and not at stray marks. */
export function bestSeedRow(mask, region, minCount = 4, exact = 0, window = null) {
  let best = null;
  const lo = window ? Math.max(region.y0 + 3, window[0]) : region.y0 + 5;
  const hi = window ? Math.min(region.y1 - 3, window[1]) : region.y1 - 5;
  for (let y = lo; y < hi; y += 2) {
    const c = rowClusters(mask, y, region.x0, region.x1);
    if (exact ? c.length !== exact : c.length < minCount) continue;
    const d = [];
    for (let i = 1; i < c.length; i++) d.push(c[i] - c[i - 1]);
    const mean = d.reduce((a, b) => a + b, 0) / d.length;
    const cv = Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / d.length) / mean;
    // More curves is better, irregular spacing is worse.
    // With a known curve count, the best row is the one where they are most
    // separated — that is where the follow step is least likely to jump tracks.
    const score = exact ? Math.min(...d) : c.length - cv * 6;
    if (!best || score > best.score) best = { y, c, cv, score };
  }
  return best;
}

/** Follow each seeded curve up and down the region. */
export function followCurves(mask, region, seedRow, seeds, opts = {}) {
  const tol = opts.tol ?? 14;
  const maxMiss = opts.maxMiss ?? 90;
  const curves = seeds.map(x => ({ pts: [[x, seedRow]], slope: opts.slope0 ?? 0 }));
  const walk = (dir) => {
    const state = curves.map(c => ({ x: c.pts[0][0], slope: c.slope, miss: 0, dead: false }));
    for (let y = seedRow + dir; y >= region.y0 && y < region.y1; y += dir) {
      const cl = rowClusters(mask, y, region.x0, region.x1);
      state.forEach((st, i) => {
        if (st.dead) return;
        const pred = st.x + st.slope * dir;
        let best = null, bd = Infinity;
        for (const c of cl) { const d = Math.abs(c - pred); if (d < bd) { bd = d; best = c; } }
        if (best !== null && bd <= tol) {
          const newSlope = (best - st.x) * dir;
          st.slope = st.slope === 0 ? newSlope : st.slope * 0.85 + newSlope * 0.15;
          st.x = best; st.miss = 0;
          curves[i].pts.push([best, y]);
        } else {
          st.x = pred; st.miss++;
          if (st.miss > maxMiss) st.dead = true;
        }
      });
      if (state.every(s => s.dead)) break;
    }
  };
  walk(-1); walk(+1);
  return curves.map(c => {
    const pts = c.pts.slice().sort((a, b) => a[1] - b[1]);
    return { pts, yMin: pts[0][1], yMax: pts.at(-1)[1] };
  });
}
