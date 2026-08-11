import { page } from "../lib.mjs";

/**
 * Figures 5-17 and 5-37 are printed sideways on the page. Rotating 90° clockwise
 * puts them the way a pilot reads them: outside air temperature along the
 * bottom, the pressure-altitude carpet on the left, and the time, fuel and
 * distance panels to its right.
 *
 * Everything downstream works in this "printed" frame. PX runs left-to-right
 * along the value axes; PY runs top-to-bottom and is the coordinate the three
 * panels share with the carpet — the horizontal line the chart tells you to
 * draw is a line of constant PY.
 */
export function rot90cw(img) {
  const { w, h, bin } = img;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (bin[y * w + x]) out[x * h + (h - 1 - y)] = 1;
    }
  }
  return { w: h, h: w, bin: out };
}

export const printed = (n) => rot90cw(page(n));

/** Sub-image of a region, as its own {w,h,bin}. */
export function sub(img, x0, y0, x1, y1) {
  const w = x1 - x0, h = y1 - y0;
  const bin = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) bin[y * w + x] = img.bin[(y + y0) * img.w + (x + x0)];
  }
  return { w, h, bin };
}

/** Vertical rules inside the plot: columns inked over at least `frac` of the band. */
export function vRules(P, y0, y1, frac = 0.45, x0 = 900, x1 = 4110) {
  const { w, bin } = P, H = y1 - y0;
  const col = new Int32Array(w);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (bin[y * w + x]) col[x]++;
  const runs = [];
  for (let x = x0; x < x1; x++) {
    if (col[x] >= frac * H) {
      if (runs.length && x - runs.at(-1).b <= 2) runs.at(-1).b = x;
      else runs.push({ a: x, b: x });
    }
  }
  return runs.map(r => (r.a + r.b) / 2);
}

/** Horizontal rules, measured in a narrow window so page skew cannot smear them. */
export function hRules(P, x0, x1, y0, y1, frac = 0.9) {
  const { w, bin } = P, W = x1 - x0;
  const hits = [];
  for (let y = y0; y < y1; y++) {
    let c = 0;
    for (let x = x0; x < x1; x++) if (bin[y * w + x]) c++;
    if (c >= frac * W) hits.push(y);
  }
  const g = [];
  for (const y of hits) {
    if (g.length && y - g.at(-1).b <= 3) g.at(-1).b = y;
    else g.push({ a: y, b: y });
  }
  return g.map(r => (r.a + r.b) / 2);
}
