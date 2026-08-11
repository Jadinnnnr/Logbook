/** Ink runs down a column, filtered to plausible curve thicknesses. */
export function colRuns(img, x, min = 5, max = 30) {
  const { w, h, bin } = img;
  const out = [];
  let s = -1;
  for (let y = 0; y <= h; y++) {
    const on = y < h && bin[y * w + x];
    if (on && s < 0) s = y;
    else if (!on && s >= 0) {
      const len = y - s;
      if (len >= min && len <= max) out.push((s + y - 1) / 2);
      s = -1;
    }
  }
  return out;
}

/** Ink runs across a row. */
export function rowRuns(img, y, min = 4, max = 60) {
  const { w, bin } = img;
  const out = [];
  let s = -1;
  for (let x = 0; x <= w; x++) {
    const on = x < w && bin[y * w + x];
    if (on && s < 0) s = x;
    else if (!on && s >= 0) {
      const len = x - s;
      if (len >= min && len <= max) out.push({ c: (s + x - 1) / 2, a: s, b: x - 1, len });
      s = -1;
    }
  }
  return out;
}

/**
 * Follow the carpet's near-horizontal pressure-altitude curves across columns.
 *
 * Each curve is walked out from a seed in both directions, predicting the next
 * position from the running slope. Runs already claimed by another curve are off
 * limits, which is what keeps the walk from swapping curves where one crosses an
 * ISA line.
 */
export function followAll(img, seedX, { min = 5, max = 30, tol = 14, minLen = 300 } = {}) {
  const { w } = img;
  const cols = [];
  for (let x = 0; x < w; x++) cols.push(colRuns(img, x, min, max));
  const used = cols.map(c => new Uint8Array(c.length));
  const curves = [];

  const walk = (x0, i0) => {
    const pts = [{ x: x0, y: cols[x0][i0] }];
    used[x0][i0] = 1;
    for (const dir of [1, -1]) {
      let x = x0, y = cols[x0][i0], slope = 0, misses = 0;
      const seg = [];
      while (true) {
        x += dir;
        if (x < 0 || x >= w) break;
        const pred = y + slope * dir;
        let best = -1, bd = tol + misses * 1.5;
        for (let i = 0; i < cols[x].length; i++) {
          if (used[x][i]) continue;
          const d = Math.abs(cols[x][i] - pred);
          if (d < bd) { bd = d; best = i; }
        }
        // Gaps happen wherever a label or a construction line interrupts the
        // curve; 45 columns is enough to step over the widest of them.
        if (best < 0) { if (++misses > 45) break; continue; }
        const ny = cols[x][best];
        const ns = (ny - y) / (misses + 1);
        slope = slope === 0 ? ns : 0.85 * slope + 0.15 * ns;
        slope = Math.max(-3, Math.min(3, slope));
        y = ny; used[x][best] = 1; misses = 0;
        seg.push({ x, y });
      }
      pts.push(...seg);
    }
    pts.sort((a, b) => a.x - b.x);
    return pts;
  };

  const order = [...cols.keys()].sort((a, b) => Math.abs(a - seedX) - Math.abs(b - seedX));
  for (const x of order) {
    for (let i = 0; i < cols[x].length; i++) {
      if (used[x][i]) continue;
      const pts = walk(x, i);
      if (pts.length && pts.at(-1).x - pts[0].x >= minLen) {
        curves.push({ pts, x0: pts[0].x, x1: pts.at(-1).x });
      }
    }
  }
  return curves;
}
