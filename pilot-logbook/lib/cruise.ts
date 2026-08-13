/**
 * Cruise performance — PA-28-181, figures 5-21, 5-23 and 5-25.
 *
 * Three tables, one per power setting, each giving the RPM needed to hold that
 * percentage of rated power at a pressure altitude and temperature, with the
 * resulting true airspeed. Fuel flow is fixed per table: at best economy mixture
 * a given percentage of power burns a given amount, whatever the altitude.
 *
 * Altitude is entered, not picked. The tables step in even thousands, and a VFR
 * cruising altitude never lands on one — 5,500 and 7,500 are where you actually
 * fly, so RPM and true airspeed are interpolated between the two published
 * altitudes either side.
 *
 * Temperature stays a choice from what the book prints, because the printed ISA
 * deviations are the columns of the table and there is nothing between them to
 * interpolate along. Which deviations are on offer depends on the altitude: the
 * blocks narrow as you climb, so a warm day runs off the end of the table sooner
 * up high. Between two published altitudes only the deviations both of them
 * print are offered, so every answer is bracketed by four real rows.
 *
 * All of it is for 2,550 lb, which is the only weight Piper published.
 */

import { CRUISE_TABLES, type CruiseTable, type CruiseRow, type CruiseAltitude } from "./pa28-181-cruise.ts";

export { CRUISE_TABLES };
export type { CruiseTable, CruiseRow };

/** Standard atmosphere temperature at a pressure altitude. */
export const isaTempC = (altFt: number) => 15 - 1.98 * (altFt / 1000);

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const tableFor = (power: number) => CRUISE_TABLES.find((t) => t.power === power) ?? null;

/** Highest altitude a power setting is published at. */
export const ceilingFor = (power: number) => {
  const t = tableFor(power);
  return t ? t.altitudes[t.altitudes.length - 1].alt : 0;
};

/** The two published altitudes an entered one sits between (equal if exact). */
export function bracket(power: number, altFt: number): [CruiseAltitude, CruiseAltitude] | null {
  const alts = tableFor(power)?.altitudes;
  if (!alts?.length) return null;
  if (altFt > alts[alts.length - 1].alt) return null;
  const clamped = Math.max(0, altFt);
  const exact = alts.find((a) => a.alt === clamped);
  if (exact) return [exact, exact];
  let i = 0;
  while (i < alts.length - 2 && alts[i + 1].alt < clamped) i++;
  return [alts[i], alts[i + 1]];
}

/**
 * The ISA deviations that can be read at this altitude.
 *
 * Between two published altitudes, only the ones both of them print: offering a
 * deviation the upper block does not carry would mean answering from one row
 * and a guess, and the reason the upper block stops is that the engine cannot
 * hold that power there.
 */
export function deviationsAt(power: number, altFt: number): number[] {
  const b = bracket(power, altFt);
  if (!b) return [];
  const [lo, hi] = b;
  const his = new Set(hi.rows.map((r) => r.isaDev));
  return lo.rows.map((r) => r.isaDev).filter((d) => his.has(d));
}

/** "ISA", "ISA −15", "ISA +7.5" — as the table heads the row. */
export function deviationLabel(isaDev: number): string {
  if (isaDev === 0) return "ISA";
  return `ISA ${isaDev < 0 ? "−" : "+"}${Math.abs(isaDev)}`;
}

export interface CruiseReading {
  figure: string;
  power: number;
  altFt: number;
  isaDev: number;
  /** Outside air temperature at this altitude and deviation. */
  oatC: number;
  rpm: number;
  ktas: number;
  gph: number;
  /** Nautical miles per gallon in still air. */
  nmPerGal: number;
  /** True when every figure came straight off one printed row. */
  exact: boolean;
  /** The published altitudes the answer was read between, when it was. */
  between?: [number, number];
  /** True when the block prints no TAS for this deviation. */
  tasBetweenRows: boolean;
}

/** True airspeed for one row of one block, interpolating along the row if need be. */
function tasIn(block: CruiseAltitude, row: CruiseRow): { ktas: number; interpolated: boolean } {
  if (row.ktas !== null) return { ktas: row.ktas, interpolated: false };
  const cold = block.rows[0];
  const warm = block.rows[block.rows.length - 1];
  const span = warm.oatC - cold.oatC;
  const t = span === 0 ? 0 : (row.oatC - cold.oatC) / span;
  return { ktas: lerp(cold.ktas ?? 0, warm.ktas ?? 0, t), interpolated: true };
}

export type CruiseResult =
  | { ok: true; reading: CruiseReading }
  | { ok: false; reason: string };

/**
 * Read a power setting at an entered altitude and a printed ISA deviation.
 *
 * Refuses rather than extrapolates: above a table's last altitude the engine
 * cannot hold that power at all, and answering anyway would be inventing an
 * engine setting.
 */
export function readCruise(power: number, altFt: number, isaDev: number): CruiseResult {
  const table = tableFor(power);
  if (!table) return { ok: false, reason: `${power}% power is not one of the published tables.` };

  const ceiling = ceilingFor(power);
  if (altFt > ceiling) {
    return {
      ok: false,
      reason:
        `${power}% power is only published to ${ceiling.toLocaleString()} ft — the engine cannot ` +
        `hold it higher. Choose a lower altitude or a lower power setting.`,
    };
  }

  const b = bracket(power, altFt);
  if (!b) return { ok: false, reason: `No published altitudes for ${power}% power.` };
  const [lo, hi] = b;

  const loRow = lo.rows.find((r) => r.isaDev === isaDev);
  const hiRow = hi.rows.find((r) => r.isaDev === isaDev);
  if (!loRow || !hiRow) {
    return {
      ok: false,
      reason:
        `${deviationLabel(isaDev)} is not printed at ${Math.round(altFt).toLocaleString()} ft for ` +
        `${power}% power. The temperature band narrows as you climb.`,
    };
  }

  const alt = Math.max(0, altFt);
  const span = hi.alt - lo.alt;
  const t = span === 0 ? 0 : (alt - lo.alt) / span;

  const loTas = tasIn(lo, loRow);
  const hiTas = tasIn(hi, hiRow);
  const ktas = lerp(loTas.ktas, hiTas.ktas, t);
  const rpm = lerp(loRow.rpm, hiRow.rpm, t);

  const acrossAltitude = span !== 0;
  const tasBetweenRows = acrossAltitude ? loTas.interpolated || hiTas.interpolated : loTas.interpolated;

  return {
    ok: true,
    reading: {
      figure: table.figure,
      power: table.power,
      altFt: alt,
      isaDev,
      oatC: Math.round((isaTempC(alt) + isaDev) * 10) / 10,
      rpm: Math.round(rpm),
      ktas: Math.round(ktas * 10) / 10,
      gph: table.gph,
      nmPerGal: Math.round((ktas / table.gph) * 100) / 100,
      exact: !acrossAltitude && !loTas.interpolated,
      between: acrossAltitude ? [lo.alt, hi.alt] : undefined,
      tasBetweenRows,
    },
  };
}

/** Time and fuel for a leg flown at this setting, in still air. */
export function legFor(reading: CruiseReading, distanceNm: number) {
  const hours = reading.ktas > 0 ? distanceNm / reading.ktas : 0;
  return {
    hours,
    minutes: Math.round(hours * 60),
    gallons: Math.round(hours * reading.gph * 10) / 10,
  };
}
