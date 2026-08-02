/**
 * Performance arithmetic. Pure functions with no database or server imports so
 * the calculator can run in the browser and so the numbers can be unit-tested.
 *
 * Everything here is standard-atmosphere maths — it tells you the conditions,
 * not what the aeroplane will do in them. Takeoff and landing distances come
 * only from interpolating numbers the pilot copies out of their own AFM/POH;
 * this file deliberately contains no model of aircraft performance, because any
 * such model would be a guess dressed up as a number.
 */

/** ISA sea level: 15 °C, 29.92126 inHg, lapse 1.98 °C per 1,000 ft. */
export const ISA_SEA_LEVEL_C = 15;
export const ISA_PRESSURE_INHG = 29.92126;

/** Pressure altitude from field elevation and the altimeter setting. */
export function pressureAltitude(fieldElevFt: number, altimeterInHg: number): number {
  return fieldElevFt + 145366.45 * (1 - Math.pow(altimeterInHg / ISA_PRESSURE_INHG, 0.190284));
}

/** Standard-atmosphere temperature at a pressure altitude. */
export function isaTempC(pressureAltFt: number): number {
  return ISA_SEA_LEVEL_C - 1.98 * (pressureAltFt / 1000);
}

/**
 * Density altitude from pressure altitude and outside air temperature, via the
 * density ratio of the standard atmosphere (dry air).
 */
export function densityAltitude(pressureAltFt: number, oatC: number): number {
  const tempK = oatC + 273.15;
  // Pressure ratio at the pressure altitude.
  const delta = Math.pow(1 - 6.87559e-6 * pressureAltFt, 5.2558797);
  const sigma = delta / (tempK / 288.15);
  return 145442.156 * (1 - Math.pow(sigma, 0.234969));
}

export interface WindComponents {
  /** Positive is a headwind, negative a tailwind. */
  headwind: number;
  /** Always positive; `from` says which side it's blowing from. */
  crosswind: number;
  from: "left" | "right" | "none";
  /** Angle between the runway and the wind, 0–180°. */
  angle: number;
}

export function windComponents(
  runwayHeading: number,
  windDir: number,
  windSpeed: number
): WindComponents {
  // Signed difference in [-180, 180]: negative means the wind is off the left.
  const diff = ((windDir - runwayHeading + 540) % 360) - 180;
  const rad = (diff * Math.PI) / 180;
  const headwind = windSpeed * Math.cos(rad);
  const cross = windSpeed * Math.sin(rad);
  return {
    headwind,
    crosswind: Math.abs(cross),
    from: Math.abs(cross) < 0.05 ? "none" : cross > 0 ? "right" : "left",
    angle: Math.abs(diff),
  };
}

/** Runway number ("9", "27L", "36") to its nominal heading in degrees. */
export function runwayHeadingFromIdent(ident: string): number | null {
  const m = ident.match(/^(\d{1,2})/);
  if (!m) return null;
  const n = Number(m[1]);
  if (n < 1 || n > 36) return null;
  return n * 10;
}

/**
 * Bilinear interpolation between the four AFM/POH table values that bracket the
 * actual pressure altitude and temperature. Returns null unless the two axis
 * pairs are distinct, since interpolating between equal bounds is meaningless.
 *
 * Values outside the entered bracket are NOT extrapolated — the AFM's own
 * warning applies, and reading past the end of a chart is how people run off
 * the end of runways.
 */
export interface PohCorners {
  paLow: number;
  paHigh: number;
  tempLow: number;
  tempHigh: number;
  /** Distances at (paLow,tempLow), (paLow,tempHigh), (paHigh,tempLow), (paHigh,tempHigh). */
  lowLow: number;
  lowHigh: number;
  highLow: number;
  highHigh: number;
}

export type InterpolationResult =
  | { ok: true; distance: number; extrapolated: false }
  | { ok: false; reason: string };

export function interpolatePoh(
  c: PohCorners,
  pressureAltFt: number,
  oatC: number
): InterpolationResult {
  const finite = Object.values(c).every((v) => Number.isFinite(v));
  if (!finite) return { ok: false, reason: "Fill in all four table values and their headings." };
  if (c.paHigh === c.paLow) return { ok: false, reason: "The two pressure altitudes must differ." };
  if (c.tempHigh === c.tempLow) return { ok: false, reason: "The two temperatures must differ." };

  const inRange = (v: number, a: number, b: number) => v >= Math.min(a, b) && v <= Math.max(a, b);
  if (!inRange(pressureAltFt, c.paLow, c.paHigh)) {
    return {
      ok: false,
      reason: `Pressure altitude ${Math.round(pressureAltFt).toLocaleString()} ft is outside ${c.paLow.toLocaleString()}–${c.paHigh.toLocaleString()} ft — use the table rows that bracket it.`,
    };
  }
  if (!inRange(oatC, c.tempLow, c.tempHigh)) {
    return {
      ok: false,
      reason: `${oatC} °C is outside ${c.tempLow}–${c.tempHigh} °C — use the table columns that bracket it.`,
    };
  }

  const fp = (pressureAltFt - c.paLow) / (c.paHigh - c.paLow);
  const ft = (oatC - c.tempLow) / (c.tempHigh - c.tempLow);
  const atLow = c.lowLow + (c.lowHigh - c.lowLow) * ft;
  const atHigh = c.highLow + (c.highHigh - c.highLow) * ft;
  return { ok: true, distance: atLow + (atHigh - atLow) * fp, extrapolated: false };
}

/** Apply the pilot's own AFM correction notes, each as a percentage. */
export function applyCorrections(distance: number, percents: number[]): number {
  return percents.reduce((d, p) => d * (1 + p / 100), distance);
}
