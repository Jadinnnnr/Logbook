import { fragments, polyfit } from "./trace.mjs";

export function median(a) { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }

/** Fragments in a region belonging to one line family, by slope sign and thinness. */
export function familyFragments(img, region, sign, minPix = 60, maxThick = 9) {
  return fragments(img, region, minPix).filter(f => {
    if (!isFinite(f.slope)) return false;
    if (sign > 0 ? !(f.slope > 0.12 && f.slope < 2.5) : !(f.slope < -0.12 && f.slope > -2.5)) return false;
    return f.n / f.len < maxThick && f.elong > 12;
  });
}

/** Group fragments into curves, auto-detecting how many there are. */
export function detectCurves(frags, deg = 2) {
  const shear = median(frags.map(f => f.slope));
  const items = frags.map(f => ({ f, u: f.mx - shear * f.my })).sort((a, b) => a.u - b.u);
  const gaps = [];
  for (let i = 1; i < items.length; i++) gaps.push(items[i].u - items[i - 1].u);
  const typical = median(gaps.filter(g => g > 0));
  // A new curve starts at a gap far larger than the within-curve scatter.
  const cut = Math.max(typical * 4, 25);
  const groups = [[items[0].f]];
  for (let i = 1; i < items.length; i++) {
    if (items[i].u - items[i - 1].u > cut) groups.push([]);
    groups.at(-1).push(items[i].f);
  }
  return refine(groups.filter(g => g.length > 0), frags, deg);
}

function refine(groups, frags, deg, iters = 5) {
  let fits = groups.map(g => polyfit(g.flatMap(f => f.pts), Math.min(deg, g.length > 2 ? deg : 1)));
  for (let it = 0; it < iters; it++) {
    const next = fits.map(() => []);
    for (const f of frags) {
      let best = -1, bd = Infinity;
      fits.forEach((fit, i) => {
        let s = 0;
        for (const [x, y] of f.pts) s += Math.abs(x - fit(y));
        s /= f.pts.length;
        if (s < bd) { bd = s; best = i; }
      });
      if (bd < 30) next[best].push(f);
    }
    const kept = next.filter(g => g.length > 0);
    if (kept.length !== fits.length) { groups = kept; }
    else groups = next;
    fits = groups.map(g => polyfit(g.flatMap(f => f.pts), g.length > 2 ? deg : 1));
  }
  const out = groups.map((g, i) => {
    const ys = g.flatMap(f => f.pts.map(p => p[1]));
    return { fit: fits[i], n: g.length, yMin: Math.min(...ys), yMax: Math.max(...ys) };
  });
  const ymid = median(out.flatMap(c => [c.yMin, c.yMax]));
  return out.sort((a, b) => a.fit(ymid) - b.fit(ymid));
}
