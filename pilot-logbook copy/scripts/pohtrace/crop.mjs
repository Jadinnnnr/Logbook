import * as mupdf from "mupdf";
import fs from "fs";
export function crop(img, x0, y0, x1, y1, file, scale = 1) {
  const w = x1 - x0, h = y1 - y0;
  const pm = new mupdf.Pixmap(mupdf.ColorSpace.DeviceGray, [0, 0, Math.round(w*scale), Math.round(h*scale)], false);
  const px = pm.getPixels(), s = pm.getStride(), N = pm.getNumberOfComponents();
  for (let y = 0; y < Math.round(h*scale); y++) for (let x = 0; x < Math.round(w*scale); x++) {
    const sx = x0 + Math.floor(x/scale), sy = y0 + Math.floor(y/scale);
    px[y*s + x*N] = img.bin[sy*img.w + sx] ? 0 : 255;
  }
  fs.writeFileSync(file, pm.asPNG());
}
