import { components } from "./cc.mjs";

/** Pixels of every component in a region, with PCA direction, dropping specks. */
export function fragments(img, region, minPix = 60) {
  const { w, h } = img;
  const sub = { w, h, bin: new Uint8Array(w * h) };
  for (let y = region.y0; y < region.y1; y++)
    for (let x = region.x0; x < region.x1; x++) sub.bin[y * w + x] = img.bin[y * w + x];
  const { labels, comps } = components(sub);
  const pts = new Map();
  for (let y = region.y0; y < region.y1; y++)
    for (let x = region.x0; x < region.x1; x++) {
      const l = labels[y * w + x];
      if (!l) continue;
      if (!pts.has(l)) pts.set(l, []);
      pts.get(l).push([x, y]);
    }
  const out = [];
  for (const c of comps) {
    const p = pts.get(c.id);
    if (!p || p.length < minPix) continue;
    let mx = 0, my = 0;
    for (const [x, y] of p) { mx += x; my += y; }
    mx /= p.length; my /= p.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const [x, y] of p) { const dx = x - mx, dy = y - my; sxx += dx*dx; syy += dy*dy; sxy += dx*dy; }
    // principal direction
    const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    // Eigenvalues of the covariance: a straight line is highly elongated,
    // a glyph is not. This is what separates curve pieces from labels.
    const tr = (sxx + syy) / p.length, det = (sxx * syy - sxy * sxy) / (p.length * p.length);
    const disc = Math.max(0, tr * tr / 4 - det);
    const l1 = tr / 2 + Math.sqrt(disc), l2 = Math.max(1e-6, tr / 2 - Math.sqrt(disc));
    const elong = l1 / l2;
    const dirx = Math.cos(theta), diry = Math.sin(theta);
    // slope of x with respect to y along the fragment
    const slope = Math.abs(diry) < 1e-6 ? Infinity : dirx / diry;
    const len = Math.hypot(c.x1 - c.x0, c.y1 - c.y0);
    out.push({ pts: p, mx, my, slope, len, elong, n: p.length, box: [c.x0, c.y0, c.x1, c.y1] });
  }
  return out;
}

/** Least-squares polynomial fit of x as a function of y. */
export function polyfit(pts, deg) {
  const n = deg + 1;
  const A = Array.from({ length: n }, () => new Array(n).fill(0));
  const b = new Array(n).fill(0);
  for (const [x, y] of pts) {
    const pw = [1];
    for (let k = 1; k < 2 * n; k++) pw.push(pw[k - 1] * y);
    for (let i = 0; i < n; i++) {
      b[i] += x * pw[i];
      for (let j = 0; j < n; j++) A[i][j] += pw[i + j];
    }
  }
  // Gaussian elimination
  for (let i = 0; i < n; i++) {
    let piv = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[piv][i])) piv = k;
    [A[i], A[piv]] = [A[piv], A[i]]; [b[i], b[piv]] = [b[piv], b[i]];
    for (let k = i + 1; k < n; k++) {
      const f = A[k][i] / A[i][i];
      for (let j = i; j < n; j++) A[k][j] -= f * A[i][j];
      b[k] -= f * b[i];
    }
  }
  const c = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= A[i][j] * c[j];
    c[i] = s / A[i][i];
  }
  return (y) => c.reduce((acc, k, i) => acc + k * Math.pow(y, i), 0);
}
