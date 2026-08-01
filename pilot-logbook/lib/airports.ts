import "server-only";
import airportsData from "./airports-data.json";
import navdata from "./navdata-data.json";

// [lat, lon, name] keyed by ICAO ident / GPS code / IATA / local code,
// built from the public-domain OurAirports dataset by scripts/build-airports.mjs.
const AIRPORTS = airportsData as unknown as Record<string, [number, number, string]>;

// US fixes, navaids, and airway sequences from FAA NASR data,
// built by scripts/build-navdata.mjs.
const NAVDATA = navdata as unknown as {
  fixes: Record<string, [number, number]>;
  navs: Record<string, [number, number]>;
  airways: Record<string, [string, number, number][]>;
};

export type PointKind = "airport" | "fix" | "navaid";

export interface AirportPoint {
  ident: string;
  lat: number;
  lon: number;
  name: string;
  kind: PointKind;
}

export function lookupAirport(code: string): AirportPoint | null {
  const c = code.trim().toUpperCase();
  if (!c) return null;
  // Try the code as given, then the US convention of a K-prefixed 3-letter ident.
  const hit = AIRPORTS[c] ?? (c.length === 3 ? AIRPORTS["K" + c] : undefined);
  if (!hit) return null;
  const ident = AIRPORTS[c] ? c : "K" + c;
  return { ident, lat: hit[0], lon: hit[1], name: hit[2], kind: "airport" };
}

/** Resolve a route token: GPS fix, then VOR/NDB, then airport. */
function lookupWaypoint(code: string): AirportPoint | null {
  const c = code.trim().toUpperCase();
  if (!c) return null;
  const fix = NAVDATA.fixes[c];
  if (fix) return { ident: c, lat: fix[0], lon: fix[1], name: "Fix", kind: "fix" };
  const nav = NAVDATA.navs[c];
  if (nav) return { ident: c, lat: nav[0], lon: nav[1], name: "Navaid", kind: "navaid" };
  return lookupAirport(c);
}

// Filler tokens that appear in route strings but aren't waypoints.
const ROUTE_NOISE = new Set(["DCT", "DIRECT", "IFR", "VFR", "VIA", "THEN", "TO", "RADAR"]);

/**
 * Expand an airway between an entry and exit point: returns the intermediate
 * airway points (exclusive) in the direction of flight, or [] if either end
 * isn't on the airway.
 */
function expandAirway(airway: string, entry: AirportPoint, exit: AirportPoint): AirportPoint[] {
  const seq = NAVDATA.airways[airway];
  if (!seq) return [];
  const i = seq.findIndex(([k]) => k === entry.ident);
  const j = seq.findIndex(([k]) => k === exit.ident);
  if (i === -1 || j === -1 || i === j) return [];
  const step = i < j ? 1 : -1;
  const out: AirportPoint[] = [];
  for (let n = i + step; n !== j; n += step) {
    const [k, lat, lon] = seq[n];
    out.push({ ident: k, lat, lon, name: `On ${airway}`, kind: NAVDATA.fixes[k] ? "fix" : "navaid" });
  }
  return out;
}

/**
 * Resolve a flight's path: from → route waypoints → to. Route tokens may be
 * GPS fixes, VORs/NDBs, airports, or airways (V/J/T/Q); an airway between two
 * resolvable points is expanded along its published sequence. Unknown tokens
 * (SIDs/STARs, prose) are skipped. US navdata only.
 */
export function resolveRoute(from: string, route: string, to: string): AirportPoint[] {
  const rawTokens = route
    .toUpperCase()
    .split(/[\s,;>→]+/)
    .map((t) => t.trim())
    .filter((t) => t && !ROUTE_NOISE.has(t) && /^[A-Z0-9]{1,7}$/.test(t));

  // First pass: resolve points, remembering pending airway tokens between them.
  interface Item { point?: AirportPoint; airway?: string }
  const items: Item[] = [];
  const fromPt = lookupAirport(from);
  if (fromPt) items.push({ point: fromPt });
  for (const t of rawTokens) {
    if (NAVDATA.airways[t]) {
      items.push({ airway: t });
      continue;
    }
    const p = lookupWaypoint(t);
    if (p) items.push({ point: p });
  }
  const toPt = lookupAirport(to);
  if (toPt) items.push({ point: toPt });

  // Second pass: expand airways that sit between two resolved points.
  const points: AirportPoint[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.point) {
      if (points.length === 0 || points[points.length - 1].ident !== it.point.ident) {
        points.push(it.point);
      }
    } else if (it.airway) {
      const prev = points[points.length - 1];
      const next = items.slice(i + 1).find((x) => x.point)?.point;
      if (prev && next) {
        for (const p of expandAirway(it.airway, prev, next)) points.push(p);
      }
    }
  }
  return points;
}

/** Great-circle distance in nautical miles. */
export function distanceNm(a: AirportPoint, b: AirportPoint): number {
  const R = 3440.065; // earth radius in nm
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function routeDistanceNm(points: AirportPoint[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += distanceNm(points[i - 1], points[i]);
  return Math.round(d);
}
