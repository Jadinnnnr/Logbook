/** Binary morphology + connected components on {w,h,bin}. */

export function erode(img, r) {
  const { w, h, bin } = img;
  // separable: min over a (2r+1) window horizontally then vertically
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 1;
      for (let d = -r; d <= r && v; d++) {
        const xx = x + d;
        if (xx < 0 || xx >= w || !bin[y * w + xx]) v = 0;
      }
      tmp[y * w + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 1;
      for (let d = -r; d <= r && v; d++) {
        const yy = y + d;
        if (yy < 0 || yy >= h || !tmp[yy * w + x]) v = 0;
      }
      out[y * w + x] = v;
    }
  }
  return { w, h, bin: out };
}

export function dilate(img, r) {
  const { w, h, bin } = img;
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let d = -r; d <= r && !v; d++) {
        const xx = x + d;
        if (xx >= 0 && xx < w && bin[y * w + xx]) v = 1;
      }
      tmp[y * w + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let d = -r; d <= r && !v; d++) {
        const yy = y + d;
        if (yy >= 0 && yy < h && tmp[yy * w + x]) v = 1;
      }
      out[y * w + x] = v;
    }
  }
  return { w, h, bin: out };
}

export const open = (img, r) => dilate(erode(img, r), r);

/** 8-connected components. Returns {labels:Int32Array, comps:[{id,n,x0,y0,x1,y1}]} */
export function components(img) {
  const { w, h, bin } = img;
  const labels = new Int32Array(w * h).fill(-1);
  const comps = [];
  const stack = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (!bin[i] || labels[i] >= 0) continue;
    const id = comps.length;
    let n = 0, x0 = w, y0 = h, x1 = 0, y1 = 0, sp = 0;
    stack[sp++] = i; labels[i] = id;
    while (sp) {
      const p = stack[--sp];
      const px = p % w, py = (p - px) / w;
      n++;
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (py < y0) y0 = py; if (py > y1) y1 = py;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (bin[q] && labels[q] < 0) { labels[q] = id; stack[sp++] = q; }
      }
    }
    comps.push({ id, n, x0, y0, x1, y1, wdt: x1 - x0 + 1, hgt: y1 - y0 + 1 });
  }
  return { labels, comps };
}

/** Keep only the listed component ids. */
export function keep(img, labels, ids) {
  const set = new Set(ids);
  const out = new Uint8Array(img.w * img.h);
  for (let i = 0; i < out.length; i++) if (img.bin[i] && set.has(labels[i])) out[i] = 1;
  return { w: img.w, h: img.h, bin: out };
}
