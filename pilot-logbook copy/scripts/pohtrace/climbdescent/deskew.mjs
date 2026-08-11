import { vRules, hRules } from "./geom.mjs";

/**
 * Undo the scan's rotation and shear.
 *
 * Both figures are scans, tilted by about a third of a degree. That is worth
 * roughly nine pixels across the plot — 1.6 n.m. on the distance panel — so it
 * has to come out before anything is measured.
 *
 * The scan sends true offsets (p,q) to (p + a·q, b·p + q): a true vertical comes
 * out leaning by `a`, a true horizontal by `b`. Sampling the source at that
 * point for each output pixel undoes it.
 */
export function deskewed(img, { a, b, cx, cy }) {
  const { w, h, bin } = img;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const q = y - cy;
    for (let x = 0; x < w; x++) {
      const p = x - cx;
      const u = Math.round(cx + p + a * q);
      const v = Math.round(cy + b * p + q);
      if (u < 0 || v < 0 || u >= w || v >= h) continue;
      out[y * w + x] = bin[v * w + u];
    }
  }
  return { w, h, bin: out };
}

/** Least-squares lean of the ink line nearest each guess; median across lines. */
function lean(P, guesses, along, t0, t1, step, win) {
  const { w, bin } = P;
  const slopes = [];
  for (const g of guesses) {
    const pts = [];
    for (let t = t0; t <= t1; t += step) {
      let best = null, bd = win, s = -1;
      for (let u = Math.round(g - win); u <= Math.round(g + win); u++) {
        const on = along === "v" ? bin[t * w + u] : bin[u * w + t];
        if (on && s < 0) s = u;
        else if (!on && s >= 0) {
          const c = (s + u - 1) / 2, d = Math.abs(c - g);
          if (d < bd && u - s <= 24) { bd = d; best = c; }
          s = -1;
        }
      }
      if (best !== null) pts.push([t, best]);
    }
    if (pts.length < 30) continue;
    const mt = pts.reduce((acc, p) => acc + p[0], 0) / pts.length;
    const mc = pts.reduce((acc, p) => acc + p[1], 0) / pts.length;
    let num = 0, den = 0;
    for (const [t, c] of pts) { num += (t - mt) * (c - mc); den += (t - mt) ** 2; }
    slopes.push(num / den);
  }
  if (!slopes.length) throw new Error("deskew: no line could be followed");
  slopes.sort((x, y) => x - y);
  return slopes[Math.floor(slopes.length / 2)];
}

/** The plot box, from the outermost long horizontal rules. */
export function plotBox(P) {
  const hs = hRules(P, 2200, 2700, 1100, 3200, 0.92);
  return { top: hs[0], bottom: hs.at(-1) };
}

/**
 * Skew measured on the plot box's own four borders.
 *
 * Not on the interior rules: the scan's drift across the plot is about the same
 * as the minor-rule pitch, so any search window wide enough to follow one rule
 * end to end is wide enough to jump onto its neighbour. The borders have no
 * neighbour to jump to.
 */
export function measureSkew(P) {
  const b = plotBox(P);
  const y0 = Math.round(b.top) + 60, y1 = Math.round(b.bottom) - 40;
  const vs = vRules(P, y0, y1, 0.45).filter(x => x > 900 && x < 4090);
  return {
    a: lean(P, [vs[0], vs.at(-1)], "v", y0, y1, 20, 16),
    b: lean(P, [b.top, b.bottom], "h", 1050, 4000, 40, 16),
    cx: 2500,
    cy: (b.top + b.bottom) / 2,
  };
}
