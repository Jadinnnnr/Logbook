/** 8-connected components; returns {labels, comps:[{n,x0,y0,x1,y1}]} */
export function components(img) {
  const { w, h, bin } = img;
  const labels = new Int32Array(w * h).fill(0);
  const comps = [];
  const stack = new Int32Array(w * h);
  let next = 0;
  for (let i = 0; i < w * h; i++) {
    if (!bin[i] || labels[i]) continue;
    next++;
    let sp = 0; stack[sp++] = i;
    labels[i] = next;
    let n = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    while (sp) {
      const p = stack[--sp];
      const px = p % w, py = (p - px) / w;
      n++;
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (py < y0) y0 = py; if (py > y1) y1 = py;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const qx = px + dx, qy = py + dy;
        if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
        const q = qy * w + qx;
        if (bin[q] && !labels[q]) { labels[q] = next; stack[sp++] = q; }
      }
    }
    comps.push({ id: next, n, x0, y0, x1, y1 });
  }
  return { labels, comps };
}

/** Keep only components whose bounding box spans at least `frac` of the region diagonal. */
export function keepLarge(img, region, frac = 0.25) {
  const { w, h } = img;
  const sub = { w, h, bin: new Uint8Array(w * h) };
  for (let y = region.y0; y < region.y1; y++)
    for (let x = region.x0; x < region.x1; x++) sub.bin[y * w + x] = img.bin[y * w + x];
  const { labels, comps } = components(sub);
  const diag = Math.hypot(region.x1 - region.x0, region.y1 - region.y0);
  const keep = new Set(comps.filter(c => Math.hypot(c.x1 - c.x0, c.y1 - c.y0) >= frac * diag).map(c => c.id));
  const out = { w, h, bin: new Uint8Array(w * h) };
  for (let i = 0; i < w * h; i++) if (keep.has(labels[i])) out.bin[i] = 1;
  return { img: out, comps: comps.filter(c => keep.has(c.id)).sort((a,b)=>b.n-a.n) };
}
