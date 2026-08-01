/**
 * Colour maths for the custom accent. A colour the user picks is used both as a
 * button fill (with text on top of it) and as link text (on a page surface), so
 * it has to clear WCAG AA against both. Rather than reject a choice, we keep its
 * hue and saturation and walk its lightness until it passes — separately for
 * light and dark mode, which need opposite adjustments.
 */

export const LIGHT_SURFACE = "#fcfcfb";
export const DARK_SURFACE = "#1a1a19";

export interface DerivedAccent {
  light: string;
  lightHover: string;
  dark: string;
  darkHover: string;
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return [(rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255];
}

function channelLuminance(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function shiftLightness(hex: string, delta: number): string {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  const [r, g, b] = hslToRgb(h, s, Math.max(0, Math.min(100, l + delta)));
  return rgbToHex(r, g, b);
}

/** Walk lightness in `step` increments until the colour clears `target` against `bg`. */
function adjustForContrast(hex: string, bg: string, target: number, step: number): string {
  let current = hex;
  for (let i = 0; i < 120; i++) {
    if (contrastRatio(current, bg) >= target) return current;
    const next = shiftLightness(current, step);
    if (next === current) break; // hit pure black or white
    current = next;
  }
  return current;
}

/**
 * Light and dark steps for a user-picked colour, each clearing 4.5:1 against
 * the surface it sits on. That threshold also covers the button case, since the
 * button's text (white on light, near-black on dark) contrasts more strongly
 * with the fill than the surface does.
 */
export function deriveAccent(hex: string): DerivedAccent {
  const light = adjustForContrast(hex, LIGHT_SURFACE, 4.5, -2);
  const dark = adjustForContrast(hex, DARK_SURFACE, 4.5, 2);
  return {
    light,
    lightHover: shiftLightness(light, -8),
    dark,
    darkHover: shiftLightness(dark, 8),
  };
}
