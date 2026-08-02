import * as mupdf from "mupdf";
import fs from "fs";

// The PA-28-181 POH this digitisation was made from.
const POH_PATH = process.env.POH_PDF ??
  "/Users/School/Library/Mobile Documents/com~apple~CloudDocs/Pilot Material/Doc_BE8B855D7C1A212F98A4D9AC0A6CF164.pdf";
const doc = mupdf.Document.openDocument(fs.readFileSync(POH_PATH), "application/pdf");
export const SCALE = 6;

export function page(n) {
  const p = doc.loadPage(n - 1);
  const pix = p.toPixmap(mupdf.Matrix.scale(SCALE, SCALE), mupdf.ColorSpace.DeviceGray, false, true);
  const w = pix.getWidth(), h = pix.getHeight(), s = pix.getStride(), N = pix.getNumberOfComponents();
  const src = pix.getPixels();
  const bin = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) bin[y * w + x] = src[y * s + x * N] < 140 ? 1 : 0;
  return { w, h, bin };
}

/** Erase pixels that belong to a straight run longer than `len` — kills the grid, keeps diagonals. */
export function stripLines(img, len = 34) {
  const { w, h, bin } = img;
  const out = Uint8Array.from(bin);
  for (let x = 0; x < w; x++) {
    let run = 0;
    for (let y = 0; y <= h; y++) {
      if (y < h && bin[y * w + x]) run++;
      else { if (run > len) for (let k = y - run; k < y; k++) out[k * w + x] = 0; run = 0; }
    }
  }
  for (let y = 0; y < h; y++) {
    let run = 0;
    for (let x = 0; x <= w; x++) {
      if (x < w && bin[y * w + x]) run++;
      else { if (run > len) for (let k = x - run; k < x; k++) out[y * w + k] = 0; run = 0; }
    }
  }
  return { w, h, bin: out };
}

/** Dark-run clusters along a row, as x-centres. */
export function clustersInRow(img, y, x0, x1, gap = 4) {
  const { w, bin } = img;
  const runs = [];
  let start = -1;
  for (let x = x0; x <= x1; x++) {
    const on = x < x1 && bin[y * w + x];
    if (on && start < 0) start = x;
    else if (!on && start >= 0) { runs.push([start, x - 1]); start = -1; }
  }
  const merged = [];
  for (const r of runs) {
    if (merged.length && r[0] - merged.at(-1)[1] <= gap) merged.at(-1)[1] = r[1];
    else merged.push([...r]);
  }
  return merged.map(([a, b]) => ({ c: (a + b) / 2, a, b, wdt: b - a + 1 }));
}

export function writePNG(img, file) {
  const pm = new mupdf.Pixmap(mupdf.ColorSpace.DeviceGray, [0, 0, img.w, img.h], false);
  const px = pm.getPixels(); const s = pm.getStride(); const N = pm.getNumberOfComponents();
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) px[y * s + x * N] = img.bin[y * img.w + x] ? 0 : 255;
  fs.writeFileSync(file, pm.asPNG());
}
