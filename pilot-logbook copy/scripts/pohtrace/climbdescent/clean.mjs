import { open, components, keep } from "./morph.mjs";

/**
 * Remove the rules that run the full width of a region.
 *
 * Only the rule's own ink goes: where a curve lies across a rule the column's
 * ink run is taller than the rule is, and that column is left alone, so the
 * curve stays continuous. Getting this wrong is expensive — on figure 5-37 the
 * curves are only 6–9 px thick against 2–3 px rules, and too much slack here
 * erases the 6,000 ft curve entirely.
 */
export function stripHRules(region, frac = 0.85, slack = 2) {
  const { w, h, bin } = region;
  const out = Uint8Array.from(bin);

  const bands = [];
  for (let y = 0; y < h; y++) {
    let c = 0;
    for (let x = 0; x < w; x++) if (bin[y * w + x]) c++;
    if (c >= frac * w) {
      if (bands.length && y - bands.at(-1).b <= 1) bands.at(-1).b = y;
      else bands.push({ a: y, b: y });
    }
  }

  for (const band of bands) {
    const thick = band.b - band.a + 1;
    for (let x = 0; x < w; x++) {
      let a = band.a, b = band.b;
      while (a > 0 && bin[(a - 1) * w + x]) a--;
      while (b < h - 1 && bin[(b + 1) * w + x]) b++;
      if (b - a + 1 > thick + slack) continue;
      for (let y = a; y <= b; y++) out[y * w + x] = 0;
    }
  }
  return { w, h, bin: out };
}

/**
 * Strip the grid and the numbers, leaving the drawn curves.
 *
 * The opening deletes the thin grid and keeps the thicker curves; the component
 * filter then drops the altitude labels, which are printed clear of their curves
 * and so survive as their own small blobs.
 */
export function cleaned(region, { r = 2, minSpan = 200, stripRules = false } = {}) {
  const o = open(stripRules ? stripHRules(region) : region, r);
  const { labels, comps } = components(o);
  const ids = comps.filter(c => c.wdt >= minSpan || c.hgt >= minSpan).map(c => c.id);
  return keep(o, labels, ids);
}
