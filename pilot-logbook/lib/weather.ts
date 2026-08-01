import "server-only";

/**
 * Current METAR and TAF from the FAA/NOAA Aviation Weather Center public API.
 * This is the one piece of live data in the app — everything else is local — so
 * every failure path returns a message rather than throwing: a weather outage
 * must never take the page down.
 */

const API = "https://aviationweather.gov/api/data";
/** Observations change on their own schedule; a short cache keeps us polite. */
const REVALIDATE_SECONDS = 120;

export type FlightCategory = "VFR" | "MVFR" | "IFR" | "LIFR" | "UNKNOWN";

export interface Metar {
  raw: string;
  observedAt: string | null;
  category: FlightCategory;
  windDir: number | null;
  windSpeed: number | null;
  windGust: number | null;
  visibility: string | null;
  temperatureC: number | null;
  dewpointC: number | null;
  altimeterInHg: number | null;
  clouds: { cover: string; baseFtAgl: number | null }[];
  station: string | null;
}

export interface Taf {
  raw: string;
  issuedAt: string | null;
  validFrom: string | null;
  validTo: string | null;
}

export interface WeatherResult {
  metar: Metar | null;
  taf: Taf | null;
  /** Set when the service couldn't be reached or returned nothing usable. */
  error: string | null;
}

interface RawMetar {
  rawOb?: string;
  reportTime?: string;
  obsTime?: number;
  fltCat?: string;
  wdir?: number | string;
  wspd?: number;
  wgst?: number;
  visib?: number | string;
  temp?: number;
  dewp?: number;
  altim?: number;
  clouds?: { cover?: string; base?: number | null }[];
  name?: string;
}

interface RawTaf {
  rawTAF?: string;
  issueTime?: string;
  validTimeFrom?: number;
  validTimeTo?: number;
}

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, {
    headers: { "User-Agent": "pilot-logbook/1.0 (personal logbook app)" },
    next: { revalidate: REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`${res.status} from the weather service`);
  const text = await res.text();
  if (!text.trim()) return null;
  return JSON.parse(text) as T;
}

function epochToIso(seconds: number | undefined): string | null {
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;
}

function toCategory(value: string | undefined): FlightCategory {
  const v = (value ?? "").toUpperCase();
  return v === "VFR" || v === "MVFR" || v === "IFR" || v === "LIFR" ? v : "UNKNOWN";
}

/** The API reports altimeter in hectopascals; US pilots read inches of mercury. */
function hPaToInHg(hpa: number | undefined): number | null {
  if (typeof hpa !== "number" || !isFinite(hpa)) return null;
  return Math.round((hpa / 33.8638866667) * 100) / 100;
}

export async function fetchWeather(icaoId: string): Promise<WeatherResult> {
  const id = icaoId.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(id)) {
    return { metar: null, taf: null, error: null };
  }

  try {
    const [metarRows, tafRows] = await Promise.all([
      getJson<RawMetar[]>(`${API}/metar?ids=${id}&format=json`),
      getJson<RawTaf[]>(`${API}/taf?ids=${id}&format=json`),
    ]);

    const m = Array.isArray(metarRows) ? metarRows[0] : undefined;
    const t = Array.isArray(tafRows) ? tafRows[0] : undefined;

    const metar: Metar | null = m?.rawOb
      ? {
          raw: m.rawOb,
          observedAt: m.reportTime ?? epochToIso(m.obsTime),
          category: toCategory(m.fltCat),
          windDir: typeof m.wdir === "number" ? m.wdir : null,
          windSpeed: typeof m.wspd === "number" ? m.wspd : null,
          windGust: typeof m.wgst === "number" ? m.wgst : null,
          visibility: m.visib === undefined ? null : String(m.visib),
          temperatureC: typeof m.temp === "number" ? m.temp : null,
          dewpointC: typeof m.dewp === "number" ? m.dewp : null,
          altimeterInHg: hPaToInHg(m.altim),
          clouds: (m.clouds ?? [])
            .filter((c) => c.cover)
            .map((c) => ({ cover: c.cover as string, baseFtAgl: c.base ?? null })),
          station: m.name ?? null,
        }
      : null;

    const taf: Taf | null = t?.rawTAF
      ? {
          raw: t.rawTAF,
          issuedAt: t.issueTime ?? null,
          validFrom: epochToIso(t.validTimeFrom),
          validTo: epochToIso(t.validTimeTo),
        }
      : null;

    if (!metar && !taf) {
      return { metar: null, taf: null, error: `No current report published for ${id}.` };
    }
    return { metar, taf, error: null };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "unknown error";
    return { metar: null, taf: null, error: `Couldn't reach the weather service (${reason}).` };
  }
}

/** "18 minutes ago" — staleness matters more than the exact timestamp here. */
export function relativeTime(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!isFinite(then)) return null;
  const minutes = Math.round((now - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/**
 * Split a raw TAF into its change groups, one per line: the initial forecast
 * first, then each FM / BECMG / TEMPO / PROB / INTER period. Run together as a
 * single paragraph a TAF is genuinely hard to read, and the line breaks are how
 * it's presented on every official product.
 */
export function tafLines(raw: string): string[] {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+(?=(?:FM\d{4,6}|BECMG|TEMPO|PROB\d{2}|INTER)\b)/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function cloudLabel(cover: string): string {
  const map: Record<string, string> = {
    SKC: "Sky clear", CLR: "Clear", CAVOK: "CAVOK", FEW: "Few", SCT: "Scattered",
    BKN: "Broken", OVC: "Overcast", OVX: "Obscured",
  };
  return map[cover.toUpperCase()] ?? cover;
}
